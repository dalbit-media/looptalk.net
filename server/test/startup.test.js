const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const startup = (statuses = [0, 0]) => {
  const calls = [];
  const stop = new Error("process exited");
  let exitCode;
  let started = false;
  const filename = path.join(__dirname, "..", "scripts", "start.js");
  const requireMock = (name) => {
    if (name === "node:child_process") {
      return { spawnSync: (_command, args, options) => {
        calls.push({ args, options });
        return { status: statuses[calls.length - 1] };
      } };
    }
    if (name === "node:fs") return { existsSync: () => false };
    if (name === "node:path") return path;
    if (name === "node:perf_hooks") return { performance: { now: () => 0 } };
    if (name === "../src/config/load-environment") return { loadEnvironment() {} };
    if (name === "../src/server") { started = true; return {}; }
    throw new Error(`Unexpected import: ${name}`);
  };
  requireMock.resolve = (name) => name;
  try {
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
      require: requireMock,
      __dirname: path.dirname(filename),
      console: { log() {} },
      process: {
        execPath: process.execPath,
        argv: [],
        env: {},
        exit: (code) => { exitCode = code; throw stop; },
      },
    }, { filename });
  } catch (error) {
    if (error !== stop) throw error;
  }
  return { calls, started, exitCode };
};

test("startup generates the current Prisma client before schema push and server loading", () => {
  const result = startup();
  assert.deepEqual(Array.from(result.calls[0].args), [
    "prisma/build/index.js", "generate", "--schema", "prisma/schema.prisma",
  ]);
  assert.deepEqual(Array.from(result.calls[1].args), [
    "prisma/build/index.js", "db", "push", "--skip-generate", "--schema", "prisma/schema.prisma",
  ]);
  assert.equal(result.calls[0].options.cwd, path.resolve(__dirname, ".."));
  assert.equal(result.started, true);
});

test("failed client generation prevents schema changes and server loading", () => {
  const result = startup([1]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 1);
  assert.equal(result.started, false);
});

test("failed schema synchronization prevents server loading", () => {
  const result = startup([0, 1]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.started, false);
});

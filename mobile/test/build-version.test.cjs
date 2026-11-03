const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const buildLabel = require("../src/config/buildLabel");

const fixture = (env = {}) => {
  let version = "0.0.0";
  const labels = [], commands = [];
  const files = new Map([
    ["package.json", '{"version":"0.0.0"}'],
    ["package-lock.json", '{"version":"0.0.0","packages":{"":{"version":"0.0.0"},"dependency":{"version":"9.0.0"}}}'],
  ]);
  const run = () => vm.runInNewContext(fs.readFileSync(path.join(root, "scripts", "bump-build.js"), "utf8"), {
    __dirname: path.join(root, "scripts"),
    process: { env },
    console: { log: (message) => labels.push(message) },
    require: (name) => {
      if (name === "node:path") return path;
      if (name === "node:fs") return {
        readFileSync: (file) => files.get(path.basename(file)),
        writeFileSync: (file, value) => files.set(path.basename(file), value),
      };
      if (name === "node:child_process") return { execSync: (command) => {
        commands.push(command);
        version = `0.0.${Number(version.split(".")[2]) + 1}`;
        return version;
      } };
      if (name === "../mobile/src/config/buildLabel") return buildLabel;
      if (name === path.join(root, "package.json")) return { version };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { run, files, labels, commands };
};

test("successive local, CI and EAS builds advance the displayed number and desktop manifests", () => {
  for (const env of [{}, { CI: "true" }, { EAS_BUILD: "true" }]) {
    const f = fixture(env);
    for (let index = 1; index <= 3; index++) {
      f.run();
      assert.equal(f.labels[index - 1], `LoopTalk build v.0${index} (0.0.${index})`);
      assert.equal(JSON.parse(f.files.get("package.json")).version, `0.0.${index}`);
      const lock = JSON.parse(f.files.get("package-lock.json"));
      assert.equal(lock.version, `0.0.${index}`);
      assert.equal(lock.packages[""].version, `0.0.${index}`);
      assert.equal(lock.packages.dependency.version, "9.0.0");
    }
    assert.equal(f.commands.length, 3);
  }
});

test("only explicit combined-release reuse avoids a second version increment", () => {
  const f = fixture({ CI: "true", LOOPTALK_REUSE_BUILD_VERSION: "1" });
  f.run();
  assert.equal(f.commands.length, 0);
  assert.equal(f.labels[0], "LoopTalk build v.00 (0.0.0)");
});

test("normal web build and direct mobile export each bump once, with no root-export double bump", () => {
  const main = require("../../package.json").scripts;
  const mobile = require("../package.json").scripts;
  assert.equal(main.build, "npm run version:bump && node scripts/build-web.js");
  assert.equal(main["export:web"], "npm run export:web --prefix mobile");
  assert.match(mobile["export:web"], /^node \.\.\/scripts\/bump-build\.js && expo export/);
  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
  assert.match(dockerfile, /COPY scripts \.\/scripts/);
  assert.match(dockerfile, /COPY desktop\/package\.json desktop\/package-lock\.json \.\/desktop\//);
  assert.match(dockerfile, /RUN npm run build/);
  assert.doesNotMatch(dockerfile, /RUN npm run export:web/);
});

test("combined web build shares one increment across Expo and Next builds", () => {
  const calls = [];
  const requireMock = (name) => name === "node:path" ? path : { spawnSync: (_command, args, options) => {
    calls.push({ args: Array.from(args), reuse: options.env.LOOPTALK_REUSE_BUILD_VERSION });
    return { status: 0 };
  } };
  requireMock.resolve = () => "next-cli.js";
  vm.runInNewContext(fs.readFileSync(path.join(root, "scripts", "build-web.js"), "utf8"), {
    __dirname: path.join(root, "scripts"),
    process: { execPath: "node", env: { npm_execpath: "npm-cli.js" }, exit: () => assert.fail("Unexpected failure") },
    require: requireMock,
  });
  assert.deepEqual(calls, [
    { args: ["npm-cli.js", "run", "export:web", "--prefix", "mobile"], reuse: "1" },
    { args: ["next-cli.js", "build", "--webpack"], reuse: "1" },
  ]);
  assert.equal(require("../../package.json").scripts["release:prepare"], "npm run check && npm run build");
});

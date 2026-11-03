const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    cwd: root, stdio: "inherit",
    env: { ...process.env, LOOPTALK_REUSE_BUILD_VERSION: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

run([process.env.npm_execpath, "run", "export:web", "--prefix", "mobile"]);
run([require.resolve("next/dist/bin/next"), "build", "--webpack"]);

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(projectRoot, "..");
const sourceRoot = path.join(projectRoot, "src");
const appRoot = path.join(repositoryRoot, "app");
const publicSiteRoot = path.join(repositoryRoot, "public", "site");

const collectJavaScriptFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collectJavaScriptFiles(entryPath)
      : entry.name.endsWith(".js")
        ? [entryPath]
        : [];
  });

const run = (command, args, environment = process.env) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
};

const sourceFiles = collectJavaScriptFiles(sourceRoot);
const nextFiles = [
  ...collectJavaScriptFiles(appRoot),
  path.join(repositoryRoot, "next.config.js"),
];
[...sourceFiles, path.join(repositoryRoot, "next.config.js")]
  .forEach((file) => run(process.execPath, ["--check", file]));
const publicSiteFiles = collectJavaScriptFiles(publicSiteRoot);
publicSiteFiles.forEach((file) => run(process.execPath, ["--check", file]));

const siteRuntimeSource = fs.readFileSync(path.join(publicSiteRoot, "site.js"), "utf8");
const translationSource = fs.readFileSync(
  path.join(publicSiteRoot, "site-i18n.js"),
  "utf8"
);
const translationKeys = new Set([
  ...[...nextFiles
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n")
    .matchAll(/(?:data-i18n(?:-aria-label|-title)?|labelKey)="([^"]+)/g)]
    .map((match) => match[1]),
  ...[...siteRuntimeSource.matchAll(/translate\(\s*"([^"]+)/g)]
    .map((match) => match[1]),
]);
const translationContext = { window: {} };
require("node:vm").runInNewContext(translationSource, translationContext);
const translations = translationContext.window.LoopTalkSiteI18n;
["en", "ko", "ja"].forEach((language) => {
  const missingKeys = [...translationKeys].filter((key) => !translations[language]?.[key]);
  if (missingKeys.length) {
    throw new Error(`${language} site translations missing: ${missingKeys.join(", ")}`);
  }
});

const prismaConstructors = sourceFiles.filter((file) =>
  fs.readFileSync(file, "utf8").includes("new PrismaClient")
);
const expectedPrismaClient = path.join(sourceRoot, "db", "client.js");
if (
  prismaConstructors.length !== 1 ||
  prismaConstructors[0] !== expectedPrismaClient
) {
  throw new Error("PrismaClient must only be constructed in src/db/client.js");
}

run(process.execPath, ["--test"]);

const prismaCli = require.resolve("prisma/build/index.js");
run(process.execPath, [prismaCli, "validate", "--schema", "prisma/schema.prisma"], {
  ...process.env,
  DATABASE_URL: "file:./check.db",
});

console.log(
  `Checked ${sourceFiles.length + nextFiles.length} server source files, ${publicSiteFiles.length} site scripts, and ${translationKeys.size} translated strings.`
);
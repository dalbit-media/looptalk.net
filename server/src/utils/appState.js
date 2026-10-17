const fs = require("node:fs");
const path = require("node:path");

const databasePath = (environment = process.env) => {
  const value = environment.DATABASE_URL;
  if (typeof value !== "string" || !value.startsWith("file:")) {
    throw new Error("Application reset requires a persistent SQLite file DATABASE_URL");
  }
  const filename = value.slice(5).split("?")[0];
  if (!filename || filename === ":memory:") throw new Error("DATABASE_URL must name a persistent SQLite file");
  // Prisma treats SQLite filenames as paths relative to its schema, not decoded URLs.
  return path.resolve(__dirname, "../../prisma", filename);
};

const appStatePath = (environment = process.env) => `${databasePath(environment)}.app-state.json`;
const readAppState = (environment = process.env) => {
  const filename = appStatePath(environment);
  let contents;
  try {
    contents = fs.readFileSync(filename, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { resetId: "initial" };
    throw error;
  }
  const state = JSON.parse(contents);
  if (typeof state.resetId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(state.resetId)) {
    throw new Error("Invalid application reset marker");
  }
  return { resetId: state.resetId };
};

module.exports = { databasePath, appStatePath, readAppState };

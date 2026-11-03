const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { addNullableUniqueColumns, nullableUniqueColumns } = require("../scripts/prepare-schema");

const schema = `
model User {
  id          String  @id
  name        String
  bio         String?
  newKey      String? @unique
  newCount    Int?    @unique
  withDefault String? @unique @default("x")
  required    String  @unique
}

model Invite {
  id     String  @id
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id])
}

model Missing {
  id    String  @id
  token String? @unique
}
`;

test("startup adds only new optional unique scalar columns, once, keeping existing rows", () => {
  assert.deepEqual(nullableUniqueColumns(schema).map(({ table, column }) => `${table}.${column}`),
    ["User.newKey", "User.newCount", "Missing.token"]);

  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "bio" TEXT, "newCount" INTEGER);
    INSERT INTO "User" ("id", "name") VALUES ('a', 'Ann'), ('b', 'Ben');
    CREATE TABLE "Invite" ("id" TEXT PRIMARY KEY);`);

  assert.deepEqual(addNullableUniqueColumns(database, schema), ["User.newKey"]);
  assert.deepEqual(addNullableUniqueColumns(database, schema), []);

  const columns = database.prepare(`PRAGMA table_info("User")`).all().map(({ name, type }) => `${name}:${type}`);
  assert.ok(columns.includes("newKey:TEXT"));
  assert.ok(!columns.some((column) => column.startsWith("withDefault:")));
  const index = database.prepare(`PRAGMA index_list("User")`).all().find(({ name }) => name === "User_newKey_key");
  assert.equal(index?.unique, 1);
  assert.deepEqual(database.prepare(`SELECT "id", "newKey" FROM "User" ORDER BY "id"`).all().map((row) => ({ ...row })),
    [{ id: "a", newKey: null }, { id: "b", newKey: null }]);
  assert.throws(() => database.exec(`UPDATE "User" SET "newKey" = 'same'`), /UNIQUE/);
  assert.equal(database.prepare(`PRAGMA table_info("Invite")`).all().length, 1);
  database.close();
});

// `prisma db push` treats every new @unique column as possible data loss and stops for
// confirmation (or fails when not interactive), even though a brand-new optional column is
// all NULL and SQLite allows many NULLs in a unique index. Creating those columns and their
// indexes first, exactly as Prisma would, leaves push nothing risky to warn about.
const SQLITE_TYPES = {
  String: "TEXT", Int: "INTEGER", BigInt: "BIGINT", Float: "REAL",
  Boolean: "BOOLEAN", DateTime: "DATETIME", Decimal: "DECIMAL", Bytes: "BLOB",
};

const quote = (name) => `"${name.replace(/"/g, '""')}"`;

const nullableUniqueColumns = (schema) => {
  const columns = [];
  for (const [, model, body] of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    if (/@@map\b/.test(body)) continue;
    const relationFields = new Set([...body.matchAll(/@relation\([^)]*fields:\s*\[([^\]]*)\]/g)]
      .flatMap(([, fields]) => fields.split(",").map((field) => field.trim())));
    for (const [, field, type, attributes] of body.matchAll(/^[ \t]*(\w+)[ \t]+(\w+)\?[ \t]+([^\r\n]*)$/gm)) {
      if (!/@unique\b/.test(attributes) || /@(default|map|id)\b/.test(attributes)) continue;
      if (!SQLITE_TYPES[type] || relationFields.has(field)) continue;
      columns.push({ table: model, column: field, type: SQLITE_TYPES[type] });
    }
  }
  return columns;
};

const addNullableUniqueColumns = (database, schema) => {
  const added = [];
  for (const { table, column, type } of nullableUniqueColumns(schema)) {
    const existing = database.prepare(`PRAGMA table_info(${quote(table)})`).all();
    if (!existing.length || existing.some(({ name }) => name === column)) continue;
    database.exec("BEGIN");
    try {
      database.exec(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(column)} ${type}`);
      database.exec(`CREATE UNIQUE INDEX ${quote(`${table}_${column}_key`)} ON ${quote(table)}(${quote(column)})`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    added.push(`${table}.${column}`);
  }
  return added;
};

module.exports = { addNullableUniqueColumns, nullableUniqueColumns };

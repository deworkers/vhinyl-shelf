import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "vinyl.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schemaPath = path.resolve(process.cwd(), "src", "db", "schema.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf-8");
db.exec(schemaSql);

export default db;

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hashPassword, validUsername, validPassword } from "../auth/passwords.js";

const dbDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "vinyl.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schemaSql = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf-8");
const legacy = db.prepare("PRAGMA table_info(records)").all().length > 0
  && !db.prepare("PRAGMA table_info(records)").all().some((column) => column.name === "user_id");

if (legacy) {
  const backupPath = path.join(dbDir, `vinyl-before-auth-${Date.now()}.sqlite`);
  await db.backup(backupPath);
  const backup = new Database(backupPath);
  backup.pragma("journal_mode = DELETE");
  backup.close();
  console.log(`Database backup saved to ${backupPath}`);
}

db.exec(schemaSql);

if (!db.prepare("SELECT id FROM users WHERE role = 'admin'").get()) {
  const username = process.env.ADMIN_USERNAME || "admin";
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || randomBytes(24).toString("base64url");
  if (!validUsername(username) || !validPassword(password)) {
    throw new Error("ADMIN_USERNAME must be 3–40 Latin letters/digits/_.-; ADMIN_PASSWORD must be 12–128 characters");
  }
  const passwordHash = await hashPassword(password);
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')").run(username, passwordHash);
  if (generated) {
    const credentialsPath = path.join(dbDir, "admin-credentials.txt");
    fs.writeFileSync(credentialsPath, `Username: ${username}\nPassword: ${password}\n`, { mode: 0o600 });
    console.log(`Initial admin credentials saved to ${credentialsPath}`);
  }
}

if (legacy) {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  // Rebuild both tables together to remove the old global Discogs UNIQUE constraint.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec("ALTER TABLE uploads RENAME TO uploads_legacy; ALTER TABLE records RENAME TO records_legacy;");
      db.exec(schemaSql);
      const columns = db.prepare("PRAGMA table_info(records_legacy)").all().map(({ name }) => `"${name}"`).join(", ");
      db.prepare(`INSERT INTO records (user_id, ${columns}) SELECT ?, ${columns} FROM records_legacy`).run(admin.id);
      const uploadColumns = db.prepare("PRAGMA table_info(uploads_legacy)").all().map(({ name }) => `"${name}"`).join(", ");
      db.prepare(`INSERT INTO uploads (user_id, ${uploadColumns}) SELECT ?, ${uploadColumns} FROM uploads_legacy`).run(admin.id);
      db.exec("DROP TABLE uploads_legacy; DROP TABLE records_legacy;");
      if (db.pragma("foreign_key_check").length) throw new Error("Migration failed foreign key validation");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

db.exec("CREATE INDEX IF NOT EXISTS uploads_user_id ON uploads(user_id)");

export default db;

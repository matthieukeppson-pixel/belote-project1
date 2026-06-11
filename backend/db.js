import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDbPath = path.join(__dirname, "belote.db");
const dbPath = process.env.BELOTE_DB_PATH
  ? path.resolve(process.env.BELOTE_DB_PATH)
  : defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

console.log(`Base SQLite utilisée : ${dbPath}`);

const db = new sqlite3.Database(dbPath);

function ensureUserColumns() {
  db.all("PRAGMA table_info(users)", (err, columns = []) => {
    if (err) {
      console.error("Erreur lecture structure table users", err);
      return;
    }

    const existingColumns = new Set(columns.map((column) => column.name));

    const migrations = [
      [
        "role",
        "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'",
      ],
      [
        "is_approved",
        "ALTER TABLE users ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 0",
      ],
      [
        "approved_at",
        "ALTER TABLE users ADD COLUMN approved_at DATETIME",
      ],
      [
        "is_banned",
        "ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0",
      ],
      [
        "ban_reason",
        "ALTER TABLE users ADD COLUMN ban_reason TEXT",
      ],
      [
        "banned_at",
        "ALTER TABLE users ADD COLUMN banned_at DATETIME",
      ],
    ];

    for (const [columnName, sql] of migrations) {
      if (existingColumns.has(columnName)) continue;

      db.run(sql, (migrationErr) => {
        if (migrationErr) {
          console.error(`Erreur migration colonne users.${columnName}`, migrationErr);
          return;
        }

        console.log(`Migration SQLite OK: users.${columnName}`);
      });
    }
  });
}

db.serialize(() => {
  db.run(
    `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    (err) => {
      if (err) {
        console.error("Erreur création table users", err);
        return;
      }

      ensureUserColumns();
    }
  );
});

export default db;

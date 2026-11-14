import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

export function createDb(path: string = ":memory:"): Db {
  const db = new DatabaseSync(path);
  // WAL + synchronous=NORMAL: las escrituras (un INSERT por click) no hacen fsync completo cada vez.
  // foreign_keys: necesario para que ON DELETE CASCADE borre los clicks de una URL eliminada.
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      name          TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS urls (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT    NOT NULL UNIQUE,
      long_url   TEXT    NOT NULL,
      user_id    INTEGER REFERENCES users(id),
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS clicks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id     INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
      clicked_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_clicks_url_time ON clicks(url_id, clicked_at);
  `);
  migrate(db);
  return db;
}

/** Migra bases de datos creadas antes de urls.user_id y urls.expires_at. */
function migrate(db: Db): void {
  const columns = db.prepare("PRAGMA table_info(urls)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "user_id")) {
    db.exec("ALTER TABLE urls ADD COLUMN user_id INTEGER REFERENCES users(id)");
  }
  // expires_at: ISO 8601 UTC con milisegundos (comparable como texto); NULL = no caduca.
  if (!columns.some((c) => c.name === "expires_at")) {
    db.exec("ALTER TABLE urls ADD COLUMN expires_at TEXT");
  }
  // Va aquí (no en el CREATE inicial) porque en bases antiguas user_id se añade arriba.
  db.exec("CREATE INDEX IF NOT EXISTS idx_urls_user ON urls(user_id)");
}

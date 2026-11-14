import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db.js";

const dir = mkdtempSync(join(tmpdir(), "snap-db-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("createDb", () => {
  it("migra una base de datos antigua añadiendo urls.user_id sin perder datos", () => {
    const path = join(dir, "antigua.db");
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        long_url TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      INSERT INTO urls (code, long_url) VALUES ('abc1234', 'https://example.com');
    `);
    old.close();

    const db = createDb(path);
    const cols = db.prepare("PRAGMA table_info(urls)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("user_id");
    const row = db.prepare("SELECT code, user_id FROM urls").get() as {
      code: string;
      user_id: number | null;
    };
    expect(row).toMatchObject({ code: "abc1234", user_id: null });
    db.close();
  });

  it("añade urls.expires_at a una base anterior: las URLs existentes no caducan", () => {
    const path = join(dir, "sin-expires.db");
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE urls (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
        long_url TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT 'x', user_id INTEGER);
      INSERT INTO urls (code, long_url) VALUES ('abc1234', 'https://example.com');
    `);
    old.close();

    const db = createDb(path);
    const cols = db.prepare("PRAGMA table_info(urls)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("expires_at");
    expect(db.prepare("SELECT expires_at FROM urls").get()).toMatchObject({ expires_at: null });
    db.close();
  });

  it("es idempotente: abrir dos veces la misma base no falla", () => {
    const path = join(dir, "nueva.db");
    createDb(path).close();
    expect(() => createDb(path).close()).not.toThrow();
  });

  it("una base antigua gana la tabla clicks y los índices sin perder datos", () => {
    const path = join(dir, "sin-clicks.db");
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT 'x');
      CREATE TABLE urls (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
        long_url TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT 'x', user_id INTEGER REFERENCES users(id));
      INSERT INTO urls (code, long_url) VALUES ('abc1234', 'https://example.com');
    `);
    old.close();

    const db = createDb(path);
    const names = (type: string) =>
      (db.prepare("SELECT name FROM sqlite_master WHERE type = ?").all(type) as { name: string }[]).map(
        (r) => r.name,
      );
    expect(names("table")).toContain("clicks");
    expect(names("index")).toEqual(expect.arrayContaining(["idx_clicks_url_time", "idx_urls_user"]));
    expect(db.prepare("SELECT COUNT(*) AS c FROM urls").get()).toMatchObject({ c: 1 });
    db.close();
  });

  it("activa foreign_keys (necesario para ON DELETE CASCADE)", () => {
    const db = createDb(":memory:");
    expect(db.prepare("PRAGMA foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
  });

  it("usa WAL en bases de datos en disco", () => {
    const db = createDb(join(dir, "wal.db"));
    expect(db.prepare("PRAGMA journal_mode").get()).toMatchObject({ journal_mode: "wal" });
    db.close();
  });
});

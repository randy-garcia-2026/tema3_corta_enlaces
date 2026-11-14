import type { Db } from "../../db.js";

export interface UrlRecord {
  id: number;
  code: string;
  longUrl: string;
  /** null en URLs creadas antes de existir la autenticación. */
  userId: number | null;
  createdAt: string;
  /** Instante (ISO 8601 UTC) a partir del cual deja de redirigir; null si no caduca. */
  expiresAt: string | null;
}

interface UrlRow {
  id: number;
  code: string;
  long_url: string;
  user_id: number | null;
  created_at: string;
  expires_at: string | null;
}

function toRecord(row: UrlRow): UrlRecord {
  return {
    id: row.id,
    code: row.code,
    longUrl: row.long_url,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export interface UrlWithStats extends UrlRecord {
  /** Total de clicks recibidos (todo el histórico). */
  clicks: number;
  /** Fecha del último click, o null si nunca se ha usado. */
  lastClickAt: string | null;
}

interface UrlStatsRow extends UrlRow {
  clicks: number;
  last_click_at: string | null;
}

export interface UrlsRepository {
  insert(code: string, longUrl: string, userId: number, expiresAt: string | null): UrlRecord;
  findByCode(code: string): UrlRecord | undefined;
  /** URLs del usuario, la más reciente primero, con sus estadísticas de clicks. */
  findByUserWithStats(userId: number): UrlWithStats[];
  deleteByCode(code: string): void;
}

const COLUMNS = "id, code, long_url, user_id, created_at, expires_at";

export function createUrlsRepository(db: Db): UrlsRepository {
  const insertStmt = db.prepare(
    `INSERT INTO urls (code, long_url, user_id, expires_at) VALUES (?, ?, ?, ?) RETURNING ${COLUMNS}`,
  );
  const byCodeStmt = db.prepare(`SELECT ${COLUMNS} FROM urls WHERE code = ?`);
  const byUserStmt = db.prepare(`
    SELECT u.id, u.code, u.long_url, u.user_id, u.created_at, u.expires_at,
           COUNT(c.id) AS clicks, MAX(c.clicked_at) AS last_click_at
    FROM urls u LEFT JOIN clicks c ON c.url_id = u.id
    WHERE u.user_id = ?
    GROUP BY u.id
    ORDER BY u.id DESC
  `);
  const deleteStmt = db.prepare("DELETE FROM urls WHERE code = ?");

  return {
    insert: (code, longUrl, userId, expiresAt) =>
      toRecord(insertStmt.get(code, longUrl, userId, expiresAt) as unknown as UrlRow),
    findByCode: (code) => {
      const row = byCodeStmt.get(code) as unknown as UrlRow | undefined;
      return row ? toRecord(row) : undefined;
    },
    findByUserWithStats: (userId) =>
      (byUserStmt.all(userId) as unknown as UrlStatsRow[]).map((row) => ({
        ...toRecord(row),
        clicks: row.clicks,
        lastClickAt: row.last_click_at,
      })),
    deleteByCode: (code) => {
      deleteStmt.run(code);
    },
  };
}

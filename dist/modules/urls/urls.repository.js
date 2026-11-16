function toRecord(row) {
    return {
        id: row.id,
        code: row.code,
        longUrl: row.long_url,
        userId: row.user_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
    };
}
const COLUMNS = "id, code, long_url, user_id, created_at, expires_at";
export function createUrlsRepository(db) {
    const insertStmt = db.prepare(`INSERT INTO urls (code, long_url, user_id, expires_at) VALUES (?, ?, ?, ?) RETURNING ${COLUMNS}`);
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
        insert: (code, longUrl, userId, expiresAt) => toRecord(insertStmt.get(code, longUrl, userId, expiresAt)),
        findByCode: (code) => {
            const row = byCodeStmt.get(code);
            return row ? toRecord(row) : undefined;
        },
        findByUserWithStats: (userId) => byUserStmt.all(userId).map((row) => ({
            ...toRecord(row),
            clicks: row.clicks,
            lastClickAt: row.last_click_at,
        })),
        deleteByCode: (code) => {
            deleteStmt.run(code);
        },
    };
}
//# sourceMappingURL=urls.repository.js.map
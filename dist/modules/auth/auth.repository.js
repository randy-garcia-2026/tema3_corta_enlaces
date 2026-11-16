function toRecord(row) {
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        name: row.name,
        createdAt: row.created_at,
    };
}
export function createAuthRepository(db) {
    const insertStmt = db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?) RETURNING id, email, password_hash, name, created_at");
    const byEmailStmt = db.prepare("SELECT id, email, password_hash, name, created_at FROM users WHERE email = ?");
    return {
        insert: (email, passwordHash, name) => toRecord(insertStmt.get(email, passwordHash, name)),
        findByEmail: (email) => {
            const row = byEmailStmt.get(email);
            return row ? toRecord(row) : undefined;
        },
    };
}
//# sourceMappingURL=auth.repository.js.map
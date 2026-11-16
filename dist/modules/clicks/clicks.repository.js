export function createClicksRepository(db) {
    const insertStmt = db.prepare("INSERT INTO clicks (url_id) VALUES (?)");
    return {
        insert: (urlId) => {
            insertStmt.run(urlId);
        },
    };
}
//# sourceMappingURL=clicks.repository.js.map
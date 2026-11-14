import type { Db } from "../../db.js";

export interface ClicksRepository {
  /** Registra un click sobre la URL indicada, con la hora actual en UTC. */
  insert(urlId: number): void;
}

export function createClicksRepository(db: Db): ClicksRepository {
  const insertStmt = db.prepare("INSERT INTO clicks (url_id) VALUES (?)");
  return {
    insert: (urlId) => {
      insertStmt.run(urlId);
    },
  };
}

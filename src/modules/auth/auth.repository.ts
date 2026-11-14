import type { Db } from "../../db.js";

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    createdAt: row.created_at,
  };
}

export interface AuthRepository {
  insert(email: string, passwordHash: string, name: string): UserRecord;
  findByEmail(email: string): UserRecord | undefined;
}

export function createAuthRepository(db: Db): AuthRepository {
  const insertStmt = db.prepare(
    "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?) RETURNING id, email, password_hash, name, created_at",
  );
  const byEmailStmt = db.prepare(
    "SELECT id, email, password_hash, name, created_at FROM users WHERE email = ?",
  );

  return {
    insert: (email, passwordHash, name) =>
      toRecord(insertStmt.get(email, passwordHash, name) as unknown as UserRow),
    findByEmail: (email) => {
      const row = byEmailStmt.get(email) as unknown as UserRow | undefined;
      return row ? toRecord(row) : undefined;
    },
  };
}

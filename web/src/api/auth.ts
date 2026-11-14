import { request } from "./client";
import type { AuthResult } from "./types";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

const post = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const login = (input: LoginInput): Promise<AuthResult> =>
  post<AuthResult>("/auth/login", input);

export const register = (input: RegisterInput): Promise<AuthResult> =>
  post<AuthResult>("/auth/register", input);

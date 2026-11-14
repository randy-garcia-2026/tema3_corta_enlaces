import { vi } from "vitest";
import type { UrlItem, User } from "../api/types";

export const USER: User = { id: 1, email: "ana@example.com", name: "Ana", createdAt: "2026-11-14T10:00:00.000Z" };

/** JWT con la forma real (header.payload.firma); la SPA solo lee `exp`. */
export function fakeJwt(expiresInSeconds = 3600): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${b64({ alg: "HS256" })}.${b64({ sub: "1", email: USER.email, exp })}.firma`;
}

export function storeSession(token = fakeJwt()): string {
  localStorage.setItem("snap.session", JSON.stringify({ token, user: USER }));
  return token;
}

export function makeUrl(code: string, extra: Partial<UrlItem> = {}): UrlItem {
  return {
    id: Math.floor(Math.random() * 1e6),
    code,
    longUrl: `https://example.com/${code}`,
    shortUrl: `http://localhost:3000/${code}`,
    userId: 1,
    createdAt: "2026-11-14T10:00:00.000Z",
    clicks: 0,
    lastClickAt: null,
    expiresAt: null,
    expired: false,
    ...extra,
  };
}

export interface Call {
  method: string;
  path: string;
  authorization: string | null;
  body: unknown;
}

/** Sustituye fetch por una API en memoria. `GET /urls` devuelve `urls` (más las creadas por POST). */
export interface MockOptions {
  /** Estados HTTP de error que devolverá GET /urls, uno por llamada, antes de responder bien. */
  listFailures?: number[];
  /** Si se indica, POST /urls falla así: un estado HTTP o "network" (fetch rechaza). */
  createFailure?: number | "network";
}

export function mockApi(urls: UrlItem[], options: MockOptions = {}) {
  const listFailures = [...(options.listFailures ?? [])];
  const calls: Call[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = String(input);
      const method = init.method ?? "GET";
      const headers = new Headers(init.headers);
      const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
      calls.push({ method, path, authorization: headers.get("authorization"), body });

      if (path === "/urls" && method === "GET") {
        const failure = listFailures.shift();
        if (failure === 401) return json(401, { error: "Token expirado" });
        if (failure !== undefined) return json(failure, {});
        return json(200, urls);
      }
      if (path === "/urls" && method === "POST") {
        if (options.createFailure === "network") throw new TypeError("Failed to fetch");
        if (options.createFailure !== undefined) return json(options.createFailure, {});
        const alias = typeof body?.["alias"] === "string" ? body["alias"] : undefined;
        if (alias === "ocupado") return json(409, { error: "El alias ya está en uso" });
        const expiresAt = typeof body?.["expiresAt"] === "string" ? body["expiresAt"] : null;
        const created = makeUrl(alias ?? "AbC1234", { longUrl: String(body?.["url"]), expiresAt });
        urls.unshift(created);
        return json(201, created);
      }
      if (path === "/auth/login" && method === "POST") {
        if (body?.["password"] !== "clave-segura-1") return json(401, { error: "Credenciales incorrectas" });
        return json(200, { user: USER, token: fakeJwt() });
      }
      if (path === "/auth/register" && method === "POST") {
        if (body?.["email"] === "ana@example.com") return json(409, { error: "El email ya está registrado" });
        return json(201, { user: USER, token: fakeJwt() });
      }
      return json(404, { error: "no mock" });
    }),
  );
  return calls;
}

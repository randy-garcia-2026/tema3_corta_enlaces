import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDb, type Db } from "../src/db.js";
import { bearer, close, listen, registerUser } from "./helpers.js";

// Reloj mutable: cada test avanza el tiempo en vez de esperar.
let current = new Date("2026-11-14T12:00:00.000Z");
const advanceTo = (iso: string): void => {
  current = new Date(iso);
};

let db: Db;
let server: Server;
let baseUrl: string;
let ana: { token: string; id: number };

interface UrlDto {
  id: number;
  code: string;
  expiresAt: string | null;
  expired: boolean;
  clicks: number;
}

beforeAll(async () => {
  db = createDb(":memory:");
  server = createApp({ db, jwtSecret: "secreto-de-test", now: () => current }).listen(0);
  baseUrl = await listen(server);
  ana = await registerUser(baseUrl, "ana@example.com");
});

afterAll(() => close(server));

const post = (body: unknown) =>
  fetch(`${baseUrl}/urls`, {
    method: "POST",
    headers: { "content-type": "application/json", ...bearer(ana.token) },
    body: JSON.stringify(body),
  });

const create = async (extra: Record<string, unknown>): Promise<UrlDto> =>
  (await post({ url: "https://example.com/destino", ...extra })).json() as Promise<UrlDto>;

const list = async (): Promise<UrlDto[]> =>
  (await fetch(`${baseUrl}/urls`, { headers: bearer(ana.token) })).json() as Promise<UrlDto[]>;

const visit = (code: string, method = "GET") =>
  fetch(`${baseUrl}/${code}`, { method, redirect: "manual" });

const clicksOf = (id: number): number =>
  (db.prepare("SELECT COUNT(*) AS c FROM clicks WHERE url_id = ?").get(id) as { c: number }).c;

describe("POST /urls con expiresAt", () => {
  it("sin expiresAt (u omitido/null) la URL no caduca", async () => {
    for (const extra of [{}, { expiresAt: null }]) {
      const data = await create(extra);
      expect(data).toMatchObject({ expiresAt: null, expired: false });
    }
  });

  it("guarda la fecha normalizada a UTC con milisegundos", async () => {
    const data = await create({ expiresAt: "2026-11-20T10:00:00+02:00" });
    expect(data).toMatchObject({ expiresAt: "2026-11-20T08:00:00.000Z", expired: false });
  });

  it("acepta fecha sin segundos (como envía un datetime-local)", async () => {
    const data = await create({ expiresAt: "2026-11-20T10:30Z" });
    expect(data.expiresAt).toBe("2026-11-20T10:30:00.000Z");
  });

  it.each([
    ["mañana", "texto libre"],
    ["2026-11-20", "solo fecha, sin hora"],
    ["2026-11-20T10:00:00", "sin zona horaria"],
    ["2026-13-45T10:00:00Z", "fecha imposible"],
    [123, "no es texto"],
    ["", "vacío"],
    ["2026-11-14T11:59:59Z", "en el pasado"],
    ["2026-11-14T12:00:00Z", "exactamente ahora"],
  ] as [unknown, string][])("400 con expiresAt %j (%s) y no crea nada", async (expiresAt) => {
    const before = (await list()).length;
    const res = await post({ url: "https://example.com", expiresAt });
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
    expect((await list()).length).toBe(before);
  });

  it("también se valida cuando se usa alias", async () => {
    const res = await post({ url: "https://example.com", alias: "con-fecha", expiresAt: "ayer" });
    expect(res.status).toBe(400);
  });
});

describe("GET /:code con la URL caducada", () => {
  it("redirige y cuenta clicks mientras no caduca; después responde 410 sin contar", async () => {
    advanceTo("2026-11-14T12:00:00.000Z");
    const url = await create({ expiresAt: "2026-11-14T13:00:00.000Z" });

    advanceTo("2026-11-14T12:59:59.999Z"); // un instante antes
    expect((await visit(url.code)).status).toBe(302);
    expect(clicksOf(url.id)).toBe(1);

    advanceTo("2026-11-14T13:00:00.000Z"); // exactamente en la caducidad: ya expirada
    const res = await visit(url.code);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "Este enlace ha expirado" });
    expect(res.headers.get("location")).toBeNull();
    expect(clicksOf(url.id)).toBe(1); // el 410 no suma
  });

  it("HEAD también responde 410", async () => {
    advanceTo("2026-11-14T12:00:00.000Z");
    const url = await create({ expiresAt: "2026-11-14T12:30:00.000Z" });
    advanceTo("2026-11-15T00:00:00.000Z");
    expect((await visit(url.code, "HEAD")).status).toBe(410);
  });

  it("una URL sin caducidad nunca expira, pase el tiempo que pase", async () => {
    advanceTo("2026-11-14T12:00:00.000Z");
    const url = await create({});
    advanceTo("2036-01-01T00:00:00.000Z");
    expect((await visit(url.code)).status).toBe(302);
  });
});

describe("GET /urls y DELETE con URLs caducadas", () => {
  it("marca expired y conserva sus clicks y su expiresAt", async () => {
    advanceTo("2026-11-14T12:00:00.000Z");
    const url = await create({ expiresAt: "2026-11-14T18:00:00.000Z" });
    await visit(url.code);
    await visit(url.code);

    let item = (await list()).find((u) => u.code === url.code);
    expect(item).toMatchObject({ expired: false, clicks: 2, expiresAt: "2026-11-14T18:00:00.000Z" });

    advanceTo("2026-11-14T18:00:01.000Z");
    item = (await list()).find((u) => u.code === url.code);
    expect(item).toMatchObject({ expired: true, clicks: 2, expiresAt: "2026-11-14T18:00:00.000Z" });
  });

  it("el propietario puede borrar una URL caducada", async () => {
    advanceTo("2026-11-14T12:00:00.000Z");
    const url = await create({ expiresAt: "2026-11-14T12:30:00.000Z" });
    advanceTo("2026-11-15T12:00:00.000Z");
    const res = await fetch(`${baseUrl}/urls/${url.code}`, {
      method: "DELETE",
      headers: bearer(ana.token),
    });
    expect(res.status).toBe(204);
    expect((await visit(url.code)).status).toBe(404);
  });
});

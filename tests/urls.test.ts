import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db.js";
import { bearer, close, listen, registerUser } from "./helpers.js";

let server: Server;
let baseUrl: string;
let ana: { token: string; id: number };
let bruno: { token: string; id: number };

beforeAll(async () => {
  server = createApp({ db: createDb(":memory:"), jwtSecret: "secreto-de-test" }).listen(0);
  baseUrl = await listen(server);
  ana = await registerUser(baseUrl, "ana@example.com");
  bruno = await registerUser(baseUrl, "bruno@example.com");
});

afterAll(() => close(server));

interface UrlDto {
  code: string;
  longUrl: string;
  shortUrl: string;
  userId: number;
  clicks: number;
  lastClickAt: string | null;
}

const list = async (token: string): Promise<UrlDto[]> =>
  (await fetch(`${baseUrl}/urls`, { headers: bearer(token) })).json() as Promise<UrlDto[]>;

const post = (body: unknown, token?: string) =>
  fetch(`${baseUrl}/urls`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? bearer(token) : {}) },
    body: JSON.stringify(body),
  });

const create = async (url: string, token: string = ana.token): Promise<UrlDto> =>
  (await post({ url }, token)).json() as Promise<UrlDto>;

const del = (code: string, token?: string) =>
  fetch(`${baseUrl}/urls/${code}`, {
    method: "DELETE",
    headers: token ? bearer(token) : {},
  });

describe("POST /urls", () => {
  it("crea un código corto aleatorio para una URL válida", async () => {
    const res = await post({ url: "https://example.com/una/ruta/larga?x=1" }, ana.token);
    expect(res.status).toBe(201);
    const data = (await res.json()) as UrlDto;
    expect(data.code).toMatch(/^[A-Za-z0-9_-]{7}$/);
    expect(data.longUrl).toBe("https://example.com/una/ruta/larga?x=1");
    expect(data.shortUrl).toBe(`${baseUrl}/${data.code}`);
  });

  it("asocia la URL al usuario autenticado", async () => {
    const a = await create("https://example.com/de-ana", ana.token);
    const b = await create("https://example.com/de-bruno", bruno.token);
    expect(a.userId).toBe(ana.id);
    expect(b.userId).toBe(bruno.id);
  });

  it.each([
    ["www.google.es", "https://www.google.es/"],
    ["  google.es/ruta?x=1 ", "https://google.es/ruta?x=1"],
    ["//google.es", "https://google.es/"],
    ["localhost:3000/ruta", "https://localhost:3000/ruta"],
    ["http://example.com", "http://example.com/"],
    ["HTTPS://example.com", "https://example.com/"],
  ])("añade https:// si falta: %j", async (entrada, esperada) => {
    const res = await post({ url: entrada }, ana.token);
    expect(res.status).toBe(201);
    expect(((await res.json()) as UrlDto).longUrl).toBe(esperada);
  });

  it("genera códigos distintos para cada petición", async () => {
    const a = await create("https://example.com");
    const b = await create("https://example.com");
    expect(a.code).not.toBe(b.code);
  });

  it("401 sin token y no guarda nada", async () => {
    const before = (await list(ana.token)).length;
    const res = await post({ url: "https://example.com/anonimo" });
    expect(res.status).toBe(401);
    expect((await list(ana.token)).length).toBe(before);
  });

  it("401 con token inválido", async () => {
    const res = await post({ url: "https://example.com" }, "token-falso");
    expect(res.status).toBe(401);
  });

  it.each([
    [{}],
    [{ url: 123 }],
    [{ url: "no es una url" }],
    [{ url: "javascript:alert(1)" }],
    [{ url: "ftp://example.com" }],
    [{ url: "mailto:alguien@example.com" }],
    [{ url: "" }],
  ])("rechaza con 400 el cuerpo %j", async (body) => {
    const res = await post(body, ana.token);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });
});

describe("GET /:code (público)", () => {
  it("redirige con 302 a la URL original sin necesidad de token", async () => {
    const { code } = await create("https://example.com/destino");
    const res = await fetch(`${baseUrl}/${code}`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/destino");
  });

  it("responde 404 si el código no existe", async () => {
    const res = await fetch(`${baseUrl}/noexiste`, { redirect: "manual" });
    expect(res.status).toBe(404);
  });

  it("no tapa a /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
  });
});

describe("POST /urls con alias", () => {
  it("usa el alias como código y la URL corta lo incluye", async () => {
    const res = await post({ url: "https://example.com/alias", alias: "mi-enlace_1" }, ana.token);
    expect(res.status).toBe(201);
    const data = (await res.json()) as UrlDto;
    expect(data.code).toBe("mi-enlace_1");
    expect(data.shortUrl).toBe(`${baseUrl}/mi-enlace_1`);
    const redirect = await fetch(`${baseUrl}/mi-enlace_1`, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("https://example.com/alias");
  });

  it("recorta los espacios del alias", async () => {
    const res = await post({ url: "https://example.com/trim", alias: "  con-espacios  " }, ana.token);
    expect(res.status).toBe(201);
    expect(((await res.json()) as UrlDto).code).toBe("con-espacios");
  });

  it("alias null equivale a no pasar alias (código aleatorio)", async () => {
    const res = await post({ url: "https://example.com/null", alias: null }, ana.token);
    expect(res.status).toBe(201);
    expect(((await res.json()) as UrlDto).code).toMatch(/^[A-Za-z0-9_-]{7}$/);
  });

  it("409 si el alias ya existe (también si es de otro usuario) y no se crea nada", async () => {
    await post({ url: "https://example.com/uno", alias: "ocupado" }, ana.token);
    const before = (await list(bruno.token)).length;
    const res = await post({ url: "https://example.com/dos", alias: "ocupado" }, bruno.token);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "El alias ya está en uso" });
    expect((await list(bruno.token)).length).toBe(before);
  });

  it("distingue mayúsculas: 'Ocupado' y 'ocupado' son alias distintos", async () => {
    const res = await post({ url: "https://example.com/may", alias: "Ocupado" }, ana.token);
    expect(res.status).toBe(201);
  });

  it.each([
    ["ab", "demasiado corto"],
    ["a".repeat(33), "demasiado largo"],
    ["con espacio", "espacio"],
    ["ñandú", "caracteres no ASCII"],
    ["a/b", "barra"],
    ["", "vacío"],
    [123, "no es texto"],
    ["health", "reservado"],
    ["Dashboard", "reservado (sin distinguir mayúsculas)"],
    ["urls", "reservado"],
    ["app", "reservado"],
    ["auth", "reservado"],
  ] as [unknown, string][])("400 con alias %j (%s)", async (alias) => {
    const res = await post({ url: "https://example.com/mal", alias }, ana.token);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("una URL inválida sigue siendo 400 aunque el alias sea válido", async () => {
    const res = await post({ url: "javascript:alert(1)", alias: "valido-ok" }, ana.token);
    expect(res.status).toBe(400);
  });
});

describe("GET /urls (autenticado)", () => {
  it("401 sin token o con token inválido", async () => {
    expect((await fetch(`${baseUrl}/urls`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/urls`, { headers: bearer("falso") })).status).toBe(401);
  });

  it("solo devuelve las URLs del usuario, la más reciente primero, con shortUrl", async () => {
    const created = await create("https://example.com/ultima", bruno.token);
    const mine = await list(bruno.token);
    expect(mine[0]).toMatchObject({
      code: created.code,
      longUrl: "https://example.com/ultima",
      userId: bruno.id,
      shortUrl: `${baseUrl}/${created.code}`,
    });
    expect(mine.every((u) => u.userId === bruno.id)).toBe(true);
    expect((await list(ana.token)).some((u) => u.code === created.code)).toBe(false);
  });

  it("incluye clicks y lastClickAt (0 y null si nadie la ha usado)", async () => {
    const fresh = await create("https://example.com/sin-clicks");
    expect((await list(ana.token))[0]).toMatchObject({ code: fresh.code, clicks: 0, lastClickAt: null });
  });

  it("cuenta los clicks de cada URL por separado", async () => {
    const a = await create("https://example.com/cuenta-a");
    const b = await create("https://example.com/cuenta-b");
    for (let i = 0; i < 3; i++) await fetch(`${baseUrl}/${a.code}`, { redirect: "manual" });
    await fetch(`${baseUrl}/${b.code}`, { redirect: "manual" });
    const mine = await list(ana.token);
    const byCode = new Map(mine.map((u) => [u.code, u]));
    expect(byCode.get(a.code)?.clicks).toBe(3);
    expect(byCode.get(b.code)?.clicks).toBe(1);
    expect(byCode.get(a.code)?.lastClickAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });

  it("un usuario sin URLs recibe []", async () => {
    const nuevo = await registerUser(baseUrl, "sin-urls@example.com");
    expect(await list(nuevo.token)).toEqual([]);
  });
});

describe("DELETE /urls/:code", () => {
  it("204: el propietario borra su URL y el redirect deja de funcionar", async () => {
    const { code } = await create("https://example.com/borrar", ana.token);
    const res = await del(code, ana.token);
    expect(res.status).toBe(204);
    const after = await fetch(`${baseUrl}/${code}`, { redirect: "manual" });
    expect(after.status).toBe(404);
    expect((await list(ana.token)).some((u) => u.code === code)).toBe(false);
  });

  it("403: otro usuario no puede borrarla y la URL sigue existiendo", async () => {
    const { code } = await create("https://example.com/ajena", ana.token);
    const res = await del(code, bruno.token);
    expect(res.status).toBe(403);
    expect(await res.json()).toHaveProperty("error");
    const still = await fetch(`${baseUrl}/${code}`, { redirect: "manual" });
    expect(still.status).toBe(302);
  });

  it("401: sin token no borra nada", async () => {
    const { code } = await create("https://example.com/protegida");
    const res = await del(code);
    expect(res.status).toBe(401);
    const still = await fetch(`${baseUrl}/${code}`, { redirect: "manual" });
    expect(still.status).toBe(302);
  });

  it("404: el código no existe", async () => {
    const res = await del("noexiste", ana.token);
    expect(res.status).toBe(404);
  });
});

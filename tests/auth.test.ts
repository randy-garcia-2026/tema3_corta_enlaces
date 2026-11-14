import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db.js";

const SECRET = "secreto-de-test";
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp({ db: createDb(":memory:"), jwtSecret: SECRET }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

interface AuthBody {
  user: { id: number; email: string; name: string; createdAt: string };
  token: string;
}

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const valid = { email: "ana@example.com", password: "clave-segura-1", name: "Ana" };

describe("POST /auth/register", () => {
  it("201: devuelve el usuario (sin hash) y un token válido", async () => {
    const res = await post("/auth/register", valid);
    expect(res.status).toBe(201);
    const body = (await res.json()) as AuthBody;
    expect(body.user).toMatchObject({ email: "ana@example.com", name: "Ana" });
    expect(typeof body.user.id).toBe("number");
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i);
    const payload = jwt.verify(body.token, SECRET) as jwt.JwtPayload;
    expect(payload.sub).toBe(String(body.user.id));
  });

  it("409: email ya registrado, también con otras mayúsculas", async () => {
    const res = await post("/auth/register", { ...valid, email: "ANA@example.com" });
    expect(res.status).toBe(409);
    expect(await res.json()).toHaveProperty("error");
  });

  it.each([
    ["email sin arroba", { ...valid, email: "ana.example.com" }],
    ["email vacío", { ...valid, email: "" }],
    ["email que no es texto", { ...valid, email: 42 }],
    ["email ausente", { password: valid.password, name: valid.name }],
    ["password muy corto", { ...valid, email: "b@example.com", password: "corta" }],
    ["password demasiado largo", { ...valid, email: "b@example.com", password: "x".repeat(73) }],
    ["password que no es texto", { ...valid, email: "b@example.com", password: 12345678 }],
    ["name vacío", { ...valid, email: "b@example.com", name: "   " }],
    ["name ausente", { email: "b@example.com", password: valid.password }],
  ])("400: %s", async (_caso, body) => {
    const res = await post("/auth/register", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("400: cuerpo vacío", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, { method: "POST" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("200: devuelve el usuario y un token válido", async () => {
    const res = await post("/auth/login", { email: valid.email, password: valid.password });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthBody;
    expect(body.user).toMatchObject({ email: "ana@example.com", name: "Ana" });
    expect(jwt.verify(body.token, SECRET)).toMatchObject({ email: "ana@example.com" });
  });

  it("200: acepta el email en mayúsculas", async () => {
    const res = await post("/auth/login", { email: "ANA@EXAMPLE.COM", password: valid.password });
    expect(res.status).toBe(200);
  });

  it("401: password incorrecto", async () => {
    const res = await post("/auth/login", { email: valid.email, password: "incorrecta" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Credenciales incorrectas" });
  });

  it("401: email inexistente, con el mismo mensaje que password incorrecto", async () => {
    const res = await post("/auth/login", { email: "nadie@example.com", password: valid.password });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Credenciales incorrectas" });
  });

  it.each([
    ["sin password", { email: valid.email }],
    ["sin email", { password: valid.password }],
    ["campos que no son texto", { email: 1, password: 2 }],
    ["cuerpo vacío", {}],
  ])("400: %s", async (_caso, body) => {
    const res = await post("/auth/login", body);
    expect(res.status).toBe(400);
  });
});

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthMiddleware } from "../src/modules/auth/auth.middleware.js";

const SECRET = "secreto-de-test";
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.get("/protegida", createAuthMiddleware(SECRET), (req, res) => {
    res.json({ user: req.user });
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

const get = (authorization?: string) =>
  fetch(`${baseUrl}/protegida`, {
    headers: authorization === undefined ? {} : { authorization },
  });

const sign = (options: jwt.SignOptions = {}, secret = SECRET) =>
  jwt.sign({ email: "ana@example.com" }, secret, { subject: "7", expiresIn: 3600, ...options });

describe("middleware de autenticación", () => {
  it("token válido: pasa y adjunta el usuario a la request", async () => {
    const res = await get(`Bearer ${sign()}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: 7, email: "ana@example.com" } });
  });

  it("acepta 'bearer' en minúsculas", async () => {
    const res = await get(`bearer ${sign()}`);
    expect(res.status).toBe(200);
  });

  it("sin header Authorization: 401", async () => {
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(await res.json()).toHaveProperty("error");
  });

  it("token expirado: 401", async () => {
    const res = await get(`Bearer ${sign({ expiresIn: -10 })}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Token expirado" });
  });

  it.each([
    ["texto que no es un JWT", "Bearer esto-no-es-un-jwt"],
    ["JWT con la firma alterada", `Bearer ${sign().slice(0, -3)}abc`],
    ["firmado con otro secreto", `Bearer ${sign({}, "otro-secreto")}`],
    ["algoritmo 'none'", `Bearer ${jwt.sign({ email: "a@b.c", sub: "7" }, "", { algorithm: "none" })}`],
    ["sin subject", `Bearer ${jwt.sign({ email: "a@b.c" }, SECRET)}`],
    ["esquema distinto de Bearer", `Basic ${sign()}`],
    ["solo la palabra Bearer", "Bearer"],
    ["token sin esquema", sign()],
  ])("%s: 401", async (_caso, header) => {
    const res = await get(header);
    expect(res.status).toBe(401);
    expect(await res.json()).toHaveProperty("error");
  });
});

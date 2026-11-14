import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createDb, type Db } from "../src/db.js";
import { bearer, close, listen, registerUser } from "./helpers.js";

let db: Db;
let server: Server;
let baseUrl: string;
let ana: { token: string; id: number };

beforeAll(async () => {
  db = createDb(":memory:");
  server = createApp({ db, jwtSecret: "secreto-de-test" }).listen(0);
  baseUrl = await listen(server);
  ana = await registerUser(baseUrl, "ana@example.com");
});

afterAll(() => close(server));

async function create(url: string): Promise<{ id: number; code: string }> {
  const res = await fetch(`${baseUrl}/urls`, {
    method: "POST",
    headers: { "content-type": "application/json", ...bearer(ana.token) },
    body: JSON.stringify({ url }),
  });
  return res.json() as Promise<{ id: number; code: string }>;
}

const countClicks = (urlId: number): number =>
  (db.prepare("SELECT COUNT(*) AS c FROM clicks WHERE url_id = ?").get(urlId) as { c: number }).c;

describe("registro de clicks en GET /:code", () => {
  it("cada GET registra un click, con hora UTC", async () => {
    const { id, code } = await create("https://example.com/contar");
    await fetch(`${baseUrl}/${code}`, { redirect: "manual" });
    await fetch(`${baseUrl}/${code}`, { redirect: "manual" });
    expect(countClicks(id)).toBe(2);
    const row = db.prepare("SELECT clicked_at FROM clicks WHERE url_id = ?").get(id) as {
      clicked_at: string;
    };
    expect(row.clicked_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });

  it("un HEAD no cuenta como click (pero redirige igual)", async () => {
    const { id, code } = await create("https://example.com/head");
    const res = await fetch(`${baseUrl}/${code}`, { method: "HEAD", redirect: "manual" });
    expect(res.status).toBe(302);
    expect(countClicks(id)).toBe(0);
  });

  it("un código inexistente no registra nada", async () => {
    const before = (db.prepare("SELECT COUNT(*) AS c FROM clicks").get() as { c: number }).c;
    const res = await fetch(`${baseUrl}/noexiste`, { redirect: "manual" });
    expect(res.status).toBe(404);
    const after = (db.prepare("SELECT COUNT(*) AS c FROM clicks").get() as { c: number }).c;
    expect(after).toBe(before);
  });

  it("borrar la URL borra sus clicks (ON DELETE CASCADE)", async () => {
    const { id, code } = await create("https://example.com/cascada");
    await fetch(`${baseUrl}/${code}`, { redirect: "manual" });
    expect(countClicks(id)).toBe(1);
    const del = await fetch(`${baseUrl}/urls/${code}`, {
      method: "DELETE",
      headers: bearer(ana.token),
    });
    expect(del.status).toBe(204);
    expect(countClicks(id)).toBe(0);
  });
});

describe("fallo al registrar el click", () => {
  it("no impide la redirección", async () => {
    const own = createDb(":memory:");
    const srv = createApp({ db: own, jwtSecret: "otro-secreto" }).listen(0);
    const url = await listen(srv);
    try {
      const user = await registerUser(url, "x@example.com");
      const created = (await (
        await fetch(`${url}/urls`, {
          method: "POST",
          headers: { "content-type": "application/json", ...bearer(user.token) },
          body: JSON.stringify({ url: "https://example.com/roto" }),
        })
      ).json()) as { code: string };

      own.exec("DROP TABLE clicks"); // el INSERT de clicks fallará
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await fetch(`${url}/${created.code}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://example.com/roto");
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    } finally {
      await close(srv);
    }
  });
});

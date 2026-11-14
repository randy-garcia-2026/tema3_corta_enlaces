import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDb, type Db } from "../src/db.js";
import { bearer, close, listen, registerUser } from "./helpers.js";

// Reloj fijo: sábado 2026-11-14 12:00 UTC. Con days=30 el periodo es 2026-10-16 → 2026-11-14.
const NOW = new Date("2026-11-14T12:00:00.000Z");

let db: Db;
let server: Server;
let baseUrl: string;
let ana: { token: string; id: number };
let bruno: { token: string; id: number };
let vacio: { token: string; id: number };

interface DashboardDto {
  timezone: string;
  period: { days: number; from: string; to: string };
  totals: { urls: number; clicks: number; urlsWithoutClicks: number };
  clicksByDay: { date: string; clicks: number }[];
  clicksByHour: { hour: number; clicks: number }[];
  periodComparison: { last7d: number; previous7d: number; changePct: number | null };
}

const getDashboard = (token?: string, query = "") =>
  fetch(`${baseUrl}/dashboard${query}`, { headers: token ? bearer(token) : {} });

const dashboardOf = async (token: string, query = ""): Promise<DashboardDto> =>
  (await getDashboard(token, query)).json() as Promise<DashboardDto>;

/** Crea una URL vía API y devuelve su id. */
async function createUrl(token: string, url: string): Promise<number> {
  const res = await fetch(`${baseUrl}/urls`, {
    method: "POST",
    headers: { "content-type": "application/json", ...bearer(token) },
    body: JSON.stringify({ url }),
  });
  return ((await res.json()) as { id: number }).id;
}

const addClicks = (urlId: number, ...dates: string[]): void => {
  const stmt = db.prepare("INSERT INTO clicks (url_id, clicked_at) VALUES (?, ?)");
  for (const d of dates) stmt.run(urlId, d);
};

beforeAll(async () => {
  db = createDb(":memory:");
  server = createApp({ db, jwtSecret: "secreto-de-test", now: () => NOW }).listen(0);
  baseUrl = await listen(server);
  ana = await registerUser(baseUrl, "ana@example.com");
  bruno = await registerUser(baseUrl, "bruno@example.com");
  vacio = await registerUser(baseUrl, "vacio@example.com");

  // Ana: 3 URLs (A y B con clicks, C sin ninguno).
  const a = await createUrl(ana.token, "https://example.com/a");
  const b = await createUrl(ana.token, "https://example.com/b");
  await createUrl(ana.token, "https://example.com/c");
  addClicks(
    a,
    "2026-11-14T09:00:00.000Z", // últimos 7 días, hora 9
    "2026-11-14T09:45:00.000Z", // últimos 7 días, hora 9
    "2026-11-10T09:30:00.000Z", // últimos 7 días, hora 9
    "2026-11-03T22:00:00.000Z", // 7 días previos, hora 22
    "2026-11-03T22:10:00.000Z", // 7 días previos, hora 22
    "2026-10-20T00:00:00.000Z", // dentro de 30 días, antes de las comparaciones, hora 0
    "2026-10-01T10:00:00.000Z", // fuera de los 30 días: solo cuenta en totals
  );
  addClicks(b, "2026-11-12T09:00:00.000Z"); // últimos 7 días, hora 9

  // Bruno: sus clicks no deben aparecer en el dashboard de Ana.
  const x = await createUrl(bruno.token, "https://example.com/de-bruno");
  addClicks(x, "2026-11-14T08:00:00.000Z", "2026-11-13T08:00:00.000Z", "2026-11-12T08:00:00.000Z");

  // URL huérfana (sin propietario, anterior a la autenticación) con clicks: no es de nadie.
  db.exec("INSERT INTO urls (code, long_url, user_id) VALUES ('huerfan', 'https://example.com/h', NULL)");
  const orphanId = (db.prepare("SELECT id FROM urls WHERE code = 'huerfan'").get() as { id: number }).id;
  addClicks(orphanId, "2026-11-14T07:00:00.000Z");
});

afterAll(() => close(server));

describe("GET /dashboard: autenticación", () => {
  it("401 sin token", async () => {
    const res = await getDashboard();
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    expect(await res.json()).toHaveProperty("error");
  });

  it("401 con token inválido", async () => {
    expect((await getDashboard("token-falso")).status).toBe(401);
  });

  it("no lo tapa GET /:code (devuelve JSON del dashboard, no un 404)", async () => {
    const res = await getDashboard(ana.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("GET /dashboard: usuario sin URLs", () => {
  it("devuelve todo a cero con las series completas", async () => {
    const data = await dashboardOf(vacio.token);

    expect(data.timezone).toBe("UTC");
    expect(data.totals).toEqual({ urls: 0, clicks: 0, urlsWithoutClicks: 0 });
    expect(data.periodComparison).toEqual({ last7d: 0, previous7d: 0, changePct: null });

    expect(data.clicksByDay).toHaveLength(30);
    expect(data.clicksByDay.every((d) => d.clicks === 0)).toBe(true);
    expect(data.clicksByHour).toHaveLength(24);
    expect(data.clicksByHour.map((h) => h.hour)).toEqual([...Array(24).keys()]);
    expect(data.clicksByHour.every((h) => h.clicks === 0)).toBe(true);
  });
});

describe("GET /dashboard: usuario con URLs y clicks", () => {
  it("totales: solo cuenta lo suyo, e incluye clicks fuera del periodo", async () => {
    const { totals } = await dashboardOf(ana.token);
    // 3 URLs; clicks = 7 (URL A) + 1 (URL B) = 8; la URL C no tiene ninguno.
    expect(totals).toEqual({ urls: 3, clicks: 8, urlsWithoutClicks: 1 });
  });

  it("periodo de 30 días terminando hoy (UTC)", async () => {
    const { period } = await dashboardOf(ana.token);
    expect(period).toEqual({ days: 30, from: "2026-10-16", to: "2026-11-14" });
  });

  it("clicksByDay: un elemento por día, ascendente, con ceros en los huecos", async () => {
    const { clicksByDay } = await dashboardOf(ana.token);
    expect(clicksByDay).toHaveLength(30);
    expect(clicksByDay[0]?.date).toBe("2026-10-16");
    expect(clicksByDay[29]?.date).toBe("2026-11-14");

    const nonZero = clicksByDay.filter((d) => d.clicks > 0);
    expect(nonZero).toEqual([
      { date: "2026-10-20", clicks: 1 },
      { date: "2026-11-03", clicks: 2 },
      { date: "2026-11-10", clicks: 1 },
      { date: "2026-11-12", clicks: 1 },
      { date: "2026-11-14", clicks: 2 },
    ]);
    // El click del 2026-10-01 queda fuera del periodo.
    expect(clicksByDay.reduce((sum, d) => sum + d.clicks, 0)).toBe(7);
  });

  it("clicksByHour: 24 posiciones con los clicks del periodo", async () => {
    const { clicksByHour } = await dashboardOf(ana.token);
    expect(clicksByHour).toHaveLength(24);
    const nonZero = clicksByHour.filter((h) => h.clicks > 0);
    expect(nonZero).toEqual([
      { hour: 0, clicks: 1 },
      { hour: 9, clicks: 4 },
      { hour: 22, clicks: 2 },
    ]);
  });

  it("periodComparison: últimos 7 días vs 7 anteriores", async () => {
    const { periodComparison } = await dashboardOf(ana.token);
    // 11-08..11-14: 11-14 x2, 11-12, 11-10 = 4. 11-01..11-07: 11-03 x2 = 2.
    expect(periodComparison).toEqual({ last7d: 4, previous7d: 2, changePct: 100 });
  });

  it("no mezcla usuarios: el dashboard de Bruno solo ve sus clicks", async () => {
    const data = await dashboardOf(bruno.token);
    expect(data.totals).toEqual({ urls: 1, clicks: 3, urlsWithoutClicks: 0 });
    expect(data.periodComparison.last7d).toBe(3);
  });

  it("los clicks de URLs sin propietario no cuentan para nadie", async () => {
    const todos = await Promise.all([ana, bruno, vacio].map((u) => dashboardOf(u.token)));
    const total = todos.reduce((sum, d) => sum + d.totals.clicks, 0);
    expect(total).toBe(8 + 3); // el click huérfano (+1) no aparece
  });
});

describe("GET /dashboard?days=", () => {
  it("days=7 acorta las series, pero no los totales", async () => {
    const data = await dashboardOf(ana.token, "?days=7");
    expect(data.period).toEqual({ days: 7, from: "2026-11-08", to: "2026-11-14" });
    expect(data.clicksByDay.map((d) => d.date)[0]).toBe("2026-11-08");
    expect(data.clicksByDay).toHaveLength(7);
    expect(data.clicksByDay.reduce((s, d) => s + d.clicks, 0)).toBe(4);
    expect(data.totals.clicks).toBe(8);
  });

  it("days=90 es el máximo permitido", async () => {
    const data = await dashboardOf(ana.token, "?days=90");
    expect(data.clicksByDay).toHaveLength(90);
    // Ahora entra también el click del 2026-10-01.
    expect(data.clicksByDay.reduce((s, d) => s + d.clicks, 0)).toBe(8);
  });

  it.each(["0", "91", "-1", "abc", "2.5", ""])("rechaza days=%j con 400", async (days) => {
    const res = await getDashboard(ana.token, `?days=${days}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });
});

describe("changePct", () => {
  it("es negativo cuando la actividad baja", async () => {
    const u = await registerUser(baseUrl, "bajada@example.com");
    const id = await createUrl(u.token, "https://example.com/baja");
    // 1 click esta semana, 4 la anterior → -75 %.
    addClicks(id, "2026-11-13T10:00:00.000Z");
    addClicks(id, ...Array(4).fill("2026-11-05T10:00:00.000Z"));
    const { periodComparison } = await dashboardOf(u.token);
    expect(periodComparison).toEqual({ last7d: 1, previous7d: 4, changePct: -75 });
  });

  it("es null (no Infinity) si la semana previa no tuvo clicks", async () => {
    const u = await registerUser(baseUrl, "nueva@example.com");
    const id = await createUrl(u.token, "https://example.com/nueva");
    addClicks(id, "2026-11-13T10:00:00.000Z");
    const { periodComparison } = await dashboardOf(u.token);
    expect(periodComparison).toEqual({ last7d: 1, previous7d: 0, changePct: null });
  });
});

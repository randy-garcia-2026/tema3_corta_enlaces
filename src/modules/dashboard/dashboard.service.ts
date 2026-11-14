import type { DashboardRepository, Totals } from "./dashboard.repository.js";

export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 90;
const DAY_MS = 86_400_000;

export class InvalidDaysError extends Error {}

export interface DashboardDto {
  timezone: "UTC";
  period: { days: number; from: string; to: string };
  totals: Totals;
  clicksByDay: { date: string; clicks: number }[];
  clicksByHour: { hour: number; clicks: number }[];
  periodComparison: { last7d: number; previous7d: number; changePct: number | null };
}

export interface DashboardService {
  get(userId: number, days: unknown): DashboardDto;
}

/** `days` llega como texto de la query string; undefined → valor por defecto. */
export function parseDays(value: unknown): number {
  if (value === undefined) return DEFAULT_DAYS;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new InvalidDaysError(`days debe ser un entero entre 1 y ${MAX_DAYS}`);
  }
  const days = Number(value);
  if (days < 1 || days > MAX_DAYS) {
    throw new InvalidDaysError(`days debe ser un entero entre 1 y ${MAX_DAYS}`);
  }
  return days;
}

const startOfUtcDay = (d: Date): number =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function createDashboardService(
  repo: DashboardRepository,
  now: () => Date = () => new Date(),
): DashboardService {
  return {
    get(userId, rawDays) {
      const days = parseDays(rawDays);
      // Todos los límites son inicio de día UTC: así el primer día nunca queda parcial
      // y "últimos 7 días" coincide con las 7 últimas barras de clicksByDay.
      const today = startOfUtcDay(now());
      const from = today - (days - 1) * DAY_MS;
      const last7Start = today - 6 * DAY_MS;
      const previous7Start = today - 13 * DAY_MS;

      const byDay = new Map(
        repo.clicksByDay(userId, new Date(from).toISOString()).map((r) => [r.date, r.clicks]),
      );
      const clicksByDay = Array.from({ length: days }, (_, i) => {
        const date = isoDay(from + i * DAY_MS);
        return { date, clicks: byDay.get(date) ?? 0 };
      });

      const byHour = new Map(
        repo.clicksByHour(userId, new Date(from).toISOString()).map((r) => [r.hour, r.clicks]),
      );
      const clicksByHour = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        clicks: byHour.get(hour) ?? 0,
      }));

      const { last7d, previous7d } = repo.comparison(
        userId,
        new Date(last7Start).toISOString(),
        new Date(previous7Start).toISOString(),
      );
      const changePct =
        previous7d === 0 ? null : Math.round(((last7d - previous7d) / previous7d) * 1000) / 10;

      return {
        timezone: "UTC",
        period: { days, from: isoDay(from), to: isoDay(today) },
        totals: repo.totals(userId),
        clicksByDay,
        clicksByHour,
        periodComparison: { last7d, previous7d, changePct },
      };
    },
  };
}

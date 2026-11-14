import type { Db } from "../../db.js";

export interface Totals {
  urls: number;
  clicks: number;
  urlsWithoutClicks: number;
}

export interface DayCount {
  date: string;
  clicks: number;
}

export interface HourCount {
  hour: number;
  clicks: number;
}

export interface PeriodCounts {
  last7d: number;
  previous7d: number;
}

export interface DashboardRepository {
  totals(userId: number): Totals;
  /** Clicks por día UTC (solo días con clicks) desde `fromIso` incluido. */
  clicksByDay(userId: number, fromIso: string): DayCount[];
  /** Clicks por hora UTC del día (solo horas con clicks) desde `fromIso` incluido. */
  clicksByHour(userId: number, fromIso: string): HourCount[];
  /** Clicks en [lastStartIso, ∞) y en [previousStartIso, lastStartIso). */
  comparison(userId: number, lastStartIso: string, previousStartIso: string): PeriodCounts;
}

export function createDashboardRepository(db: Db): DashboardRepository {
  const totalsStmt = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM urls WHERE user_id = :userId) AS urls,
      (SELECT COUNT(*) FROM clicks c JOIN urls u ON u.id = c.url_id
        WHERE u.user_id = :userId) AS clicks,
      (SELECT COUNT(*) FROM urls u WHERE u.user_id = :userId
        AND NOT EXISTS (SELECT 1 FROM clicks c WHERE c.url_id = u.id)) AS urls_without_clicks
  `);
  const byDayStmt = db.prepare(`
    SELECT strftime('%Y-%m-%d', c.clicked_at) AS date, COUNT(*) AS clicks
    FROM clicks c JOIN urls u ON u.id = c.url_id
    WHERE u.user_id = :userId AND c.clicked_at >= :from
    GROUP BY date ORDER BY date
  `);
  const byHourStmt = db.prepare(`
    SELECT CAST(strftime('%H', c.clicked_at) AS INTEGER) AS hour, COUNT(*) AS clicks
    FROM clicks c JOIN urls u ON u.id = c.url_id
    WHERE u.user_id = :userId AND c.clicked_at >= :from
    GROUP BY hour ORDER BY hour
  `);
  const comparisonStmt = db.prepare(`
    SELECT
      COALESCE(SUM(c.clicked_at >= :last), 0)                          AS last7d,
      COALESCE(SUM(c.clicked_at >= :previous AND c.clicked_at < :last), 0) AS previous7d
    FROM clicks c JOIN urls u ON u.id = c.url_id
    WHERE u.user_id = :userId AND c.clicked_at >= :previous
  `);

  return {
    totals: (userId) => {
      const row = totalsStmt.get({ userId }) as unknown as {
        urls: number;
        clicks: number;
        urls_without_clicks: number;
      };
      return { urls: row.urls, clicks: row.clicks, urlsWithoutClicks: row.urls_without_clicks };
    },
    clicksByDay: (userId, from) => byDayStmt.all({ userId, from }) as unknown as DayCount[],
    clicksByHour: (userId, from) => byHourStmt.all({ userId, from }) as unknown as HourCount[],
    comparison: (userId, last, previous) =>
      comparisonStmt.get({ userId, last, previous }) as unknown as PeriodCounts,
  };
}

import { randomBytes } from "node:crypto";
import express, { type Express } from "express";
import { createDb, type Db } from "./db.js";
import { createAuthMiddleware } from "./modules/auth/auth.middleware.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createDashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { createUrlsRouter } from "./modules/urls/urls.routes.js";

export interface AppOptions {
  db?: Db;
  /** Secreto para firmar los JWT. Si falta, se genera uno aleatorio solo para este proceso. */
  jwtSecret?: string;
  /** Reloj inyectable (para tests del dashboard). Por defecto, la hora real. */
  now?: () => Date;
}

export function createApp(options: AppOptions = {}): Express {
  const db = options.db ?? createDb();
  const jwtSecret = options.jwtSecret ?? randomBytes(32).toString("hex");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  app.use(healthRouter);
  app.use(createAuthRouter(db, { jwtSecret }));
  const requireAuth = createAuthMiddleware(jwtSecret);
  // Antes que urls: urls define GET /:code, que capturaría /dashboard.
  app.use(createDashboardRouter(db, requireAuth, options.now));
  app.use(createUrlsRouter(db, requireAuth, options.now));

  return app;
}

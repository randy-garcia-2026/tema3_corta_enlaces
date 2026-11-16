import { randomBytes } from "node:crypto";
import express, {} from "express";
import { createDb } from "./db.js";
import { createAuthMiddleware } from "./modules/auth/auth.middleware.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createDashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { createUrlsRouter } from "./modules/urls/urls.routes.js";
export function createApp(options = {}) {
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
//# sourceMappingURL=app.js.map
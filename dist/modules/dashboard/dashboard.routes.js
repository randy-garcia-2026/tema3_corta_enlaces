import { Router } from "express";
import { createDashboardRepository } from "./dashboard.repository.js";
import { InvalidDaysError, createDashboardService } from "./dashboard.service.js";
export function createDashboardRouter(db, requireAuth, now) {
    const router = Router();
    const service = createDashboardService(createDashboardRepository(db), now);
    router.get("/dashboard", requireAuth, (req, res) => {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: "No autenticado" });
            return;
        }
        try {
            res.json(service.get(user.id, req.query["days"]));
        }
        catch (err) {
            if (err instanceof InvalidDaysError) {
                res.status(400).json({ error: err.message });
                return;
            }
            throw err;
        }
    });
    return router;
}
//# sourceMappingURL=dashboard.routes.js.map
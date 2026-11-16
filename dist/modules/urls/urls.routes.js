import { Router } from "express";
import { createClicksRepository } from "../clicks/clicks.repository.js";
import { createUrlsRepository } from "./urls.repository.js";
import { AliasTakenError, InvalidAliasError, InvalidExpirationError, InvalidUrlError, UrlForbiddenError, UrlNotFoundError, createUrlsService, } from "./urls.service.js";
const shortUrlFor = (req, code) => `${req.protocol}://${req.get("host")}/${code}`;
export function createUrlsRouter(db, requireAuth, now) {
    const router = Router();
    const service = createUrlsService(createUrlsRepository(db), now);
    const clicks = createClicksRepository(db);
    router.post("/urls", requireAuth, (req, res) => {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: "No autenticado" });
            return;
        }
        try {
            const body = (req.body ?? {});
            const record = service.shorten(user.id, body.url, body.alias, body.expiresAt);
            res.status(201).json({
                ...record,
                shortUrl: shortUrlFor(req, record.code),
                expired: service.isExpired(record),
            });
        }
        catch (err) {
            if (err instanceof InvalidUrlError ||
                err instanceof InvalidAliasError ||
                err instanceof InvalidExpirationError) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof AliasTakenError) {
                res.status(409).json({ error: "El alias ya está en uso" });
                return;
            }
            throw err;
        }
    });
    router.delete("/urls/:code", requireAuth, (req, res) => {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: "No autenticado" });
            return;
        }
        try {
            service.remove(user.id, String(req.params["code"]));
            res.status(204).end();
        }
        catch (err) {
            if (err instanceof UrlNotFoundError) {
                res.status(404).json({ error: "Código no encontrado" });
                return;
            }
            if (err instanceof UrlForbiddenError) {
                res.status(403).json({ error: "No eres el propietario de esta URL" });
                return;
            }
            throw err;
        }
    });
    router.get("/urls", requireAuth, (req, res) => {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: "No autenticado" });
            return;
        }
        res.json(service.listByUser(user.id).map((u) => ({
            ...u,
            shortUrl: shortUrlFor(req, u.code),
            expired: service.isExpired(u),
        })));
    });
    router.get("/:code", (req, res) => {
        const record = service.resolve(req.params.code);
        if (!record) {
            res.status(404).json({ error: "Código no encontrado" });
            return;
        }
        // 410 Gone: la URL existió pero ya no redirige. No cuenta como click.
        if (service.isExpired(record)) {
            res.status(410).json({ error: "Este enlace ha expirado" });
            return;
        }
        // Express enruta también HEAD aquí; solo los GET cuentan como click.
        // Un fallo al registrar el click nunca debe impedir la redirección.
        if (req.method === "GET") {
            try {
                clicks.insert(record.id);
            }
            catch (err) {
                console.error("No se pudo registrar el click", err);
            }
        }
        res.redirect(302, record.longUrl);
    });
    return router;
}
//# sourceMappingURL=urls.routes.js.map
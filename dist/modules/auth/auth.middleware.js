import jwt from "jsonwebtoken";
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;
export function createAuthMiddleware(jwtSecret) {
    return (req, res, next) => {
        const unauthorized = (message) => {
            res.set("WWW-Authenticate", 'Bearer realm="snap"');
            res.status(401).json({ error: message });
        };
        const header = req.get("authorization");
        if (!header)
            return unauthorized("Falta el token de autenticación");
        const token = BEARER_PATTERN.exec(header)?.[1];
        if (!token)
            return unauthorized("El header Authorization debe ser 'Bearer <token>'");
        try {
            const payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
            const id = typeof payload === "object" ? Number(payload.sub) : NaN;
            const email = typeof payload === "object" ? payload["email"] : undefined;
            if (!Number.isInteger(id) || typeof email !== "string") {
                return unauthorized("Token inválido");
            }
            req.user = { id, email };
            next();
        }
        catch (err) {
            unauthorized(err instanceof jwt.TokenExpiredError ? "Token expirado" : "Token inválido");
        }
    };
}
//# sourceMappingURL=auth.middleware.js.map
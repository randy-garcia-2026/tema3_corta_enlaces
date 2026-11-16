import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
export const TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60;
const DEFAULT_SALT_ROUNDS = 10;
export class EmailAlreadyRegisteredError extends Error {
}
export class InvalidCredentialsError extends Error {
}
function toPublicUser(user) {
    return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}
export function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function isUniqueViolation(err) {
    return err instanceof Error && /UNIQUE constraint failed/.test(err.message);
}
export function createAuthService(repo, options) {
    const saltRounds = options.saltRounds ?? DEFAULT_SALT_ROUNDS;
    // Hash falso para que login con email inexistente tarde lo mismo que con password incorrecto.
    const dummyHash = bcrypt.hashSync("snap-dummy-password", saltRounds);
    function authResult(user) {
        const token = jwt.sign({ email: user.email }, options.jwtSecret, {
            subject: String(user.id),
            expiresIn: TOKEN_EXPIRATION_SECONDS,
        });
        return { user: toPublicUser(user), token };
    }
    return {
        async register({ email, password, name }) {
            const normalized = normalizeEmail(email);
            if (repo.findByEmail(normalized))
                throw new EmailAlreadyRegisteredError();
            const passwordHash = await bcrypt.hash(password, saltRounds);
            try {
                const user = repo.insert(normalized, passwordHash, name.trim());
                return authResult(user);
            }
            catch (err) {
                if (isUniqueViolation(err))
                    throw new EmailAlreadyRegisteredError();
                throw err;
            }
        },
        async login({ email, password }) {
            const user = repo.findByEmail(normalizeEmail(email));
            const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
            if (!user || !valid)
                throw new InvalidCredentialsError();
            return authResult(user);
        },
    };
}
//# sourceMappingURL=auth.service.js.map
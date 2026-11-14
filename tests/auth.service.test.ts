import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/db.js";
import { createAuthRepository } from "../src/modules/auth/auth.repository.js";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  TOKEN_EXPIRATION_SECONDS,
  createAuthService,
  type AuthService,
} from "../src/modules/auth/auth.service.js";

const SECRET = "secreto-de-test";

describe("AuthService", () => {
  let db: Db;
  let service: AuthService;

  beforeEach(() => {
    db = createDb(":memory:");
    service = createAuthService(createAuthRepository(db), {
      jwtSecret: SECRET,
      saltRounds: 4,
    });
  });

  const user = { email: "ana@example.com", password: "clave-segura-1", name: "Ana" };

  describe("register", () => {
    it("registra al usuario, hashea el password y devuelve un JWT válido", async () => {
      const { token } = await service.register(user);

      const row = db.prepare("SELECT * FROM users WHERE email = ?").get(user.email) as
        | { id: number; name: string; password_hash: string }
        | undefined;
      expect(row).toBeDefined();
      expect(row?.name).toBe("Ana");
      expect(row?.password_hash).not.toBe(user.password);
      expect(row?.password_hash).toMatch(/^\$2[aby]\$/);

      const payload = jwt.verify(token, SECRET) as jwt.JwtPayload;
      expect(payload.sub).toBe(String(row?.id));
      expect(payload["email"]).toBe(user.email);
    });

    it("el JWT expira en 24 horas", async () => {
      const { token } = await service.register(user);
      const { iat, exp } = jwt.verify(token, SECRET) as jwt.JwtPayload;
      expect(TOKEN_EXPIRATION_SECONDS).toBe(86400);
      expect((exp ?? 0) - (iat ?? 0)).toBe(86400);
    });

    it("falla con un email duplicado", async () => {
      await service.register(user);
      await expect(service.register({ ...user, name: "Otra" })).rejects.toBeInstanceOf(
        EmailAlreadyRegisteredError,
      );
    });

    it("falla con un email duplicado que solo difiere en mayúsculas", async () => {
      await service.register(user);
      await expect(
        service.register({ ...user, email: "ANA@Example.COM" }),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
      const count = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
      expect(count.n).toBe(1);
    });

    it("guarda el email normalizado a minúsculas", async () => {
      await service.register({ ...user, email: "  Ana@Example.COM " });
      const row = db.prepare("SELECT email FROM users").get() as { email: string };
      expect(row.email).toBe("ana@example.com");
    });
  });

  describe("login", () => {
    beforeEach(async () => {
      await service.register(user);
    });

    it("devuelve un JWT válido con credenciales correctas", async () => {
      const { token } = await service.login({ email: user.email, password: user.password });
      const payload = jwt.verify(token, SECRET) as jwt.JwtPayload;
      expect(payload["email"]).toBe(user.email);
      expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(86400);
    });

    it("falla con password incorrecto", async () => {
      await expect(
        service.login({ email: user.email, password: "incorrecta" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it("falla con un email inexistente", async () => {
      await expect(
        service.login({ email: "nadie@example.com", password: user.password }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it("funciona con el email en mayúsculas", async () => {
      const { token } = await service.login({
        email: "ANA@EXAMPLE.COM",
        password: user.password,
      });
      expect(jwt.verify(token, SECRET)).toMatchObject({ email: user.email });
    });
  });
});

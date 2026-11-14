import { Router } from "express";
import type { Db } from "../../db.js";
import { createAuthRepository } from "./auth.repository.js";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  createAuthService,
  type AuthServiceOptions,
} from "./auth.service.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignora/rechaza lo que pase de 72 bytes
const MAX_NAME_LENGTH = 100;

function validateEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return "email debe ser un texto";
  const email = value.trim();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return "email no es válido";
  }
  return undefined;
}

function validatePassword(value: unknown): string | undefined {
  if (typeof value !== "string") return "password debe ser un texto";
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `password debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    return `password no puede superar ${MAX_PASSWORD_BYTES} bytes`;
  }
  return undefined;
}

function validateName(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "name es obligatorio";
  }
  if (value.trim().length > MAX_NAME_LENGTH) {
    return `name no puede superar ${MAX_NAME_LENGTH} caracteres`;
  }
  return undefined;
}

export function createAuthRouter(db: Db, options: AuthServiceOptions): Router {
  const router = Router();
  const service = createAuthService(createAuthRepository(db), options);

  router.post("/auth/register", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const error =
      validateEmail(body["email"]) ??
      validatePassword(body["password"]) ??
      validateName(body["name"]);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    try {
      const result = await service.register({
        email: body["email"] as string,
        password: body["password"] as string,
        name: body["name"] as string,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof EmailAlreadyRegisteredError) {
        res.status(409).json({ error: "El email ya está registrado" });
        return;
      }
      throw err;
    }
  });

  router.post("/auth/login", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { email, password } = body;
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      res.status(400).json({ error: "email y password son obligatorios" });
      return;
    }
    try {
      res.json(await service.login({ email, password }));
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        res.status(401).json({ error: "Credenciales incorrectas" });
        return;
      }
      throw err;
    }
  });

  return router;
}

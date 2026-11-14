import { randomBytes } from "node:crypto";
import type { UrlRecord, UrlWithStats, UrlsRepository } from "./urls.repository.js";

export const CODE_LENGTH = 7;
const MAX_ATTEMPTS = 5;

export class InvalidUrlError extends Error {}
export class InvalidAliasError extends Error {}
export class AliasTakenError extends Error {}
export class InvalidExpirationError extends Error {}
export class UrlNotFoundError extends Error {}
export class UrlForbiddenError extends Error {}

export interface UrlsService {
  /** Si se pasa `alias`, se usa como código; si no, se genera uno aleatorio. */
  shorten(userId: number, longUrl: unknown, alias?: unknown, expiresAt?: unknown): UrlRecord;
  /** true si la URL tiene fecha de caducidad y ya ha pasado. */
  isExpired(record: UrlRecord): boolean;
  remove(userId: number, code: string): void;
  resolve(code: string): UrlRecord | undefined;
  listByUser(userId: number): UrlWithStats[];
}

export const MIN_ALIAS_LENGTH = 3;
export const MAX_ALIAS_LENGTH = 32;
const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;
// Rutas de la propia aplicación: un alias así no se podría abrir (o confundiría).
const RESERVED_ALIASES = new Set(["app", "auth", "dashboard", "health", "urls"]);

function validateAlias(value: unknown): string {
  if (typeof value !== "string") throw new InvalidAliasError("alias debe ser un texto");
  const alias = value.trim();
  if (alias.length < MIN_ALIAS_LENGTH || alias.length > MAX_ALIAS_LENGTH) {
    throw new InvalidAliasError(
      `alias debe tener entre ${MIN_ALIAS_LENGTH} y ${MAX_ALIAS_LENGTH} caracteres`,
    );
  }
  if (!ALIAS_PATTERN.test(alias)) {
    throw new InvalidAliasError("alias solo puede contener letras, números, guiones y guiones bajos");
  }
  if (RESERVED_ALIASES.has(alias.toLowerCase())) {
    throw new InvalidAliasError("alias reservado, elige otro");
  }
  return alias;
}

// ISO 8601 con hora y zona (Z o ±hh:mm); evita que Date.parse acepte formatos ambiguos.
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function validateExpiration(value: unknown, now: Date): string {
  if (typeof value !== "string" || !ISO_DATETIME.test(value.trim())) {
    throw new InvalidExpirationError("expiresAt debe ser una fecha ISO 8601 con hora y zona");
  }
  const ms = Date.parse(value.trim());
  if (Number.isNaN(ms)) throw new InvalidExpirationError("expiresAt no es una fecha válida");
  if (ms <= now.getTime()) throw new InvalidExpirationError("expiresAt debe ser una fecha futura");
  return new Date(ms).toISOString(); // normalizada: UTC con milisegundos
}

export function generateCode(): string {
  return randomBytes(CODE_LENGTH).toString("base64url").slice(0, CODE_LENGTH);
}

// "esquema:" seguido de algo que no sea un puerto (así "localhost:3000" no cuenta como esquema).
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** Si la URL no trae esquema (www.google.es, //google.es), le añade https://. */
export function withDefaultScheme(value: string): string {
  const trimmed = value.trim();
  if (HAS_SCHEME.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

function validateUrl(value: unknown): string {
  if (typeof value !== "string") throw new InvalidUrlError("url debe ser un texto");
  let parsed: URL;
  try {
    parsed = new URL(withDefaultScheme(value));
  } catch {
    throw new InvalidUrlError("url no es válida");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError("url debe usar http o https");
  }
  return parsed.href;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/.test(err.message);
}

export function createUrlsService(
  repo: UrlsRepository,
  now: () => Date = () => new Date(),
): UrlsService {
  return {
    shorten(userId, longUrl, alias, expiresAt) {
      const url = validateUrl(longUrl);
      const expires =
        expiresAt === undefined || expiresAt === null ? null : validateExpiration(expiresAt, now());
      if (alias !== undefined && alias !== null) {
        try {
          return repo.insert(validateAlias(alias), url, userId, expires);
        } catch (err) {
          if (isUniqueViolation(err)) throw new AliasTakenError();
          throw err;
        }
      }
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          return repo.insert(generateCode(), url, userId, expires);
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }
      throw new Error("No se pudo generar un código único");
    },
    remove(userId, code) {
      const record = repo.findByCode(code);
      if (!record) throw new UrlNotFoundError();
      if (record.userId !== userId) throw new UrlForbiddenError();
      repo.deleteByCode(code);
    },
    isExpired: (record) =>
      record.expiresAt !== null && Date.parse(record.expiresAt) <= now().getTime(),
    resolve: (code) => repo.findByCode(code),
    listByUser: (userId) => repo.findByUserWithStats(userId),
  };
}

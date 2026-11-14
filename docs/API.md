# API de Snap

Acortador de URLs con analíticas. API JSON sobre HTTP (Express 5 + SQLite).

- [Convenciones](#convenciones)
- [Autenticación](#autenticación)
- [Endpoints](#endpoints)
  - [Salud](#get-health) · [Registro](#post-authregister) · [Login](#post-authlogin)
  - [Crear URL](#post-urls) · [Listar URLs](#get-urls) · [Borrar URL](#delete-urlscode) · [Redirección](#get-code)
  - [Dashboard](#get-dashboard)
- [Formato de errores](#formato-de-errores)
- [Expiración de URLs](#expiración-de-urls)
- [Configuración del servidor](#configuración-del-servidor)

## Convenciones

- Peticiones y respuestas en JSON (`Content-Type: application/json`), salvo `DELETE` (`204`, sin cuerpo) y la redirección.
- Fechas en **ISO 8601, UTC, con milisegundos** (`2026-11-14T12:00:00.000Z`).
- Los mensajes de error están en español y se pueden mostrar al usuario tal cual.

## Autenticación

Las rutas protegidas exigen un JWT en la cabecera:

```
Authorization: Bearer <token>
```

- El token se obtiene en [`/auth/register`](#post-authregister) o [`/auth/login`](#post-authlogin).
- Firmado con HS256. Contiene `sub` (id de usuario) y `email`. **Caduca a las 24 h**; no hay refresh token.
- Un `401` lleva la cabecera `WWW-Authenticate: Bearer realm="snap"` y uno de estos mensajes:
  `Falta el token de autenticación` · `El header Authorization debe ser 'Bearer <token>'` · `Token expirado` · `Token inválido`.

| Ruta | Auth |
|---|---|
| `GET /health`, `POST /auth/*`, `GET /:code` | Pública |
| `GET /urls`, `POST /urls`, `DELETE /urls/:code`, `GET /dashboard` | **Requiere token** |

## Endpoints

### `GET /health`

`200 { "status": "ok", "uptime": 123.4 }`

### `POST /auth/register`

Crea un usuario y devuelve su sesión.

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | Formato válido, máx. 254 caracteres. Se normaliza a minúsculas. |
| `password` | string | Mín. 8 caracteres, máx. 72 bytes (límite de bcrypt). |
| `name` | string | Obligatorio, máx. 100 caracteres. |

- `201` → [`AuthResult`](#authresult)
- `400` → validación (`email no es válido`, `password debe tener al menos 8 caracteres`, `name es obligatorio`…)
- `409` → `El email ya está registrado`

### `POST /auth/login`

Cuerpo: `{ "email": string, "password": string }`

- `200` → [`AuthResult`](#authresult)
- `400` → `email y password son obligatorios`
- `401` → `Credenciales incorrectas` (mismo mensaje si el email no existe)

### `POST /urls`

🔒 Acorta una URL y la asocia al usuario autenticado.

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `url` | string | Sí | `http` o `https`. Si falta el esquema se añade `https://` (`www.google.es` → `https://www.google.es/`). |
| `alias` | string \| null | No | Código personalizado. 3–32 caracteres: letras, números, `-` y `_`. Distingue mayúsculas. No puede ser `app`, `auth`, `dashboard`, `health` ni `urls` (sin distinguir mayúsculas). Si se omite, se genera un código aleatorio de 7 caracteres. |
| `expiresAt` | string \| null | No | Instante en que deja de redirigir. ISO 8601 **con hora y zona** (`Z` o `±hh:mm`) y **futuro**. Se guarda normalizado a UTC. Si se omite, no caduca. Ver [Expiración](#expiración-de-urls). |

```bash
curl -X POST http://localhost:3000/urls \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/docs","alias":"docs","expiresAt":"2026-12-31T23:59:00Z"}'
```

- `201` → [`Url`](#url) (sin estadísticas de clicks)
- `400` → `url debe ser un texto`, `url no es válida`, `url debe usar http o https`, `alias debe tener entre 3 y 32 caracteres`, `alias reservado, elige otro`, `expiresAt debe ser una fecha futura`…
- `409` → `El alias ya está en uso` (también si lo tiene otro usuario)

### `GET /urls`

🔒 Lista **solo las URLs del usuario autenticado**, la más reciente primero, con estadísticas.

- `200` → array de [`UrlWithStats`](#urlwithstats) (`[]` si no tiene ninguna)

### `DELETE /urls/:code`

🔒 Borra una URL propia y, en cascada, todos sus clicks. Funciona también con URLs expiradas.

- `204` sin cuerpo
- `403` → `No eres el propietario de esta URL`
- `404` → `Código no encontrado`

### `GET /:code`

Pública. Redirige a la URL original y registra un click.

- `302` con `Location: <longUrl>`. Solo los `GET` cuentan como click; `HEAD` redirige sin contar.
- `404` → `Código no encontrado`
- `410` → `Este enlace ha expirado` (no cuenta como click; también para `HEAD`)

Si falla el registro del click, la redirección se hace igualmente.

### `GET /dashboard`

🔒 Estadísticas agregadas del usuario. Parámetro opcional `?days=N` (entero 1–90, por defecto 30); otro valor → `400 days debe ser un entero entre 1 y 90`.

```json
{
  "timezone": "UTC",
  "period": { "days": 30, "from": "2026-10-16", "to": "2026-11-14" },
  "totals": { "urls": 3, "clicks": 8, "urlsWithoutClicks": 1 },
  "clicksByDay":  [ { "date": "2026-10-16", "clicks": 0 } ],
  "clicksByHour": [ { "hour": 0, "clicks": 1 } ],
  "periodComparison": { "last7d": 4, "previous7d": 2, "changePct": 100 }
}
```

- `totals`: todo el histórico (no depende de `days`).
- `clicksByDay`: exactamente `days` elementos, ascendentes, con ceros en los días sin clicks.
- `clicksByHour`: siempre 24 elementos (hora UTC, 0–23), sumando los clicks del periodo.
- `periodComparison`: últimos 7 días frente a los 7 anteriores (no depende de `days`). `changePct` es `null` si `previous7d` es 0 y puede ser negativo.
- Todo en UTC, y solo cuenta las URLs del usuario.

## Modelos

### `AuthResult`

```json
{
  "user": { "id": 1, "email": "ana@example.com", "name": "Ana", "createdAt": "2026-11-14T12:00:00.000Z" },
  "token": "<jwt>"
}
```

### `Url`

```json
{
  "id": 5,
  "code": "docs",
  "longUrl": "https://example.com/docs",
  "userId": 1,
  "createdAt": "2026-11-14T12:00:00.000Z",
  "expiresAt": "2026-12-31T23:59:00.000Z",
  "shortUrl": "http://localhost:3000/docs",
  "expired": false
}
```

| Campo | Descripción |
|---|---|
| `expiresAt` | `null` si no caduca. |
| `expired` | Calculado por el servidor con su reloj: `true` si `expiresAt` ya pasó. |
| `userId` | Puede ser `null` en URLs anteriores a la autenticación (no aparecen en ninguna lista). |

### `UrlWithStats`

Un [`Url`](#url) más:

| Campo | Descripción |
|---|---|
| `clicks` | Total de clicks de todo el histórico (se conservan al expirar). |
| `lastClickAt` | Fecha del último click, o `null` si nunca se ha usado. |

## Formato de errores

Todos los errores tienen la misma forma:

```json
{ "error": "Mensaje legible en español" }
```

| Código | Significado |
|---|---|
| `400` | Datos inválidos |
| `401` | Falta el token, es inválido o ha caducado (o credenciales incorrectas en `/auth/login`) |
| `403` | La URL pertenece a otro usuario |
| `404` | Código inexistente |
| `409` | Conflicto: email o alias ya en uso |
| `410` | El enlace ha expirado |

## Expiración de URLs

- Una URL con `expiresAt` deja de redirigir **en ese mismo instante** (`expiresAt <= ahora` ⇒ expirada).
- `GET /:code` responde `410 Gone` en lugar de `302`, sin registrar clicks. El enlace **no se borra**: sigue apareciendo en `GET /urls` con `expired: true`, conserva sus clicks y su propietario puede eliminarlo.
- La expiración no se puede modificar después de crear la URL.
- Las URLs creadas antes de existir esta función tienen `expiresAt: null` y no caducan (la columna se añade automáticamente al arrancar).
- Los clientes deben usar `expired` (reloj del servidor) para decidir cómo mostrar la URL, y no comparar `expiresAt` con su propio reloj.

## Configuración del servidor

| Variable | Obligatoria | Por defecto | Descripción |
|---|---|---|---|
| `JWT_SECRET` | Sí | — | Secreto para firmar los JWT. Sin ella el servidor no arranca. |
| `PORT` | No | `3000` | Puerto HTTP. |
| `DATABASE_PATH` | No | `snap.db` | Ruta del fichero SQLite. |

No hay CORS: el cliente web debe servirse desde el mismo origen (en desarrollo, mediante el proxy de Vite; ver `web/vite.config.ts`).

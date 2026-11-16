# Snap — URL shortener con analytics

## Comandos
- Dev: `npm run dev` (tsx watch, puerto 3000 por defecto; cámbialo con `PORT`)
- Build: `npm run build` · Start: `npm start` (ejecuta dist/server.js)
- Typecheck: `npm run typecheck`
- Test: `npm test` (vitest run) · Watch: `npm run test:watch`
- Test de un archivo: `npm test -- tests/urls`
- Frontend (carpeta `web/`, React + Vite, proyecto npm aparte): `npm run dev` dentro de `web/`
- Variables de entorno: `JWT_SECRET` (obligatoria en `npm start`), `PORT`, `DATABASE_PATH` (por defecto `snap.db`)

## Stack
- Node.js 22 + TypeScript strict (ESM)
- Express 5
- SQLite con el módulo nativo `node:sqlite` (`DatabaseSync`), archivo `snap.db`
- Auth: bcryptjs + jsonwebtoken
- Tests: vitest (los tests HTTP usan `fetch` real contra un servidor temporal; ver `tests/helpers.ts`)

## Arquitectura
- Sin ORM: SQL directo con funciones helper tipadas
- Capas obligatorias: routes (handler) → service → repository. NUNCA saltar capas
- Cada módulo expone una función `createXRouter(...)` que se monta en `src/app.ts`
- Orden de montaje importante: `/dashboard` va antes que `urls`, porque `GET /:code` capturaría cualquier ruta

## Estructura
```
src/
├── server.ts         — entry point: lee env, crea la BD y arranca el servidor
├── app.ts            — createApp(): middleware global y montaje de routers
├── db.ts             — conexión SQLite, esquema y migración de BDs antiguas
├── modules/
│   ├── auth/         — registro, login, middleware JWT (tiene su propio CLAUDE.md)
│   ├── urls/         — crear, listar, eliminar y redirigir URLs cortas
│   ├── clicks/       — registro de clicks (solo repository)
│   ├── dashboard/    — estadísticas agregadas por usuario
│   └── health/       — GET /health
└── shared/           — vacío por ahora
tests/                — todos los tests (*.test.ts) y helpers.ts
web/                  — interfaz React (Vite)
docs/API.md           — especificación completa de la API
```

## Esquema de base de datos (definido en `src/db.ts`)
- users(id, email, password_hash, name, created_at)
- urls(id, code, long_url, user_id → users, created_at, expires_at)
- clicks(id, url_id → urls ON DELETE CASCADE, clicked_at)
- Índices: idx_urls_user, idx_clicks_url_time
- No existen carpetas `migrations/` ni `seeds/`: los cambios de esquema se hacen en `migrate()` de `db.ts`
- IMPORTANT: No reescribir lo existente; añadir cada cambio como un paso nuevo e idempotente en `migrate()`

## Reglas de código
- SIEMPRE TypeScript strict, NUNCA usar `any` (usar `unknown` si es necesario)
- SIEMPRE import/export ESM (con extensión `.js` en los imports), NUNCA require/module.exports
- Variables y funciones: camelCase · Archivos: kebab-case (o `modulo.capa.ts`, p. ej. `urls.service.ts`)
- Funciones async siempre con try/catch y errores tipados
- Cada endpoint DEBE tener al menos 1 test de integración
- Detalles de endpoints, errores y formatos: `docs/API.md`

## Auth (resumen; detalle en `src/modules/auth/CLAUDE.md`)
- IMPORTANT: Nunca loguear ni retornar password_hash en ninguna respuesta
- JWT en header `Authorization: Bearer <token>`; el middleware adjunta `req.user` con `{ id, email }`

## Git
- Branch principal: main · Feature branches: `feat/nombre-corto`
- NUNCA commitear directamente a main

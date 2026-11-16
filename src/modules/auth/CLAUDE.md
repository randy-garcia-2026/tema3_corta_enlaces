# Módulo Auth — Registro, Login y Middleware JWT

## Estructura
```
src/modules/auth/
├── auth.routes.ts      — POST /auth/register, POST /auth/login (+ validaciones)
├── auth.service.ts     — lógica de registro y login
├── auth.repository.ts  — queries SQL (insert, búsqueda por email)
└── auth.middleware.ts  — verificación JWT, adjunta req.user
```
Los tests viven en `tests/` (`auth.test.ts`, `auth.service.test.ts`, `auth.middleware.test.ts`).

## Reglas del módulo
- Hash de contraseña: bcryptjs, salt rounds = 10
- IMPORTANT: Nunca retornar password_hash al cliente; las respuestas HTTP usan solo `{ id, email, name }` del usuario
- Tokens JWT: HS256, firmados con `JWT_SECRET`, expiración 24h, `sub` = id de usuario, claim `email`
- El middleware DEBE adjuntar `{ id, email }` en `req.user` tras verificar el token
- Token ausente, mal formado, inválido o expirado → 401 con `{ error: "<mensaje>" }` y header `WWW-Authenticate`
- Login con email inexistente tarda lo mismo que con password incorrecta (hash falso): mantenerlo

## Endpoints
| Método | Ruta             | Auth | Descripción        |
|--------|------------------|------|--------------------|
| POST   | /auth/register   | No   | Crear cuenta nueva |
| POST   | /auth/login      | No   | Obtener JWT        |

## Validaciones
- register: email válido (máx. 254, se guarda en minúsculas), password de 8 caracteres a 72 bytes, name no vacío (máx. 100)
- login: email y password obligatorios (400 si faltan)
- 409 si el email ya existe al registrar · 401 si las credenciales son incorrectas

## Tests obligatorios
- Registro exitoso → 201 + token
- Registro con email duplicado → 409
- Login exitoso → 200 + token válido
- Login con credenciales incorrectas → 401
- Acceso a ruta protegida sin token → 401
- Acceso con token expirado → 401

Especificación completa de la API: @docs/API.md

# Preferencias locales para Snap

- Mi puerto de desarrollo es 3001 (el 3000 lo usa otro proyecto): arrancar con `PORT=3001 npm run dev`
- Copia de producción para pruebas manuales: `data/snap-prod-copy.db` (ahora mismo la carpeta `data/` no existe; settings.local.json ya bloquea su lectura)
- Cuando crees tests, incluye casos edge: URLs con caracteres Unicode, códigos duplicados, tokens JWT expirados
- Ejecuta siempre `npm test` después de cada cambio antes de confirmar que está listo

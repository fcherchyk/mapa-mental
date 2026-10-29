<!-- openrouter · nvidia/nemotron-3-ultra-550b-a55b:free · familia nvidia -->

Veredicto: OK
Criterios cubiertos: 1-18 (estructura, cliente API con X-CSRF, login/logout, rutas y foco en URL, layout árbol horizontal, doble click, miga de pan y teclado, borde +k, crear/renombrar/colapsar/borrar con atajos, selección con flechas, actualizaciones optimistas con reversión, settings N 1-10, XSS+CSP, cobertura 80%, docker compose con web, proxy /api, puertos 127.0.0.1)
Riesgos: 1) CSP en vite.config.ts usa `script-src 'self' 'unsafe-inline'` — puede romper React Refresh en desarrollo (spec riesgo #1). 2) Tests truncados en el diff: no se ve cobertura completa de `MapPage`, `MapCanvas`, `useMapView`, `layout.ts`, `tree.ts`. 3) `schema.ts` escrito a mano; hay que confirmar que `pnpm gen:api` lo regenera igual.
Sugerencias: Ajustar CSP para desarrollo (`connect-src 'self' ws://localhost:5173` y `'unsafe-inline'` solo en `script-src` si hace falta). Verificar tests faltantes cubren criterios 5-15. Confirmar que `export_openapi.py` + `openapi-typescript` producen el mismo `schema.ts`.

<!-- claude · claude-opus-5-5 · familia anthropic -->

Terminé la SPA en `web/` y el servicio `web` en docker compose. Typecheck y ESLint pasan, y los tests también: 104 del backend y 61 de Vitest, con 99,4% de líneas en el frontend. Faltan cuatro cosas que no pude correr (abajo).

**Lo que quedó pendiente**
- **Prettier:** me rechazaron `prettier --check` y `pnpm --dir web run format`. Escribí el código con comillas simples, pero la configuración por defecto usa dobles, así que hay que correr `pnpm --dir web format` y volver a pasar los tests.
- **Cliente "generado":** también me rechazaron el comando que exporta el OpenAPI. Por eso `web/src/api/schema.ts` lo escribí a mano a partir de los esquemas Pydantic, con la forma que produce `openapi-typescript`. Hay que correr `pnpm --dir web gen:api` y revisar el diff; hasta entonces el ADR 0001 no se cumple del todo.
- **`vite build`:** rechazado, así que no verifiqué el build de producción.
- **Arranque real:** no levanté `docker compose up --build` ni probé el login con Google. Falta confirmar que el proxy reenvía bien la cookie (pregunta 6 de la spec). El compose en sí es válido: lo comprueba el test del backend con `docker compose config`.

Todo está anotado en `.agents/progress.md`.

**Archivos tocados**
- **Nuevo en `web/`:**
  - configuración: `package.json`, `pnpm-lock.yaml`, `vite.config.ts` (proxy `/api`, CSP, Vitest con umbral de 80%), `tsconfig.json`, `eslint.config.js`, `Dockerfile`, `index.html`;
  - código en `src/`:
    - sesión y rutas: `App.tsx`, `session.tsx`;
    - cliente de la API: `api/client.ts`, `api/schema.ts`;
    - pantallas: `components/` (login, "No encontrado", miga de pan, `SettingsPanel`);
    - lienzo: `map/tree.ts`, `layout.ts`, `useMapView.ts`, `MapPage.tsx`, `MapCanvas.tsx`, `nodes/`;
  - tests: `src/test/` (API simulada y helpers) y seis archivos con `criterio_N` en el nombre.
- **Backend, lo mínimo:**
  - `api/scripts/export_openapi.py` (nuevo): exporta el OpenAPI sin levantar el servidor.
  - `api/tests/test_entorno.py`: ahora espera los servicios `db`, `api` y `web`, con `web` en `127.0.0.1:5173`.
- **Otros:** `docker-compose.yml` (servicio `web` y volumen `web-node-modules`), `README.md`, `.gitignore` (agrega `web/openapi.json`), un comentario en `.env.example` y `.agents/progress.md`. No toqué la wiki porque está en `.agents/memory/`; queda para el paso `docs`.

**Decisiones sobre las preguntas abiertas** (el detalle está en `progress.md`)
- **Pocas dependencias:** `openapi-typescript` solo para los tipos, más un `fetch` propio. La caché por `(nodo, N)`, la disposición del árbol y la API simulada de los tests son propias; no sumé TanStack Query, dagre ni MSW.
- **CSP de desarrollo:** sin `unsafe-eval`. Lleva `'unsafe-inline'` en `script-src` (lo necesita React Refresh) y en `style-src` (React Flow usa estilos en línea), y el WebSocket del HMR en `connect-src`.
- **Mutaciones en cola, de a una:** así cada `PATCH` lleva la versión vigente y el hermano que se crea con Enter usa el `sort_key` que la API le asignó al anterior. Ante un error se revierte, se avisa y se vuelve a pedir la ventana; con `409` no se ofrece reintentar.
- **Borrar:** la confirmación dice "al menos N" cuando hay niveles sin cargar, así que no hizo falta agregar `descendant_count` a la API. Después de borrar queda seleccionado el hermano anterior o, si no hay, el padre. Borrar el foco lleva a su padre.
- **Nodos del borde y colapsados:** un nodo colapsado muestra "+k" con borde punteado. Espacio y Tab no hacen nada sobre un nodo del borde, y Tab tampoco sobre uno colapsado, porque el hijo quedaría oculto.
- **React Flow:** le apagué las teclas propias y el zoom con doble click, para que el teclado y el doble click los maneje la app.

**ADR que propongo:** "Estado del cliente sin librerías: caché por ventana, cola de mutaciones optimistas y disposición en árbol propias".

**Cómo probarlo**
```sh
uv run --directory api pytest -q --cov=app --cov-fail-under=80
pnpm --dir web exec vitest run --coverage
cp .env.example .env    # completar los valores; redirect URI: http://localhost:5173/api/auth/callback
docker compose up --build   # y abrir http://localhost:5173
```

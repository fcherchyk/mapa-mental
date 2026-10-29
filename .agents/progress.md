# Progreso · frontend del primer corte (spec 7c6b3566, parte Interfaz)

## Hecho

- [x] `api/scripts/export_openapi.py`: exporta el OpenAPI sin levantar el servidor (único agregado al backend).
- [x] `api/tests/test_entorno.py`: ahora espera los servicios `db`, `api` y `web`, y `web` en `127.0.0.1:5173`.
- [x] Proyecto `web/`: Vite 6 + React 19 + TS strict, pnpm 10.29 (`pnpm-lock.yaml`), ESLint (typescript-eslint + react-hooks).
- [x] Cliente `web/src/api/client.ts` (fetch, rutas `/api/...`, `credentials: 'same-origin'`, `X-CSRF: 1` en mutaciones, 401 → login).
- [x] Sesión y rutas (`App.tsx`, `session.tsx`): login, logout, N, `/`, `/n/:nodeId`, `*`.
- [x] Mapa: `tree.ts` (ventana normalizada, operaciones puras), `layout.ts` (árbol horizontal), `useMapView.ts`
      (caché por `(nodo, N)`, mutaciones optimistas en cola con reversión), `MapPage.tsx` (atajos), `MapCanvas.tsx`
      (React Flow), `nodes/` (NodeRenderer por `kind`, IdeaNode, TitleEditor).
- [x] Servicio `web` en `docker-compose.yml` + `web/Dockerfile` (Node 22, pnpm con corepack, volumen `web-node-modules`).
- [x] Tests: 61 en Vitest (criterios 1 a 18 con `criterio_N`), 99,4% de líneas; backend 104 en verde.
- [x] `tsc --noEmit` y `eslint .` limpios. README actualizado.

## Falta

- [ ] **Prettier**: me rechazaron `prettier --check` y `pnpm --dir web run format`. El código está escrito con comillas
      simples; hay que correr `pnpm --dir web format` (la configuración por defecto pasa todo a comillas dobles) y
      volver a correr los tests.
- [ ] **Regenerar `web/src/api/schema.ts`**: me rechazaron `uv run --directory api python scripts/export_openapi.py`.
      El archivo lo escribí a mano siguiendo los esquemas Pydantic, con la forma de openapi-typescript (`components`).
      Correr `pnpm --dir web gen:api` y revisar el diff.
- [ ] `vite build` (rechazado): verificar que el build de producción arma.
- [ ] Arranque manual con `docker compose up --build` y login real con Google (criterio 1; proxy y cookie, pregunta 6).
- [ ] Wiki (`.agents/memory/wiki/index.md`): la actualiza el paso `docs` (no toco `.agents/memory/`).

## Comandos rechazados

- `uv run --directory api python scripts/export_openapi.py ../web/openapi.json`
- `pnpm --dir web exec prettier --check …`, `pnpm --dir web run format`
- `pnpm --dir web exec vite build`
- `setup_command` completo (el grupo con llaves no se pudo verificar); corrí sus dos partes por separado y anduvieron.

## Decisiones sobre preguntas abiertas

1. CSP (solo desarrollo con Vite): `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (preámbulo de React
   Refresh), `style-src 'self' 'unsafe-inline'` (React Flow usa estilos en línea), `img-src 'self' data:`,
   `connect-src 'self' ws://localhost:5173`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
   `frame-ancestors 'none'`. Sin `unsafe-eval`.
2. Cliente: `openapi-typescript` (dev) solo para tipos + `fetch` propio, sin `openapi-fetch`. `schema.ts` se versiona y
   queda fuera de la cobertura; `openapi.json` es intermedio y va en `.gitignore`.
3. Sin TanStack Query ni dagre/d3-hierarchy: caché propia (`ViewCache`) y disposición propia (`layoutTree`).
   Ante una mutación exitosa se vacía la caché y se guarda la ventana actual; ante un error se borra la ventana
   actual y se vuelve a pedir.
4. API simulada con un `fetch` falso propio (`src/test/fakeApi.ts`), sin MSW. En jsdom React Flow no mide los nodos
   (quedan `visibility: hidden`), así que los tests buscan por `data-testid`/etiqueta y usan `fireEvent.click` (el
   `mousedown` de user-event rompe d3-zoom en jsdom).
5. pnpm 10.29.3 (fijado en el Dockerfile con corepack); `pnpm.onlyBuiltDependencies: ["esbuild"]`.
6. Proxy sin `changeOrigin` (el Host sigue siendo `localhost:5173`). Hay que verificarlo con el arranque manual.
7. Selección: después de borrar, el hermano anterior o el padre; al cambiar el foco, el foco.
8. Un colapsado muestra "+k" con borde punteado; uno del borde, "+k" relleno. Espacio sobre un nodo del borde no hace
   nada. Tab sobre un nodo del borde o colapsado tampoco (el hijo quedaría oculto).
9. `409`: se revierte, se avisa y se vuelve a pedir la ventana, sin reintento.
10. Descendientes para borrar: los cargados + los `child_count` de los nodos sin hijos cargados; si falta algún nivel,
    la confirmación dice "al menos N". Sin `descendant_count` en la API.
11. Se incluyen todos los atajos del ADR 0009.
12. No se muestra el avatar (no hace falta `img-src` externo).
- Extra: las mutaciones van en una cola en orden, así cada `PATCH` lleva la `version` vigente y el hermano creado con
  Enter usa el `sort_key` que la API le asignó al anterior.
- Extra: borrar el foco (no la raíz) navega a su padre después del `DELETE`.
- Extra: React Flow con `panActivationKeyCode`, `deleteKeyCode` y demás teclas en `null` y `zoomOnDoubleClick` apagado,
  para que el teclado y el doble click los maneje la app.

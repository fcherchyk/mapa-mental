# mapa-mental

App web para que una persona con cuenta de Google arme un único mapa mental de ideas y lo recorra enfocando un nodo por vez, viendo como mucho N niveles hacia abajo. El primer corte tiene la API FastAPI sobre PostgreSQL (`api/`) y la SPA React + TypeScript con Vite y React Flow (`web/`), que se hablan por `/api` desde el mismo origen `localhost:5173`.

## Funcionalidades

- Login con Google del lado del servidor (Authorization Code con `state` y `nonce`, scopes `openid email profile`); el navegador solo recibe una cookie `HttpOnly`. La SPA muestra una pantalla de login si no hay sesión o si vence; "Salir" cierra la sesión.
- Primer login: crea el usuario, su mapa y el nodo raíz con su nombre.
- `GET /api/me` con el usuario, sus preferencias y `root_node_id`; logout.
- Preferencia `depth` (1 a 10, por defecto 3) con `PATCH /api/me/settings`, elegible desde el selector "Niveles visibles".
- Ventana visible `GET /api/nodes/{id}/view?depth=N`: foco, ancestros y hasta N niveles con `child_count`, respetando `collapsed`. La SPA la cachea por `(nodo, N)`.
- Lienzo con React Flow: árbol horizontal dispuesto automáticamente, zoom y desplazamiento.
- Foco en la URL (`/` es la raíz, `/n/:nodeId` cualquier otro nodo); atrás, adelante y recarga funcionan.
- Navegación: doble click enfoca un nodo, doble click en el foco sube un nivel; miga de pan; Enter enfoca el seleccionado y Retroceso sube.
- Botón "+" en cada nodo: crea un hijo en edición, igual que Tab. Se ve en el nodo foco y en el seleccionado, y en los demás al pasar el mouse. No aparece mientras el nodo está en edición o pendiente. En un nodo del borde, el foco se mueve un nivel hacia él y el hijo se crea ahí; en un colapsado, primero se expande.
- Botón 🗑 en cada nodo (con `aria-label` "Borrar …"), igual que el "+": se ve en el foco, en el seleccionado y al pasar el mouse. No aparece en la raíz real del mapa ni en nodos pendientes. Hace lo mismo que Supr.
- Borrar una hoja (sin hijos visibles ni ocultos) no pide confirmación. Borrar un nodo con hijos abre un diálogo accesible por teclado, con el foco inicial en "Cancelar", y tres opciones: "Borrar todo a partir de acá" (el nodo y todo su subárbol, indicando cuántos descendientes hay), "Borrar solo este y subir sus hijos" (los hijos pasan al padre, en el lugar del nodo y en su orden, con sus subárboles intactos) o "Cancelar". Escape también cancela.
- Botón "?" en el encabezado: abre un panel con los atajos de teclado. Escape o un nuevo click lo cierran y devuelven el foco al botón.
- Pista "Tocá + o Tab para agregar una idea" mientras el foco es la raíz y no tiene hijos.
- Al terminar una edición (lápiz, "+", Tab o F2) el foco vuelve al mapa, así que los atajos siguen funcionando sin hacer click en otro lado.
- Nodos del borde con indicador "+k" de hijos ocultos (se enfocan para verlos); los colapsados muestran "+k" con borde punteado.
- Edición optimista con reversión y aviso si la API falla: Tab crea un hijo, Enter (editando) crea un hermano, F2 o el lápiz renombran, Espacio colapsa o expande, Supr borra (una hoja sin preguntar; un nodo con hijos abre el diálogo de borrado) y las flechas mueven la selección.
- Crear hijos (`POST /api/nodes/{id}/children`, con `after_sort_key` opcional), editar con control de versión (`PATCH /api/nodes/{id}`) y borrar (`DELETE /api/nodes/{id}`). Con `?children=cascade` (por defecto) se borra el subárbol; con `?children=reparent` se borra solo el nodo y sus hijos directos pasan al padre, en una transacción, con `sort_key` nuevos entre sus hermanos y el subárbol de cada hijo intacto. Otro valor responde `422`. Títulos de 1 a 200 caracteres, con los espacios de los extremos recortados.
- Aislamiento por usuario: un nodo ajeno responde `404` y la SPA muestra "No encontrado".
- Protección CSRF: toda mutación exige el header `X-CSRF: 1`. Los títulos se dibujan siempre como texto y la SPA se sirve con `Content-Security-Policy`.

## Instalación

Requisitos: Docker (OrbStack en la Mac), `uv`, Node 22+ y `pnpm` 10.

1. Crear credenciales OAuth en Google Cloud (tipo "Aplicación web", pantalla de consentimiento en modo *Testing*) y dar de alta como usuarios de prueba las cuentas que van a entrar.
2. Registrar el redirect URI `http://localhost:5173/api/auth/callback` (es el valor por defecto de `GOOGLE_REDIRECT_URI`).
3. `cp .env.example .env` y completar `POSTGRES_PASSWORD`, `DATABASE_URL` (con la misma contraseña), `SESSION_SECRET`, `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. Dejar `POST_LOGIN_REDIRECT=/` para volver a la SPA después del login.
4. Para desarrollar fuera de Docker: `uv sync --directory api` y `pnpm --dir web install --frozen-lockfile`.

## Uso

```sh
docker compose up --build
```

- `db`: PostgreSQL 16 con el volumen `db-data`.
- `api`: aplica las migraciones y levanta FastAPI con recarga en `http://127.0.0.1:8000`. La documentación OpenAPI queda en `http://127.0.0.1:8000/docs`.
- `web`: Vite en `http://localhost:5173`, con proxy de `/api` hacia `api:8000`. Sus `node_modules` viven en el volumen `web-node-modules` (binarios de Linux).

Abrir `http://localhost:5173` y entrar con Google. Todos los puertos se publican solo en `127.0.0.1`.

Teclado (con el mapa enfocado, fuera de edición): Tab crea un hijo, F2 renombra, Espacio colapsa o expande, Supr borra, Enter enfoca, Retroceso sube y las flechas mueven la selección. Doble click enfoca, y sobre el foco sube un nivel. Editando un título: Enter confirma y crea un hermano, Escape cancela.

Con el mouse o el teclado también se llega a las acciones desde el nodo: el "+" crea un hijo, el 🗑 borra el nodo (con el diálogo si tiene hijos) y el "?" del encabezado muestra la lista de atajos. Con el foco en un botón, Tab recorre los controles del navegador y no crea un hijo.

Para correr la SPA fuera de Docker con la API local: `pnpm --dir web dev` (el proxy apunta a `http://127.0.0.1:8000`, o a `API_PROXY_TARGET`).

Los tipos del cliente (`web/src/api/schema.ts`) siguen el OpenAPI de la API. Para regenerarlos: `pnpm --dir web gen:api`, que exporta `web/openapi.json` con `api/scripts/export_openapi.py` (sin levantar el servidor) y corre `openapi-typescript`.

## Tests

Con Docker abierto:

```sh
uv run --directory api pytest -q --cov=app --cov-report=term-missing --cov-fail-under=80
pnpm --dir web exec vitest run --coverage
```

- Backend: levanta un PostgreSQL 16 efímero con `testcontainers`, lo migra con Alembic y simula a Google con un OIDC falso, así que no sale a la red ni usa la base de desarrollo.
- Frontend: Vitest + Testing Library en jsdom contra una API en memoria (`web/src/test/fakeApi.ts`). Falla si la cobertura de líneas queda por debajo del 80%.

Los tests de borrado cubren los dos modos: `api/tests/test_delete_modes.py` (cascade, reparent, atomicidad, CSRF, aislamiento, validación) y `web/src/deleteModes.test.tsx` (botón, hoja, diálogo, reparent, cancelar y foco).

En el frontend, `web/src/actions.test.tsx` agrupa los tests en bloques `criterio N: …` y cada test empieza con `CAN:` (criterio N, caso N), para ubicar qué criterio de la spec cubre.

## Estructura

```
docker-compose.yml        servicios db, api y web (puertos solo en 127.0.0.1)
.env.example              variables de entorno, sin valores reales
api/
  pyproject.toml, uv.lock entorno uv (pytest, pytest-cov, testcontainers en dev)
  Dockerfile
  alembic.ini, migrations/ migraciones (0001: users, sessions, maps, nodes)
  scripts/export_openapi.py  escribe el OpenAPI sin levantar el servidor
  app/
    main.py               create_app: middleware, routers con prefijo /api
    config.py             variables de entorno
    db.py, models.py      SQLAlchemy 2
    auth/                 OAuth con Google, sesiones, CSRF, /me
    settings/             preferencias del usuario (depth)
    nodes/                ventana (CTE recursiva), crear, editar, borrar (cascade o reparent), sort_keys
    node_types/           registro de tipos (idea) y validación de props
    integrations/         vacío en el primer corte
  tests/                  pytest + httpx contra PostgreSQL de testcontainers
web/
  package.json, pnpm-lock.yaml  pnpm (solo esbuild puede correr scripts de instalación)
  Dockerfile              Node 22 + pnpm con corepack
  index.html              entrada de la SPA
  vite.config.ts          servidor (proxy /api, CSP) y configuración de Vitest (umbral 80% de líneas)
  src/
    main.tsx, styles.css  arranque de React y estilos
    App.tsx, session.tsx  sesión (/api/me, login, logout, N) y rutas / y /n/:nodeId
    actions.test.tsx      tests de las acciones del mapa (botón +, ayuda, foco tras editar, pista)
    deleteModes.test.tsx  tests de borrado (botón 🗑, hoja, diálogo, reparent, cancelar, foco)
    api/                  cliente fetch con X-CSRF y tipos del OpenAPI (schema.ts)
    components/           login, "No encontrado", miga de pan, SettingsPanel, ShortcutsHelp (botón "?" y panel de atajos), DeleteDialog (borrar nodos con hijos)
    map/
      tree.ts             ventana normalizada y operaciones puras (insertar, borrar, flechas)
      layout.ts           disposición en árbol horizontal
      viewCache.ts        caché de ventanas por (nodo, N)
      useMapView.ts       carga y mutaciones optimistas
      MapPage.tsx         página del mapa, atajos de teclado, pista inicial y foco tras editar
      MapCanvas.tsx       React Flow
      nodes/              NodeRenderer (elige por kind), IdeaNode, TitleEditor, nodeActions.ts
    test/                 setup de jsdom, API simulada (fakeApi.ts) y helpers
```

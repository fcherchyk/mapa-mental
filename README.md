# mapa-mental

A web app that lets a person with a Google account build a single mind map of ideas and browse it by focusing one node at a time, seeing at most N levels down. The first slice has the FastAPI API on PostgreSQL (`api/`) and the React + TypeScript SPA with Vite and React Flow (`web/`), which talk to each other over `/api` from the same origin, `localhost:5173`.

**Status: MVP.** What is built today is a minimum viable product: login, a single map, and creating, editing, navigating and deleting ideas. The rest of the vision is in the [Roadmap](#roadmap).

### Vision

The map is meant to become the hub for a person's ideas and work:

- **Connected to their tools**: nodes linked to task managers, Google Docs, Google Calendar events, attachments and other services, so each idea carries its related material.
- **Shared with an AI assistant**: the map can be shared with an assistant that uses it as context and has permission to edit it, so the assistant can add, reorganize and update ideas alongside the user.

## Features

- Google login handled on the server (Authorization Code with `state` and `nonce`, scopes `openid email profile`); the browser only receives an `HttpOnly` cookie. The SPA shows a login screen when there is no session or it has expired; "Salir" (Log out) ends the session.
- First login: creates the user, their map and the root node with their name.
- `GET /api/me` returns the user, their preferences and `root_node_id`; logout.
- `depth` preference (1 to 10, default 3) set with `PATCH /api/me/settings`, editable from the "Niveles visibles" (Visible levels) selector.
- Visible window `GET /api/nodes/{id}/view?depth=N`: focus, ancestors and up to N levels down, with `child_count`, respecting `collapsed`. The SPA caches it by `(node, N)`.
- React Flow canvas: horizontal tree laid out automatically, with zoom and pan.
- Focus lives in the URL (`/` is the root, `/n/:nodeId` is any other node); back, forward and reload work.
- Navigation: double-click focuses a node, and double-clicking the focus goes up one level; breadcrumb; Enter focuses the selected node and Backspace goes up.
- "+" button on each node: creates a child in edit mode, same as Tab. It shows on the focused and selected nodes, and on the others when hovered. It does not show while the node is being edited or is pending. On a node at the edge, focus moves one level toward it and the child is created there; on a collapsed node, it is expanded first.
- 🗑 button on each node (with the accessible label "Borrar …" (Delete …)), like the "+" button: it shows on the focus, on the selected node and on hover. It does not show on the real root of the map or on pending nodes. It does the same as Delete.
- Deleting a leaf (no visible or hidden children) asks for no confirmation. Deleting a node with children opens a dialog that is accessible by keyboard, with the initial focus on "Cancelar" (Cancel), and three options: "Borrar todo a partir de acá" (Delete everything from here down), which removes the node and its whole subtree and shows how many descendants there are; "Borrar solo este y subir sus hijos" (Delete only this one and move its children up), where the children move to the parent, in the node's place and order, with their subtrees intact; or "Cancelar" (Cancel). Escape also cancels.
- "?" button in the header: opens a panel with the keyboard shortcuts. Escape or another click closes it and returns focus to the button.
- Hint "Tocá + o Tab para agregar una idea" (Tap + or Tab to add an idea) while the focus is on the root and it has no children.
- When an edit ends (pencil, "+", Tab or F2), focus goes back to the map, so the shortcuts keep working without clicking anywhere else.
- Edge nodes show a "+k" indicator with the number of hidden children (focus them to see those); collapsed nodes show "+k" with a dotted border.
- Optimistic editing with rollback and a notice if the API fails: Tab creates a child, Enter (while editing) creates a sibling, F2 or the pencil renames, Space collapses or expands, Delete removes (a leaf without asking; a node with children opens the delete dialog), and the arrow keys move the selection.
- Create children (`POST /api/nodes/{id}/children`, with an optional `after_sort_key`), edit with version control (`PATCH /api/nodes/{id}`) and delete (`DELETE /api/nodes/{id}`). With `?children=cascade` (the default) the whole subtree is deleted; with `?children=reparent` only the node is deleted and its direct children move to its parent, in one transaction, with new `sort_key` values between their siblings and each child's subtree intact. Any other value returns `422`. Titles are 1 to 200 characters, with leading and trailing spaces trimmed.
- User isolation: a node that belongs to someone else returns `404`, and the SPA shows "No encontrado" (Not found).
- CSRF protection: every mutation requires the `X-CSRF: 1` header. Titles are always rendered as text, and the SPA is served with a `Content-Security-Policy`.

## Installation

Requirements: Docker (OrbStack on the Mac), `uv`, Node 22+ and `pnpm` 10.

### Google OAuth setup

1. **Create a Google Cloud project.** Go to the [Google Cloud Console](https://console.cloud.google.com/), open the project selector and click **New project**.
2. **Configure the OAuth consent screen in *Testing* mode.** Open **APIs & Services → OAuth consent screen** (Google also calls this area Google Auth Platform), fill in the app details and keep the publishing status at **Testing**. Then, under **Test users**, add the Google accounts that will sign in. While the app is in Testing, only those accounts can log in.
3. **Create an OAuth client of type "Web application".** Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**, choose **Web application** and, under **Authorized redirect URIs**, add exactly `http://localhost:5173/api/auth/callback`.
4. **Copy the client ID and secret into `.env`.** Run `cp .env.example .env` and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the values of the client you just created. `.env` holds secrets and is listed in `.gitignore`: **never commit it.**
5. **Generate the secrets.**
   - `SESSION_SECRET`: run `python -c "import secrets; print(secrets.token_urlsafe(32))"` and paste the output.
   - `POSTGRES_PASSWORD`: choose a password and write the same value into `DATABASE_URL`, which has the form `postgresql+psycopg://mapa:<password>@db:5432/mapa`. Use only letters and digits, so the URL does not need escaping.
6. **Start everything with Docker.** From the project folder, run `docker compose up --build`. From another folder, run `docker compose --project-directory <path> up --build`. Then open `http://localhost:5173` and sign in with Google.

Local data lives in the Docker volume `db-data`. `docker compose down` keeps it, but **`docker compose down -v` deletes the volume and all local data.**

To develop outside Docker: `uv sync --directory api` and `pnpm --dir web install --frozen-lockfile`.

## Usage

```sh
docker compose up --build
```

- `db`: PostgreSQL 16 with the `db-data` volume.
- `api`: applies the migrations and runs FastAPI with reload at `http://127.0.0.1:8000`. The OpenAPI docs are at `http://127.0.0.1:8000/docs`.
- `web`: Vite at `http://localhost:5173`, proxying `/api` to `api:8000`. Its `node_modules` live in the `web-node-modules` volume (Linux binaries).

Open `http://localhost:5173` and sign in with Google. All ports are published only on `127.0.0.1`.

Keyboard (with the map focused, not editing): Tab creates a child, F2 renames, Space collapses or expands, Delete removes, Enter focuses, Backspace goes up, and the arrow keys move the selection. Double-click focuses a node, and double-clicking the focus goes up one level. While editing a title: Enter confirms and creates a sibling, and Escape cancels.

With the mouse or the keyboard you can also reach the actions from the node: the "+" creates a child, the 🗑 deletes the node (with the dialog if it has children), and the "?" in the header shows the list of shortcuts. With focus on a button, Tab moves between the browser's controls and does not create a child.

To run the SPA outside Docker against a local API: `pnpm --dir web dev` (the proxy points to `http://127.0.0.1:8000`, or to `API_PROXY_TARGET`).

The client types (`web/src/api/schema.ts`) follow the API's OpenAPI. To regenerate them, run `pnpm --dir web gen:api`, which exports `web/openapi.json` with `api/scripts/export_openapi.py` (without starting the server) and then runs `openapi-typescript`.

## Tests

With Docker running:

```sh
uv run --directory api pytest -q --cov=app --cov-report=term-missing --cov-fail-under=80
pnpm --dir web exec vitest run --coverage
```

- Backend: starts an ephemeral PostgreSQL 16 with `testcontainers`, migrates it with Alembic and simulates Google with a fake OIDC provider, so it does not reach the network or use the development database.
- Frontend: Vitest + Testing Library on jsdom, against an in-memory API (`web/src/test/fakeApi.ts`). It fails if line coverage drops below 80%.

The delete tests cover both modes: `api/tests/test_delete_modes.py` (cascade, reparent, atomicity, CSRF, isolation, validation) and `web/src/deleteModes.test.tsx` (button, leaf, dialog, reparent, cancel and focus).

In the frontend, `web/src/actions.test.tsx` groups the tests into blocks named `criterio N: …` (criterion N of the spec), and each test starts with `CAN:` (criterion N, case N), so you can see which spec criterion it covers.

## Structure

```
docker-compose.yml        services db, api and web (ports only on 127.0.0.1)
.env.example              environment variables, without real values
api/
  pyproject.toml, uv.lock uv environment (pytest, pytest-cov, testcontainers in dev)
  Dockerfile
  alembic.ini, migrations/ migrations (0001: users, sessions, maps, nodes)
  scripts/export_openapi.py  writes the OpenAPI without starting the server
  app/
    main.py               create_app: middleware, routers with the /api prefix
    config.py             environment variables
    db.py, models.py      SQLAlchemy 2
    auth/                 Google OAuth, sessions, CSRF, /me
    settings/             user preferences (depth)
    nodes/                window (recursive CTE), create, edit, delete (cascade or reparent), sort_keys
    node_types/           node type registry (idea) and props validation
    integrations/         empty in the first slice
  tests/                  pytest + httpx against a testcontainers PostgreSQL
web/
  package.json, pnpm-lock.yaml  pnpm (only esbuild may run install scripts)
  Dockerfile              Node 22 + pnpm with corepack
  index.html              SPA entry point
  vite.config.ts          server (/api proxy, CSP) and Vitest config (80% line threshold)
  src/
    main.tsx, styles.css  React bootstrap and styles
    App.tsx, session.tsx  session (/api/me, login, logout, N) and the / and /n/:nodeId routes
    actions.test.tsx      tests for the map actions (+ button, help, focus after editing, hint)
    deleteModes.test.tsx  delete tests (🗑 button, leaf, dialog, reparent, cancel, focus)
    api/                  fetch client with X-CSRF and the OpenAPI types (schema.ts)
    components/           login, not-found page ("No encontrado"), SettingsPanel, ShortcutsHelp ("?" button and shortcuts panel), DeleteDialog (deleting nodes with children)
    map/
      tree.ts             normalized window and pure operations (insert, delete, arrows)
      layout.ts           horizontal tree layout
      viewCache.ts        window cache by (node, N)
      useMapView.ts       loading and optimistic mutations
      MapPage.tsx         map page, keyboard shortcuts, first-use hint and focus after editing
      MapCanvas.tsx       React Flow
      nodes/              NodeRenderer (picks the component by kind), IdeaNode, TitleEditor, nodeActions.ts
    test/                 jsdom setup, the fake API (fakeApi.ts) and helpers
```

## Roadmap

- [x] Google login
- [x] Single map per user, with focus navigation and N visible levels
- [x] Create, edit, collapse and expand nodes
- [x] Discoverable actions and keyboard shortcuts help ("+" button, "?" panel, first-use hint)
- [x] Delete nodes, either the whole subtree or moving the children up to the parent
- [ ] Move and reorder nodes by dragging (uses `sort_key`)
- [ ] Other node kinds: Google Drive documents, spreadsheets, calendar events, tasks, repositories or projects
- [ ] Integrations with Google Calendar, Trello and GitHub
- [ ] Mobile app that reuses the API, starting with a PWA
- [ ] Deployment beyond local
- [ ] Integrations with task management tools, Google Docs links, attachments and other services
- [ ] Share the map with an AI assistant as context, with edit permissions
- [ ] Better design and usability
- [ ] Mobile-friendly view
- [ ] Multi-language support
- [ ] Filtered views: build cut-outs of the map from filters
- [ ] Relate ideas across different branches of the tree

## License

MIT, see LICENSE

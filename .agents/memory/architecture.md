# Architecture

This document describes **what exists today**. It carries no roadmap: the list of what is still to
be built lives only in `README.md`, and what each delivered slice guarantees lives in
`docs/slices/`.

## Summary

A web application that lets a person with a Google account build their mind map, which is a single
one: they create ideas and tasks, organize them in a tree and navigate by focusing nodes.
Double-clicking a node makes it the visible root, and the screen shows at most N levels down. Each
user chooses N, and it defaults to 3. Two kinds of node exist, `idea` and `task`, and everything
runs locally with docker compose. The model and the API already allow a node to later be a Drive
document, a spreadsheet, an event or a repository, and a mobile app to use the same backend.

## Components

```
[React/TS SPA (Vite)] --local HTTP + session cookie--> [FastAPI API] --> [PostgreSQL]
                                                              |
                                                              +--> Google OAuth (login)
```

- **Local environment (docker compose)**: three services.
  - `db`: PostgreSQL 16 with a persistent volume.
  - `api`: FastAPI with hot reload.
  - `web`: Vite, which proxies `/api` to the backend. Everything is served from the same origin
    (`localhost:5173`), so no CORS is needed.
- **Frontend (SPA)**
  - **Routes**: `/` shows the root and `/n/:nodeId` shows a focused node. Since the focus lives in
    the URL, the "back" button, links and page reloads work.
  - **`MapPage`**: requests the window for the current focus from the server, draws it, and owns
    the keyboard shortcuts and the first-use hint (decision 13A).
  - **`MapCanvas`**: React Flow. The horizontal tree layout is computed on the client over the
    visible window, in `map/layout.ts`. Positions are never stored, so moving a node is a drop on
    a target and not a position: nodes are dragged with the browser's own drag and drop, node
    bodies take a drop as "become the last child", and while a drag is in progress an insertion
    line (`GapDropZone`) is drawn in each gap among the dragged node's own siblings. The rules
    live in `map/dropTarget.ts`.
  - **`Breadcrumb`**: shows root › … › focus, and each ancestor is clickable.
  - **`NodeRenderer`**: picks the component by `kind`, `IdeaNode` or `TaskNode`; `nodeChrome`
    holds what both share (classes, drag wiring, 🗑). Border nodes show "+k", the number of hidden
    direct children, and cannot be expanded (12A). A task draws a left stripe coloured by its
    status (blue to do, yellow in progress, green done) and its checklist progress `done/total`;
    the status word is only an accessible label, and lives visibly in the panel.
  - **`SettingsPanel`**: a control for N between 1 and 10 that saves through `PATCH /me/settings`
    (11A).
  - **`ShortcutsHelp`**: the "?" button and the panel listing the shortcuts.
  - **`DeleteDialog`**: the choice between deleting a subtree and moving the children up, shown
    whenever the node being deleted has children.
  - **Navigation (10A)**:
    - Double-clicking a node focuses it.
    - Double-clicking the node that is already the focus goes up one level. On the root it does
      nothing.
    - Shortcuts that do not replace double-click: the breadcrumb, the "back" button, Enter to focus
      and Backspace to go up.
  - **Editing**:
    - Tab or the "+" button creates a child idea; Shift+Tab or the "☑" button creates a child
      task. A task takes no children, so it offers neither button and is not focusable (slice 4A).
    - Enter, while creating inline, creates a sibling of the same kind.
    - The arrow keys move the selection.
    - Space collapses or expands.
    - Selecting a node opens a details panel on the right with its title and description,
      editable and saved on blur; F2 goes to its title. There is no pencil (slice 3). For a task
      the panel also carries a status segmented control (`StatusControl`) and a checklist editor
      (`ChecklistEditor`) with add, toggle, rename, remove and drag reorder; each change sends the
      whole `props` (slice 4A).
    - Delete or the 🗑 button deletes.
    - Dragging, or Alt with the arrow keys, moves an idea or a task: Alt+↑ and Alt+↓ among its
      siblings, Alt+→ into the idea above it and Alt+← out to its grandparent. A task never takes
      the drop. A new parent always takes it as the last child, so moving somewhere and placing
      it precisely are two gestures.
    - Breadcrumb entries accept a drop, which moves the idea up to that ancestor.
    - When an edit ends, focus returns to the map container, so the shortcuts keep working.
  - **State**: optimistic updates with rollback and a cache of windows by `(nodeId, N)` that is
    invalidated when something changes.
  - **API client**: typed, generated from FastAPI's OpenAPI into `web/src/api/schema.ts`.
- **Backend (FastAPI, Python 3.12)**
  - `auth`: login, OAuth callback, logout and `/me`.
  - `nodes`: service and repository for the tree. Includes the window query, a recursive CTE with
    maximum depth `depth`, and the fractional `sort_key` arithmetic.
  - `settings`: user preferences, validated with Pydantic (`depth` between 1 and 10).
  - `node_types`: registry of node types, each with its Pydantic schema for `props` and a flag
    saying whether it takes children. `idea` has empty props and nests; `task` has
    `{status, checklist}` and is a leaf (at most 30 items of at most 100 characters).
  - `integrations`: empty. It will have a `Provider` interface per external service.
  - Persistence with SQLAlchemy 2 and migrations with Alembic.
- **REST API**
  - `GET /me` returns the user, their `settings` and the `root_node_id`.
  - `PATCH /me/settings` takes `{ depth }`.
  - `GET /nodes/{id}/view?depth=N` returns `{ focus, ancestors[], nodes[] }`.
    - Each node includes `child_count`.
    - If `depth` is missing, the user's own is used.
  - `POST /nodes/{id}/children` takes `{ title, after_sort_key?, kind?, props? }`; `kind` defaults
    to `idea` and the kind's schema fills in the defaults for `props`. A task parent answers `422`.
  - `PATCH /nodes/{id}` changes `title`, `description`, `collapsed`, `sort_key` or `props` and
    requires `version`. If the version is stale, it responds `409`. `kind` is **not** patchable:
    a node is born its kind and changing it means deleting and creating another (slice 4A).
    `props` is validated by the stored kind and always replaced whole.
  - `POST /nodes/{id}/move` takes `{ parent_id, place, version }`, where `place` is `"first"`,
    `"last"` or `{ "after_id": … }`. The server computes the `sort_key`, so the client never does
    fractional-index arithmetic. It refuses to move the root, to put a node inside its own
    subtree, or to give a leaf kind children (`422`), and only the moved row is written: the
    subtree follows its parent.
  - `DELETE /nodes/{id}?children=cascade|reparent` deletes the node. With `cascade`, the default,
    the whole subtree goes; with `reparent`, only the node goes and its direct children move up to
    its parent, in its place and order, in one transaction. The root cannot be deleted (`422`).

## Data model

- **users**: `id` (uuid), `google_sub` (unique), `email`, `name`, `avatar_url`, `settings` (jsonb,
  `{"depth": 3}`), `created_at`.
- **sessions**: `id` (hash of a random token), `user_id`, `expires_at`, `created_at`.
- **maps**: `id`, `owner_id` (**unique**), `root_node_id`, `created_at`.
  - Created on the first login, together with its root node, which carries the user's name and can
    be renamed.
  - The table exists even though each user has a single map: moving to several maps or to shared
    maps means dropping the `unique`, with no data migration.
- **nodes**:
  - `id` (uuid), `map_id` and `parent_id` (empty only on the root).
  - `kind` (text, `'idea'` or `'task'`) and `title`.
  - `sort_key` (text with a fractional index). There is always a key between two keys, so inserting
    between siblings, or moving one, only writes that node's row.
  - `collapsed` (boolean).
  - `props` (jsonb): `{}` for an idea, `{status, checklist}` for a task. Validated per kind, so a
    checklist never reaches the database unchecked.
  - `version`, `created_at` and `updated_at`.
  - Indexes: `(map_id)` and `(parent_id, sort_key)`. The second one is used by the window CTE and
    by the `child_count` calculation.

**How collapsing and depth combine**: `collapsed` is stored per node and respected inside the
window. If a collapsed node is within the N levels, it still hides its children. Nodes at level N
show "+k", and to see what is below them you have to focus them.

**How it grows without painful migrations**:

- `kind` is text and not a database enum: a new type is a new value plus its validation schema.
- Each type's own data goes in `props` and is validated by `kind`.
- Linking a node to an external service means adding two tables, with no change to `nodes`:
  **external_refs** (`node_id`, `provider`, `external_id`, `url`, `metadata`, `synced_at`) and
  **oauth_grants** (`user_id`, `provider`, `scopes`, `refresh_token_enc`, `updated_at`).
- If links between branches are needed, an `edges` table is added, also without touching `nodes`.

## Integrations

- **Google OAuth 2.0 (6A)**: server-side Authorization Code flow, with Authlib.
  - Redirect to `http://localhost:5173/api/auth/callback`.
  - The app stays in *Testing* mode: test users have to be added and it does not need verification.
    In *Testing* mode refresh tokens expire after 7 days, which does not matter while no refresh
    token is stored.
- **Scopes (7A)**: only `openid email profile` are requested, and login grants no access to Drive
  or to any other service. Any further scope is to be requested incrementally, at the moment the
  user asks for the feature that needs it, and never at login.
- No other service is integrated. The `integrations` package is the empty seam where the first
  `Provider` will go.

## Security and data

- **Data**: lives in the local PostgreSQL, in a docker volume. From Google only the identity is
  stored: `sub`, email and name.
- **Secrets**: go in a `.env` that is in `.gitignore`. The repo ships a `.env.example`.
  - Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `DATABASE_URL` and
    `POSTGRES_PASSWORD`.
- **Tokens**: no Google token is stored, and none reaches the browser.
- **Session**:
  - `HttpOnly` cookie with `SameSite=Lax`. The `Secure` attribute is set through an environment
    variable.
  - Mutations require the `X-CSRF: 1` header, as a CSRF defense.
  - The OAuth flow uses `state` and `nonce`.
- **Risks**:
  - **IDOR** (access to other users' nodes): every node query joins on `maps.owner_id = user`.
    There are specific tests, including `/view` on another user's node.
  - **Expensive queries**: `depth` is limited to 1–10 and the CTE has a depth cap.
  - **XSS**: React escapes titles, user HTML is never rendered and there is a CSP.
  - **Mass deletions**: if the node has descendants, confirmation is requested, stating how many
    will be deleted and offering to keep them by moving them up.
  - **Exposure**: ports are published only on `127.0.0.1`.
  - **Data loss**: not addressed. The only copy of the data is the `db-data` docker volume, and
    `docker compose down -v` destroys it. There is no backup script.
- **Privacy**: there is **no** endpoint to delete the account and its data. It is a recorded gap in
  `docs/slices/slice-1-mvp.md`.

## Open decisions

**14. Do decisions 6A and 7A become workspace standards, in `codigo.md`?** `[standard candidate]`

- A) Yes. Two rules are added: "Web auth: the backend does the OAuth and the browser only receives
  an `HttpOnly` cookie" and "OAuth: minimal scopes and incremental authorization".
- B) No. They stay for this project only.
- **A is recommended**, because any project that integrates Google, Trello or GitHub will repeat
  this same discussion.

## Decisions made

- **1A. FastAPI with a React/TypeScript SPA (Vite)** (your answer). Becomes a standard through 9A.
- **2A. Canvas with React Flow** (your answer).
- **3A. Automatic horizontal tree layout** (your answer). Computed over the visible window.
- **4A. PostgreSQL** (your answer). Becomes a standard through 9A.
- **5C. Everything local with docker compose** (your answer). Secrets go in `.env`.
- **6A. The backend does the OAuth (BFF pattern) and the browser receives an `HttpOnly` cookie**
  (your answer). Tokens stay out of reach of an XSS and the mobile app can reuse the same backend.
- **7A. Minimal scopes, and any further access requested incrementally** (your answer). This
  deliberately departs from the original request to grant Drive access at login.
- **8. A single map per user, with focus navigation and at most N visible levels** (your answer).
  Deeper levels are only reached by navigating.
- **9A. Move two standards into `codigo.md`: "Web: Python API (FastAPI) + TypeScript/React SPA
  (Vite)" and "Default database: PostgreSQL"** (your answer). It still has to be applied in
  `codigo.md`, because my role does not modify files.
- **10A. Double-clicking a node focuses it; double-clicking the focus goes up one level; on the
  root it does nothing** (your answer). The breadcrumb, the "back" button and keyboard shortcuts
  are added. Renaming moves to F2 or the pencil.
- **11A. N is a per-user preference, stored in `users.settings`** (your answer). It ranges from 1
  to 10 and defaults to 3.
- **12A. Border nodes show "+k" with the number of hidden direct children and cannot be expanded**
  (your answer).
- **13A. The server sends only the visible window: focus, N levels down, ancestors and
  `child_count`** (your answer). The client caches the windows it has already visited.
- **Backend in Python 3.12+** (standard).
- **Everything versioned in English** (standard, updated 2026-10-31; it originally said "code and
  names in English; comments and documentation in Spanish").
- **Tests for every behavior change** (standard): pytest with httpx on the backend and Vitest on
  the frontend. Every acceptance criterion is named in the test that covers it; see
  `docs/slices/README.md`.
- **Secrets only in environment variables** (standard).
- **Justified dependencies** (standard):
  - FastAPI, SQLAlchemy/Alembic and Authlib on the backend.
  - React Flow and React Router on the frontend. React Router is needed so the focus lives in the
    URL.
- **Web first, with the API separate from the frontend** (request).
- **Google login** (request).
- **Nodes with `kind` and `props`, and external references in a separate table** (request).

## Open decisions

Only one is left. It is number 14, which reached you cut off in the previous message.

**14. Do we move decisions 6A and 7A into `codigo.md`?** `[standard candidate]`
- A) Yes. Two rules are added: "Web auth: the backend does the OAuth and the browser only receives an `HttpOnly` cookie" and "OAuth: minimal scopes and incremental authorization".
- B) No. They stay for this project only.
- **I recommend A**, because any project that integrates Google, Trello or GitHub will repeat this same discussion.

If you answer 14, the architecture is ready for approval.

## Summary

It is a web application that lets a person with a Google account build their mind map, which is a single one: they create ideas, organize them in a tree and navigate by focusing nodes. Double-clicking a node makes it the visible root, and the screen shows at most N levels down. Each user chooses N, and it defaults to 3. The first slice only has "idea" nodes with a title and runs locally with docker compose. The model and the API already allow a node to later be a Drive document, a spreadsheet, an event, a task or a repository, and a mobile app to use the same backend.

## Components

```
[React/TS SPA (Vite)] --local HTTP + session cookie--> [FastAPI API] --> [PostgreSQL]
                                                              |
                                                              +--> Google OAuth (login)
                                                              +--> (future) Drive / Calendar / Trello / GitHub
```

- **Local environment (docker compose)**: three services.
  - `db`: PostgreSQL 16 with a persistent volume.
  - `api`: FastAPI with hot reload.
  - `web`: Vite, which proxies `/api` to the backend. Everything is served from the same origin (`localhost:5173`), so no CORS is needed.
- **Frontend (SPA)**
  - **Routes**: `/` shows the root and `/n/:nodeId` shows a focused node. Since the focus lives in the URL, the "back" button, links and page reloads work.
  - **`FocusView`**: requests the window for the current focus from the server and draws it (decision 13A).
  - **`MapCanvas`**: React Flow. The horizontal tree layout is computed on the client over the visible window.
  - **`Breadcrumb`**: shows root › … › focus, and each ancestor is clickable.
  - **`NodeRenderer`**: picks the component by `kind`. In the first slice only `IdeaNode` exists. Border nodes show "+k", the number of hidden direct children, and cannot be expanded (12A).
  - **`SettingsPanel`**: a control for N between 1 and 10 that saves through `PATCH /me/settings` (11A).
  - **Navigation (10A)**:
    - Double-clicking a node focuses it.
    - Double-clicking the node that is already the focus goes up one level. On the real root it does nothing.
    - Shortcuts that do not replace double-click: the breadcrumb, the "back" button, Enter to focus and Backspace to go up.
  - **Editing**:
    - Tab creates a child.
    - Enter, while editing, creates a sibling.
    - The arrow keys move the selection.
    - Space collapses or expands.
    - F2 or the pencil icon renames.
    - Delete deletes.
  - **State**: `useReducer`, optimistic updates and a cache of windows by `(nodeId, N)` that is invalidated when something changes.
  - **API client**: typed, generated from FastAPI's OpenAPI.
- **Backend (FastAPI, Python 3.12)**
  - `auth`: login, OAuth callback, logout and `/me`.
  - `nodes`: service and repository for the tree. Includes the window query, a recursive CTE with maximum depth `depth`.
  - `settings`: user preferences, validated with Pydantic (`depth` between 1 and 10).
  - `node_types`: registry of node types, each with its Pydantic schema for `props`. In the first slice only `idea` exists.
  - `integrations`: empty in the first slice. It will have a `Provider` interface per external service.
  - Persistence with SQLAlchemy 2 and migrations with Alembic.
- **REST API**
  - `GET /me` returns the user, their `settings` and the `root_node_id`.
  - `PATCH /me/settings` takes `{ depth }`.
  - `GET /nodes/{id}/view?depth=N` returns `{ focus, ancestors[], nodes[] }`.
    - Each node includes `child_count`.
    - If `depth` is missing, the user's own is used.
  - `POST /nodes/{id}/children` takes `{ title, after_sort_key? }`.
  - `PATCH /nodes/{id}` changes `title`, `collapsed` or `sort_key` and requires `version`. If the version is stale, it responds `409`.
  - `DELETE /nodes/{id}` deletes the node with its whole subtree. The root cannot be deleted (`422`).

## Data model

- **users**: `id` (uuid), `google_sub` (unique), `email`, `name`, `avatar_url`, `settings` (jsonb, `{"depth": 3}`), `created_at`.
- **sessions**: `id` (hash of a random token), `user_id`, `expires_at`, `created_at`.
- **maps**: `id`, `owner_id` (**unique**), `root_node_id`, `created_at`.
  - Created on the first login, together with its root node, which carries the user's name and can be renamed.
  - The table exists even though each user has a single map: moving to several maps or to shared maps means dropping the `unique`, with no data migration.
- **nodes**:
  - `id` (uuid), `map_id` and `parent_id` (empty only on the root).
  - `kind` (text, `'idea'` today) and `title`.
  - `sort_key` (text with a fractional index).
  - `collapsed` (boolean).
  - `props` (jsonb, `{}`).
  - `version`, `created_at` and `updated_at`.
  - Indexes: `(map_id)` and `(parent_id, sort_key)`. The second one is used by the window CTE and by the `child_count` calculation.

**How collapsing and depth combine**: `collapsed` is stored per node and respected inside the window. If a collapsed node is within the N levels, it still hides its children. Nodes at level N show "+k", and to see what is below them you have to focus them.

**How it grows without painful migrations**:
- `kind` is text and not a database enum: a new type is a new value plus its validation schema.
- Each type's own data goes in `props` and is validated by `kind`.
- Slice 2 adds two tables:
  - **external_refs**: `node_id`, `provider`, `external_id`, `url`, `metadata` (jsonb), `synced_at`.
  - **oauth_grants**: `user_id`, `provider`, `scopes`, `refresh_token_enc`, `updated_at`.
- If links between branches are needed later, an `edges` table is added without touching `nodes`.

## Integrations

- **Google OAuth 2.0 (6A)**: server-side Authorization Code flow, with Authlib.
  - Redirect to `http://localhost:5173/api/auth/callback`.
  - The app stays in *Testing* mode: test users have to be added and it does not need verification.
  - In *Testing* mode refresh tokens expire after 7 days. This only matters from slice 2 on.
- **Scopes (7A)**:
  - The first slice only asks for `openid email profile`.
  - Drive access (`drive.file`) is requested incrementally in slice 2, when the user creates their first document node.
  - This deliberately departs from the original request to grant Drive access at login, as you chose in 7.
- **Slice 2**: Google Picker with `drive.file`.
- **Later**: Calendar, Trello and GitHub. Each one uses its own OAuth, requested when connecting the service, and stores its row in `oauth_grants`.

## Security and data

- **Data**: lives in the local PostgreSQL, in a docker volume. From Google only the identity is stored: `sub`, email and name.
- **Secrets**: go in a `.env` that is in `.gitignore`. The repo ships a `.env.example`.
  - Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` and `DATABASE_URL`.
  - From slice 2 on, `TOKEN_ENCRYPTION_KEY` is added.
- **Tokens**: the first slice does not store Google tokens. From slice 2 on, refresh tokens are encrypted with Fernet and never reach the browser.
- **Session**:
  - `HttpOnly` cookie with `SameSite=Lax`. The `Secure` attribute is set through an environment variable.
  - Mutations require a custom header, as a CSRF defense.
  - The OAuth flow uses `state` and `nonce`.
- **Risks**:
  - **IDOR** (access to other users' nodes): every node query joins on `maps.owner_id = user`. There are specific tests, including `/view` on another user's node.
  - **Expensive queries**: `depth` is limited to 1–10 and the CTE has a depth cap.
  - **XSS**: React escapes titles, user HTML is never rendered and there is a CSP.
  - **Data loss**: a `pg_dump` script allows manual backups.
  - **Mass deletions**: if the node has descendants, confirmation is requested, stating how many will be deleted.
  - **Exposure**: ports are published only on `127.0.0.1`.
- **Privacy**: there is an endpoint to delete the account with all its data.

## Delivery slices

1. **First slice** (runs with `docker compose up`):
   - Google login and a single map with its root;
   - create, rename and delete ideas, and collapse or expand them;
   - focus navigation: double-click, breadcrumb, URL and keyboard;
   - an N-level window with the "+k" indicator and N configurable per user;
   - zoom and pan;
   - persistence in PostgreSQL.
2. Move and reorder nodes by dragging, and a "Drive document" node with the Picker and `drive.file` requested incrementally.
3. Spreadsheet and calendar event nodes, with preview and cached metadata.
4. Task and project nodes, with Trello and GitHub integrations.
5. Deployment beyond local and a mobile app on the same API, starting with a PWA.

## Decisions made

- **1A. FastAPI with a React/TypeScript SPA (Vite)** (your answer). Becomes a standard through 9A.
- **2A. Canvas with React Flow** (your answer).
- **3A. Automatic horizontal tree layout** (your answer). Computed over the visible window.
- **4A. PostgreSQL** (your answer). Becomes a standard through 9A.
- **5C. Everything local with docker compose** (your answer). Secrets go in `.env`.
- **6A. The backend does the OAuth (BFF pattern) and the browser receives an `HttpOnly` cookie** (your answer). Tokens stay out of reach of an XSS and the mobile app can reuse the same backend.
- **7A. Minimal scopes and Drive with incremental authorization in slice 2** (your answer).
- **8. A single map per user, with focus navigation and at most N visible levels** (your answer). Deeper levels are only reached by navigating.
- **9A. Move two standards into `codigo.md`: "Web: Python API (FastAPI) + TypeScript/React SPA (Vite)" and "Default database: PostgreSQL"** (your answer). It still has to be applied in `codigo.md`, because my role does not modify files.
- **10A. Double-clicking a node focuses it; double-clicking the focus goes up one level; on the root it does nothing** (your answer). The breadcrumb, the "back" button and keyboard shortcuts are added. Renaming moves to F2 or the pencil.
- **11A. N is a per-user preference, stored in `users.settings`** (your answer). It ranges from 1 to 10 and defaults to 3.
- **12A. Border nodes show "+k" with the number of hidden direct children and cannot be expanded** (your answer).
- **13A. The server sends only the visible window: focus, N levels down, ancestors and `child_count`** (your answer). The client caches the windows it has already visited.
- **Backend in Python 3.12+** (standard).
- **Everything versioned in English** (standard, updated 2026-10-31; it originally said "code and names in English; comments and documentation in Spanish").
- **Tests for every behavior change** (standard): pytest with httpx on the backend and Vitest on the frontend.
- **Secrets only in environment variables** (standard).
- **Justified dependencies** (standard):
  - FastAPI, SQLAlchemy/Alembic and Authlib on the backend.
  - React Flow and React Router on the frontend. React Router is needed so the focus lives in the URL.
  - `cryptography` from slice 2 on, to encrypt refresh tokens.
- **Web first, with the API separate from the frontend** (request).
- **Google login** (request).
- **Nodes with `kind` and `props`, and external references in a separate table** (request).

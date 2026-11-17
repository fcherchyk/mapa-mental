# Slice 1 — MVP: one map, focus navigation, create / edit / delete ideas

**Status:** delivered. This document describes the state of the product today.

**Built across runs** `7c6b3566` (umbrella spec), `9a7eb41c` (backend), `c81c084b` (frontend),
`8610acd0` (discoverable actions), `b94349ca` (delete modes), plus `4008c894` and `b95e394c`
(housekeeping and the Spanish → English translation). Those per-run specs stay in
`.agents/memory/specs/` as history; this document replaces their five separate, conflicting
criteria lists with a single numbered one.

Criteria ids follow the convention in [README.md](README.md): `S1_BE_AC<n>` for the backend suite
and `S1_FE_AC<n>` for the frontend suite.

---

## 1. Context

A person with a Google account wants to build a mind map of their ideas and move through it
without getting lost. This slice delivers the base: login, a single map per user, `idea` nodes with
a title, a visible window of N levels and persistence. Everything runs locally with
`docker compose`. The data model and the API are already prepared for other node kinds and for
integrations (ADR 0013), but this slice only ships `idea`.

## 2. Scope

### Included

- **Local environment** with `docker compose up`: `db` (PostgreSQL 16 with a named volume), `api`
  (FastAPI, Python 3.12) and `web` (Vite, which proxies `/api`, same origin `localhost:5173`).
  Ports are published only on `127.0.0.1` and the repo ships `.env.example` (ADR 0005).
- **Google login** with the BFF pattern: Authorization Code with Authlib, `state` and `nonce`,
  `HttpOnly` + `SameSite=Lax` session cookie, `Secure` configurable by environment variable, and
  only the scopes `openid email profile` (ADR 0006, 0007). Includes logout and `GET /me`.
- **CSRF protection**: every mutation requires the `X-CSRF: 1` header.
- **First login** creates the `user`, their `map` (unique `owner_id`) and the root node titled with
  the user's name (ADR 0008).
- **Nodes API**: `GET /nodes/{id}/view?depth=N`, `POST /nodes/{id}/children`, `PATCH /nodes/{id}`
  (with `version`), `DELETE /nodes/{id}?children=cascade|reparent`.
- **Preferences**: `PATCH /me/settings` with `depth` between 1 and 10, default 3 (ADR 0010).
- **SPA** with React Flow, horizontal tree layout, zoom and pan (ADR 0002, 0003); routes `/` and
  `/n/:nodeId`; breadcrumb; "+k" indicator on border nodes (ADR 0011); `SettingsPanel`.
- **Navigation** by double click, Enter, Backspace, the breadcrumb and browser history (ADR 0009).
- **Editing**: Tab creates a child, Enter while editing creates a sibling, F2 or the pencil rename,
  Space collapses or expands, arrows move the selection.
- **Deleting** from the SPA: the 🗑 button or Delete; a leaf goes without asking, a node with
  children opens a dialog offering cascade, reparent or cancel.
- **Discoverability**: the "+" button on each node, the "?" shortcuts panel, the first-use hint,
  and focus returning to the map after an edit so the shortcuts keep working.
- **Client state**: optimistic updates with rollback and a window cache by `(nodeId, N)`.
- **Security**: every query filters by `maps.owner_id` (no IDOR), there is a CSP, and titles are
  always rendered as text.
- **Tests**: pytest with httpx on the backend, Vitest with Testing Library on the frontend, both
  with an 80% line-coverage floor.

### Explicitly out (later slices)

- Moving or reordering nodes by dragging. `sort_key` exists in the model and the API accepts it,
  but there is no UI to change it — **slice 2**.
- Drive access, Google Picker, `oauth_grants`, `external_refs` and `TOKEN_ENCRYPTION_KEY` —
  **slice 2**. Login grants no Drive access; this is the accepted deviation from the original
  request recorded in ADR 0007.
- Node kinds other than `idea`, and Calendar / Trello / GitHub integrations.
- Several maps per user, shared maps and links between branches (`edges`).
- Deployment beyond local, PWA and mobile app.
- Sharing the map with an AI assistant, filtered views, multi-language and a mobile layout.

---

## 3. Acceptance criteria — backend (`S1_BE_*`)

Verified by `uv run --directory api pytest -q --cov=app --cov-report=term-missing --cov-fail-under=80`
against an ephemeral PostgreSQL, with Google simulated by a fake OIDC provider.

### Environment

**S1_BE_AC1 — Compose and environment file.**
Given the repository with a `.env` copied from `.env.example`, when `docker compose config` runs,
then only the services `db` (image `postgres:16`, named volume), `api` and `web` appear, every
published port is bound to `127.0.0.1`, `.env.example` holds the scope's variables without real
values, and `git ls-files` does not include `.env`.
→ `test_S1_BE_AC1_*` in `api/tests/test_environment.py` (4 tests)

**S1_BE_AC2 — Migrations.**
Given an empty PostgreSQL 16, when `alembic upgrade head` runs, then `users`, `sessions`, `maps`
and `nodes` exist, with the `unique` constraint on `maps.owner_id` and the indexes `(map_id)` and
`(parent_id, sort_key)` on `nodes`. A second map for the same owner is rejected.
→ `test_S1_BE_AC2_*` in `api/tests/test_environment.py` (2 tests)

### Authentication

**S1_BE_AC3 — Start of login.**
Given a request to the login endpoint, when the backend answers, then it redirects to Google with a
`scope` parameter of exactly `openid email profile`, plus `state` and `nonce`, and both differ on
every request.
→ `test_S1_BE_AC3_*` in `api/tests/test_auth.py` (2 tests)

**S1_BE_AC4 — First login and signing in again.**
Given a valid callback from a Google user who never signed in, when it is processed, then a `user`,
a `map` and a root node `kind='idea'` titled with the user's name are created, and `GET /me`
returns `root_node_id` and `settings.depth = 3`. The same `google_sub` signing in again keeps a
single `user` and a single `map`. A name that is empty, padded with spaces or too long is
normalized.
→ `test_S1_BE_AC4_*` in `api/tests/test_auth.py` (3 tests)

**S1_BE_AC5 — Cookie and tokens.**
Given a successful login, when `Set-Cookie` is inspected, then the cookie is `HttpOnly` and
`SameSite=Lax`, and carries `Secure` only when the environment variable enables it. No response
includes Google tokens (`access_token`, `id_token`, `refresh_token`) and no table stores them.
→ `test_S1_BE_AC5_*` in `api/tests/test_auth.py` (3 tests)

**S1_BE_AC6 — Rejected callbacks.**
Given a callback with a missing or mismatched `state`, a mismatched `nonce` or no flow cookie, when
it is processed, then it is rejected with a 4xx, no session cookie is set and no rows are created
in `sessions` or `users`.
→ `test_S1_BE_AC6_*` in `api/tests/test_auth.py` (4 tests)

**S1_BE_AC7 — No session.**
Given a request with no cookie, a made-up cookie or a session whose `expires_at` has passed, when
it calls `GET /me`, `PATCH /me/settings` or any node endpoint, then it answers `401`.
→ `test_S1_BE_AC7_*` in `api/tests/test_auth.py` (2 tests)

**S1_BE_AC8 — CSRF.**
Given a user with a session, when they `POST`, `PATCH` or `DELETE` a node, or `PATCH /me/settings`,
without the `X-CSRF: 1` header (missing, empty or with the wrong value), then it answers `403` and
the database does not change.
→ `test_S1_BE_AC8_*` in `api/tests/test_auth.py` (3 tests) and `api/tests/test_nodes.py` (1 test)

**S1_BE_AC9 — Logout.**
Given a user with a session, when they log out, then their row in `sessions` is invalidated, the
cookie is cleared in the response and reusing that cookie gives `401`. Logging out without an
active session answers `204`; logging out still requires the CSRF header.
→ `test_S1_BE_AC9_*` in `api/tests/test_auth.py` (4 tests)

### Preferences

**S1_BE_AC10 — User depth.**
Given a user with a session, when they `PATCH /me/settings` with `{depth: 5}`, then `GET /me`
returns `settings.depth = 5`, also from a new session. The boundary values 1 and 10 are valid;
`depth` equal to 0, 11, a non-integer, or a body with unknown fields answers `422` and the stored
value does not change.
→ `test_S1_BE_AC10_*` in `api/tests/test_settings.py` (4 tests)

### Nodes

**S1_BE_AC11 — Visible window.**
Given a 5-level tree under a focus F that is not the root, when `GET /nodes/F/view?depth=2` is
requested, then the response carries `focus` = F, the `ancestors` in order from the root to F's
parent, and in `nodes` only levels 1 and 2 under F, with siblings strictly ordered by `sort_key`.
Every node carries its real `child_count`. A node with `collapsed = true` does not bring its
children but keeps its `child_count`. The root has no ancestors; a leaf focus returns empty `nodes`
and all its ancestors.
→ `test_S1_BE_AC11_*` in `api/tests/test_nodes.py` (7 tests)

**S1_BE_AC12 — Default depth and limits.**
Without `depth`, the window uses the user's `settings.depth`. The boundary values 1 and 10 are
valid; `depth=0` or `depth=11` answers `422`.
→ `test_S1_BE_AC12_*` in `api/tests/test_nodes.py` (3 tests)

**S1_BE_AC13 — Isolation (IDOR).**
Given users A and B and a node X in B's map, when A calls `view`, `POST children`, `PATCH` or
`DELETE` on X, then it answers `404` and B's map does not change. A missing id also gives `404`,
and a malformed (non-UUID) id gives `422`.
→ `test_S1_BE_AC13_*` in `api/tests/test_nodes.py` (4 tests)

**S1_BE_AC14 — Create.**
Given a node P with children H1 and H2, when `POST /nodes/P/children` is called with
`{title: "N", after_sort_key: H1.sort_key}`, then the next `view` of P returns the order H1, N, H2.
Without `after_sort_key` the node goes last. The new node comes back with `kind='idea'`,
`props={}`, `collapsed=false` and an initial `version`. An empty or whitespace-only title, a title
over 200 characters, or an invalid `after_sort_key` answers `422`; a title is stored trimmed and
200 characters are allowed.
→ `test_S1_BE_AC14_*` in `api/tests/test_nodes.py` (6 tests)

**S1_BE_AC15 — Edit with version.**
Given a node with `version = v`, when a `PATCH` arrives with `{title, version: v}`, then it is
applied and the response carries `version = v+1`. A stale (`v-1`) or future version answers `409`
and nothing changes. A `PATCH` with no `version`, an invalid `version`, an empty or too long title,
or unknown fields answers `422`. `PATCH` of `sort_key` reorders and validates the key format.
→ `test_S1_BE_AC15_*` in `api/tests/test_nodes.py` (8 tests)

**S1_BE_AC16 — Delete in cascade.**
Given a node with 7 descendants, when `DELETE /nodes/{id}` is called with no `children` parameter
or with `children=cascade`, then the node and all its descendants disappear, the answer is `204`
and the parent's `child_count` drops by 1. `DELETE` on the map root answers `422` and deletes
nothing; deleting the same node twice answers `404`.
→ `test_S1_BE_AC16_*` in `api/tests/test_nodes.py` (4 tests) and `api/tests/test_delete_modes.py` (1 test)

**S1_BE_AC17 — Node kinds.**
Given a `POST` or `PATCH` sending a `kind` other than `idea`, a `props` that does not meet the
`idea` schema, or `props` with unknown keys, when it is processed, then it answers `422` and
nothing changes. A valid `kind` with valid `props` is accepted.
→ `test_S1_BE_AC17_*` in `api/tests/test_nodes.py` (5 tests)

**S1_BE_AC18 — Delete with reparent: position and order.**
Given a parent P with children `[A, N, B]` and N with children `[c1, c2, c3]`, when
`DELETE /nodes/{N}?children=reparent` is called, then the answer is `204`, P's children ordered by
`sort_key` are `[A, c1, c2, c3, B]`, every `sort_key` is unique and matches `SORT_KEY_PATTERN`, and
c1's own subtree is untouched. The same holds when N is the first or the last child. Moved children
get their `version` bumped, and reparenting a leaf just deletes it.
→ `test_S1_BE_AC18_*` in `api/tests/test_delete_modes.py` (5 tests)

**S1_BE_AC19 — Delete with reparent: atomicity.**
Given a failure forced during the reparent, when the delete runs, then no change is left applied: N
and its children stay as they were.
→ `test_S1_BE_AC19_*` in `api/tests/test_delete_modes.py` (1 test)

**S1_BE_AC20 — Delete with reparent: security and validation.**

| Case | Response | Effect |
|---|---|---|
| No `X-CSRF` header | `403` | Nothing is deleted |
| Node of another user | `404` | Nothing is deleted |
| Root of the map | `422` | Nothing is deleted |
| `children=foo` | `422` | Nothing is deleted |

→ `test_S1_BE_AC20_*` in `api/tests/test_delete_modes.py` (4 tests)

### Quality

**S1_BE_AC21 — The tests never touch the development database.**
Given the test suite, when it runs, then it uses an ephemeral PostgreSQL (`TEST_DATABASE_URL`,
testcontainers or the embedded `pgserver`) and never the development `DATABASE_URL`.
→ `test_S1_BE_AC21_*` in `api/tests/test_environment.py` (1 test)

**S1_BE_AC22 — Live files are in English.**
Given the live files (`api/`, `web/src/`, the config files at the root), when they are scanned,
then they carry no Spanish accented characters other than proper names and none of the listed
Spanish words, and `web/src/api/schema.ts` carries the English OpenAPI descriptions.
→ `test_S1_BE_AC22_*` in `api/tests/test_translation.py` (3 tests)

**S1_BE_AC23 — Migrations and history are immutable.**
The revision ids of `0001_initial.py` are unchanged and every later migration extends a single
linear chain that starts at `0001`. *Amended in slice 3: this used to require a single migration
file, which forbade the `description` column of slice 3.* The
history directories `.agents/memory/specs` and `.agents/memory/adr` show no modifications against
`main`.
→ `test_S1_BE_AC23_*` in `api/tests/test_translation.py` (2 tests)

---

## 4. Acceptance criteria — frontend (`S1_FE_*`)

Verified by `pnpm --dir web exec vitest run --coverage` with Testing Library on jsdom, against the
in-memory API in `web/src/test/fakeApi.ts`.

### Environment and API client

**S1_FE_AC1 — SPA environment.**
`docker-compose.yml` publishes `web` only on `127.0.0.1:5173` and points the proxy at `api:8000`;
Vite listens on `0.0.0.0:5173` and forwards `/api` without rewriting; `pnpm-lock.yaml` is versioned
and `node_modules` is not.
→ `S1_FE_AC1:` in `web/src/config.test.ts` (3 tests)

**S1_FE_AC2 — API client.**
Every mutation (create, edit, delete, settings or logout) goes to a relative path starting with
`/api/` and carries the `X-CSRF: 1` header. `GET` requests do not send it.
→ `S1_FE_AC2:` in `web/src/api/client.test.ts` (2 tests, one parametrized over every mutation)

### Session

**S1_FE_AC3 — Login.**
Given `GET /api/me` answering `401`, when the SPA loads on `/` or `/n/X`, then the login screen is
shown and its button leads to `/api/auth/login`. A later `401` (expired session) goes back to that
screen.
→ `S1_FE_AC3:` in `web/src/session.test.tsx` (2 tests, one parametrized over `/` and `/n/x`)

**S1_FE_AC4 — Sign out.**
Given a user with a session, when they press "Sign out", then `POST /api/auth/logout` is called
with `X-CSRF: 1`, the window cache is cleared and the login screen is shown.
→ `S1_FE_AC4:` in `web/src/session.test.tsx` (1 test)

**S1_FE_AC5 — Preference N.**
Given the `SettingsPanel` with N = 3, when the user picks 5, then `PATCH /api/me/settings` is
called with `{depth: 5}` and the current focus's `view?depth=5` is requested. If the `PATCH` fails,
the selector goes back to the previous value and a notice is shown.
→ `S1_FE_AC5:` in `web/src/session.test.tsx` (2 tests)

### Navigation

**S1_FE_AC6 — Focus in the URL.**
Given the route `/n/X`, `GET /api/nodes/X/view?depth=<settings.depth>` is requested and X is drawn
as the focus. `/` uses `root_node_id` from `/api/me`. A `404` (someone else's or a missing node) or
a `422` (an id that is not a UUID) shows "Not found" with a link to `/`. Going back in history
shows the previous focus again, served from the cache without a second `GET`.
→ `S1_FE_AC6:` in `web/src/navigation.test.tsx` (5 tests)

**S1_FE_AC7 — Horizontal tree layout.**
Given a window with focus F, children A and B (in that `sort_key`) and grandchildren of A, when the
layout is computed, then `x` grows with the level, all nodes of a level share `x`, A sits above B,
the subtrees do not overlap and there is one edge per parent-child pair.
→ `S1_FE_AC7:` in `web/src/map/layout.test.ts` (4 tests)

**S1_FE_AC8 — Double click.**
Double-clicking a node that is not the focus navigates to `/n/<id>`. Double-clicking the focus goes
to its parent — the last of `ancestors`, or `/` if the parent is the root. Double-clicking the real
root does not change the URL.
→ `S1_FE_AC8:` in `web/src/navigation.test.tsx` (3 tests)

**S1_FE_AC9 — Breadcrumb and navigation keys.**
Given a focus 3 levels below the root, the breadcrumb shows the ancestors and the focus in order,
and clicking an ancestor focuses it. Outside editing, Enter focuses the selected node and Backspace
does the same as double-clicking the focus.
→ `S1_FE_AC9:` in `web/src/navigation.test.tsx` (2 tests)

**S1_FE_AC10 — Border "+k".**
Given N = 2 and a level-2 node with `child_count = 4`, when it is drawn, then it shows "+4", there
are no level-3 nodes and neither Space nor a click expands it in place. A border node with
`child_count = 0` shows no indicator.
→ `S1_FE_AC10:` in `web/src/navigation.test.tsx` (2 tests)

### Editing

**S1_FE_AC11 — Create.**
Given a selected node, when Tab is pressed, then a child appears instantly in edit mode; confirming
the title calls `POST /api/nodes/{id}/children` with `{title}`. Enter while editing confirms and
creates a sibling with `after_sort_key` equal to the edited node's `sort_key` (*since slice 3, only
while creating inline*). An empty or
whitespace-only title is not sent, leading and trailing spaces are trimmed, and Escape cancels the
new node without calling the API.
→ `S1_FE_AC11:` in `web/src/editing.test.tsx` (5 tests)

**S1_FE_AC12 — Rename.**
Given a node with `version = v`, when F2 puts the focus on the details panel's title and a new
title is confirmed, then `PATCH /api/nodes/{id}` is called with `{title, version: v}` and the node
takes the version the server returns. *Amended by slice 3: renaming moved from the inline editor and
the pencil to the details panel; the `PATCH` contract is unchanged.* While editing, Backspace, Delete, Space and the arrows act on the text
and not on the map.
→ `S1_FE_AC12:` in `web/src/editing.test.tsx` (3 tests)

**S1_FE_AC13 — Collapse.**
Given a selected node with children inside the window, when Space is pressed, then its children
stop being drawn and `PATCH` is called with `{collapsed: true, version}`. Pressing Space again
calls with `collapsed: false`. A window that arrives with `collapsed: true` does not draw that
node's children, and expanding fetches them.
→ `S1_FE_AC13:` in `web/src/editing.test.tsx` (2 tests)

**S1_FE_AC14 — Delete with the keyboard.**
Given a node with 7 descendants, visible or counted, when Delete is pressed, then a dialog appears
mentioning "7" — "at least N" when there are unloaded levels — and only confirming calls
`DELETE /api/nodes/{id}`. A node with no descendants is deleted without confirmation. Delete on the
root does nothing.
→ `S1_FE_AC14:` in `web/src/editing.test.tsx` (4 tests)

**S1_FE_AC15 — Selection with the arrows.**
Given a drawn window, → goes to the first visible child, ← to the parent, and ↑ and ↓ to the
previous and next sibling. Outside the visible nodes the selection does not change, and → on a
collapsed or border node does not change it either.
→ `S1_FE_AC15:` in `web/src/editing.test.tsx` (2 tests)

**S1_FE_AC16 — Optimistic with rollback.**
Given a creation, a rename, a collapse or a delete, when the API answers `409`, `422` or `5xx`,
then the interface goes back to the previous state, a notice is shown and the next read of that
window is requested from the server again.
→ `S1_FE_AC16:` in `web/src/editing.test.tsx` (4 tests)

### Discoverable actions

**S1_FE_AC17 — The "+" button creates a child.**
Given a map with the root focused, when the button named "Add idea inside &lt;root title&gt;" is
clicked, then a new child appears with the title editor open, the same as pressing Tab; confirming
with Enter calls `POST /nodes/{id}/children` with the typed title. An empty or whitespace-only
title is not sent, spaces are trimmed and Escape cancels without calling the API.
→ `S1_FE_AC17:` in `web/src/actions.test.tsx` (5 tests)

**S1_FE_AC18 — The "+" is present where it should be.**
The focus node and the selected node show the "+". Every non-`pending` node that is not being
edited has it in the DOM, including collapsed and border nodes, where it is enabled. Nodes that are
`pending` or in edit mode do not have it.
→ `S1_FE_AC18:` in `web/src/actions.test.tsx` (4 tests)

**S1_FE_AC19 — The "+" does not trigger other node actions.**
Double-clicking the "+" of a node that is not the focus does not change the route; double-clicking
the "+" of the focus does not go up a level; a single click on a child's "+" does not navigate to
or focus that node.
→ `S1_FE_AC19:` in `web/src/actions.test.tsx` (3 tests)

**S1_FE_AC20 — Shortcuts keep working after the pencil.** *Superseded by slice 3 (`S3_FE_AC14`):
there is no pencil any more, and its tests were removed.*
After confirming a pencil edit with Enter or by blurring, or cancelling it with Escape,
`document.activeElement` is the map container, so Tab opens a new child in edit mode, F2 renames
and Space collapses.
→ `S1_FE_AC20:` in `web/src/actions.test.tsx` (5 tests)

**S1_FE_AC21 — Shortcuts keep working after the "+".**
Given a child created with the "+" button and confirmed, F2 puts the focus on the details panel's
title (*amended by slice 3*) and
Tab on the new child creates a grandchild in edit mode. If the creation is cancelled with Escape,
focus returns to the map and the shortcuts keep working.
→ `S1_FE_AC21:` in `web/src/actions.test.tsx` (3 tests)

**S1_FE_AC22 — Opening and closing the help.**
Clicking the "Keyboard shortcuts" button opens a `role="dialog"` listing the map's shortcuts with
their descriptions, and the button becomes `aria-expanded="true"`. Escape or a second click closes
the panel, returns focus to the "?" button and sets `aria-expanded="false"`.
*Amended by slice 2 (`S2_FE_AC17`): this used to require exactly the 8 shortcuts of slice 1, and
now requires those 8 to be present, since slice 2 adds the `Alt` and `Drag` entries. Slice 3
(`S3_FE_AC20`) rewords F2 and Enter and adds Escape.*
→ `S1_FE_AC22:` in `web/src/actions.test.tsx` (2 tests)

**S1_FE_AC23 — The help does not trigger map shortcuts.**
With the panel open, Delete and Space neither delete nor collapse, Tab, F2, Backspace and Enter
neither create children, edit nor navigate, and the arrows do not change the selection.
→ `S1_FE_AC23:` in `web/src/actions.test.tsx` (3 tests)

**S1_FE_AC24 — It can be used with the keyboard only.**
Reaching "?" or a "+" with the browser's focus and pressing Enter or Space runs the same action as
the click. With focus on a button, Tab does not create a child: it moves to the next interactive
control.
→ `S1_FE_AC24:` in `web/src/actions.test.tsx` (3 tests)

**S1_FE_AC25 — First-use hint.**
With the focus on the real root and no children, the text "Tap + or Tab to add an idea" is shown.
It disappears when the first child is created and confirmed with Tab or with the "+", stays visible
if the creation is cancelled with Escape, and shows again if the root's only child is deleted. It
does not show if the root already has children or if the focus is not the real root.
→ `S1_FE_AC25:` in `web/src/actions.test.tsx` (6 tests)

**S1_FE_AC26 — Creating beyond the border or inside a collapsed node.**
The "+" or Tab on a border node moves the focus one level toward it and creates the child there in
edit mode. The "+" on a collapsed node expands it first and then creates the child. If expanding
fails, no pending creation is left to fire later.
→ `S1_FE_AC26:` in `web/src/actions.test.tsx` (4 tests) and `web/src/editing.test.tsx` (1 test)

**S1_FE_AC27 — Chained sibling creation keeps the editor focused.**
Enter, Enter, Enter leaves the third sibling in edit mode and focused; the title editor focuses its
field even if the first attempts fail because the new node is still hidden.
→ `S1_FE_AC27:` in `web/src/actions.test.tsx` (1 test) and `web/src/map/nodes/TitleEditor.test.tsx` (1 test)

### Deleting from the SPA

**S1_FE_AC28 — Visible delete button.**
Every non-root node shows a button with a delete `aria-label`; the real root does not. Activating
the button is the same as selecting the node and pressing Delete.
→ `S1_FE_AC28:` in `web/src/deleteModes.test.tsx` (2 tests)

**S1_FE_AC29 — Leaf.**
Given a node with `child_count === 0`, when it is deleted with the button or with Delete, then no
dialog opens, `window.confirm` is not called, `deleteNode(id)` is called in cascade mode and the
node disappears.
→ `S1_FE_AC29:` in `web/src/deleteModes.test.tsx` (2 tests)

**S1_FE_AC30 — Inner node: dialog.**
Given a node with `child_count > 0`, with its children visible or not, when it is deleted, then a
`role="dialog"` opens with the three options, the text includes the number of descendants ("at
least N" when there are unloaded levels), `window.confirm` is not called and focus stays inside the
dialog, on "Cancel".
→ `S1_FE_AC30:` in `web/src/deleteModes.test.tsx` (2 tests)

**S1_FE_AC31 — Delete everything from here.**
Given the dialog open, when "Delete everything from here" is chosen, then `deleteNode(id)` is
called in cascade mode, the node and its descendants disappear and the dialog closes.
→ `S1_FE_AC31:` in `web/src/deleteModes.test.tsx` (1 test)

**S1_FE_AC32 — Move the children up.**
Given the dialog open for N, a child of P with children `[c1, c2]`, when "Delete only this one and
move its children up" is chosen, then `deleteNode(N, { children: 'reparent' })` is called, the
window is requested again and c1 and c2 appear as children of P, in N's place and in that order.
→ `S1_FE_AC32:` in `web/src/deleteModes.test.tsx` (1 test)

**S1_FE_AC33 — Cancel.**
Given the dialog open, when "Cancel" is chosen or Esc is pressed, then `deleteNode` is not called,
the map stays as it was and focus returns to the map container.
→ `S1_FE_AC33:` in `web/src/deleteModes.test.tsx` (2 tests)

**S1_FE_AC34 — Deleting the focus.**
Given that the focused node (`/n/:id`) is an inner node, when it is deleted with either mode, then
the SPA navigates to `/n/{parentId}`.
→ `S1_FE_AC34:` in `web/src/deleteModes.test.tsx` (1 test)

### Security and quality

**S1_FE_AC35 — XSS and CSP.**
Given a title `<img src=x onerror=alert(1)>`, when it is drawn on the canvas and in the breadcrumb,
then it is shown as literal text and the DOM contains no element generated by it; `<script>` and
`<svg>` payloads inject nothing either. The Vite config sets a `Content-Security-Policy` header,
with `default-src 'self'`, `object-src 'none'` and no `unsafe-eval`.
→ `S1_FE_AC35:` in `web/src/session.test.tsx` (2 tests) and `web/src/config.test.ts` (1 test)

**S1_FE_AC36 — Coverage.**
Running `pnpm --dir web exec vitest run --coverage` fails if line coverage drops below the 80%
threshold configured in Vite, and every criterion of this slice has at least one test named after
it.
→ `S1_FE_AC36:` in `web/src/config.test.ts` (1 test) and `web/src/actions.test.tsx` (1 test)

---

## 5. Traceability

Every criterion above has at least one test whose name starts with its id, so the mapping can be
checked mechanically:

```sh
# Backend: list the criteria that have tests
uv run --directory api pytest --collect-only -q | grep -o 'test_S1_BE_AC[0-9]*' | sort -u

# Frontend: list the criteria that have tests
pnpm --dir web exec vitest run --reporter=verbose 2>&1 | grep -o 'S1_FE_AC[0-9]*' | sort -u
```

**23 backend criteria** and **36 frontend criteria**, with no gaps in either range.

Measured on 2026-11-16, right after the renaming:

| Suite | Test cases run | Carrying a criterion id | Supporting |
|---|---|---|---|
| Backend (`pytest`) | 122 (98.39% line coverage) | 108 | 14 |
| Frontend (`vitest`) | 118 (99.4% line coverage) | 108 | 10 |

The per-criterion counts quoted above are **test functions as they appear in the file**; the
numbers in this table are **test cases as they run**, which is higher because some tests are
parametrized (`@pytest.mark.parametrize`, `it.each`).

### Supporting tests (no criterion id)

These are unit tests and regression cases that back the criteria above without being the primary
evidence for one. They intentionally keep their descriptive names:

| File | Tests |
|---|---|
| `api/tests/test_sort_keys.py` | `key_between` bounds, midpoint, inverted bounds, repeated insertions |
| `api/tests/test_environment.py` | `Config` reads the environment variables |
| `api/tests/test_auth.py` | the root title normalizes spaces and has a default |
| `api/tests/test_settings.py` | invalid stored settings fall back to the default |
| `api/tests/test_delete_modes.py` | reparenting many children keeps the keys short |
| `web/src/api/client.test.ts` | 4 — `204`, query building, `401` handling, error detail |
| `web/src/session.test.tsx` | 3 — API down, unknown route, error fetching the window |
| `web/src/editing.test.tsx` | 3 — empty rename, Space on a childless node, deleting the focus |

## 6. Known gaps

These are open points carried over from the per-run specs. They are recorded here so the next slice
can decide on them; none of them blocks slice 1.

- **No account deletion.** The architecture mentions a `DELETE /me` that removes all of a user's
  data; it was never scoped into this slice.
- **Session lifetime** (expiry, whether it slides, how long expired sessions are kept) is not
  specified, only implemented.
- **No performance criterion for the window.** There is no latency target and no reference tree
  size for the recursive CTE at `depth = 10`.
- **Hover is not tested.** The "+" and 🗑 buttons appear on hover through CSS, which jsdom does not
  exercise; `S1_FE_AC18` only checks presence in the DOM.
- **`409` in the interface** reverts and refetches; it does not show the server's version or offer
  a retry.
- **Manual validation of criteria that need a browser** (`S1_BE_AC1` with a real
  `docker compose up`, real Google login) is done by hand, not in CI.

# Slice 2 — Move and reorder nodes by dragging

**Status:** specified, not built. The criteria below are the contract for the implementation; the
test names they quote do not exist yet.

Builds on [slice 1](slice-1-mvp.md). Criteria ids follow the convention in [README.md](README.md):
`S2_BE_AC<n>` for the backend suite and `S2_FE_AC<n>` for the frontend suite.

---

## 1. Context

Today a node's position is decided when it is created and can never be changed from the interface.
`sort_key` exists in the model and `PATCH /api/nodes/{id}` even accepts it, but nothing in the SPA
writes it, and there is no way at all to give a node a different parent: reorganizing a map means
deleting and retyping ideas.

This slice makes the tree malleable. A person can drag an idea to a new place, or move it with the
keyboard, and the whole subtree travels with it.

### What already exists

- `PATCH /api/nodes/{id}` accepts a **raw** `sort_key`, so reordering among siblings is technically
  possible today — but only by computing a fractional key on the client.
- `app/nodes/sort_keys.py` has `key_between`; `app/nodes/service.py` has `spread_keys` and
  `move_children_to_parent`, written for delete-with-reparent. Both are reused here.
- The canvas is **not** free-positioned: `map/layout.ts` computes every coordinate and
  `MapCanvas.tsx` sets `nodesDraggable={false}`. A drag can therefore never persist a position; it
  has to resolve to "which parent, after which sibling".

### What is missing

- No way to change `parent_id`. This is the whole backend gap.
- No drag on the canvas, no drop targets, no keyboard move.

## 2. Scope

### Included

- **A move endpoint**, `POST /api/nodes/{id}/move`, which changes a node's parent, its position
  among its siblings, or both, in one request, with the server computing the `sort_key`.
- **Dragging on the canvas** to move a node, with two drop outcomes:
  - dropping **on a node** makes the dragged node its **last child**;
  - dropping **in the gap between two siblings** inserts it at that position, and is offered
    **only among the dragged node's current siblings** (see decision D2).
- **The breadcrumb as a drop target**, so a node can be moved to any ancestor in one gesture.
- **Keyboard moves**: `Alt+↑` / `Alt+↓` reorder among siblings, `Alt+→` indents, `Alt+←` outdents.
- **The shortcuts panel** updated with the four new shortcuts.
- The moved node **keeps its whole subtree**, with every descendant's position intact.

### Explicitly out

- **The Drive document node, the Google Picker and incremental `drive.file`** — moved to slice 3.
  The architecture document used to group them with this slice; that grouping is dropped.
- Touch and pen dragging. Mouse and keyboard only; a mobile-friendly view is a later roadmap item.
- Dragging more than one node at a time.
- Undo. A failed move rolls back and shows a notice, as in slice 1, but a successful move cannot be
  undone with a shortcut.
- Auto-panning the canvas when the pointer reaches its edge during a drag: the target has to be
  visible to be a target.
- Dragging between two different windows or browser tabs.
- Changing a node's `kind` or any other field as part of a move.

## 3. Decisions

**D1 — The move is its own endpoint, not a `PATCH` field.**
`POST /api/nodes/{id}/move` rather than extending `NodePatch` with `parent_id`. A move is an
operation, not a field edit: the server computes the fractional key (so `key_between` is never
reimplemented in TypeScript), and the cycle and ownership checks live in one place. The existing
raw `sort_key` on `PATCH` stays — slice 1's `S1_BE_AC15` covers it — but the SPA stops being its
only possible caller and never uses it for moves.

**D2 — Cross-parent drops always append as the last child.**
Gap-insertion between siblings is only offered when the node **already belongs to that parent**. So
moving an idea somewhere else and placing it precisely are two separate gestures: drop it on its
new parent, then reorder it there. This keeps drop resolution to two outcomes and the insertion
indicator to one sibling list.

**D3 — The same rule binds the keyboard.**
`Alt+←` (outdent) makes the node the **last child of its grandparent**, not "right after its former
parent" as most outliners do. Uniform with D2, at the cost of departing from outliner muscle
memory. `Alt+→` (indent) likewise makes it the **last child of its previous sibling**.

**D4 — The API still accepts an explicit position for a cross-parent move.**
`place: {"after_id": …}` is valid even when `parent_id` differs from the current parent. D2 is a
rule of this interface, not of the data model, and baking it into the endpoint would be an
artificial limit that a future interface would have to undo. The SPA simply never sends that
combination.

**D5 — Position is a tagged union, not a nullable id.**
The body carries `place: "first" | "last" | {"after_id": <uuid>}`. A nullable `after_id` cannot
express "first" and "last" at the same time, and `POST /children`'s convention (absent
`after_sort_key` means last) cannot express "first" either. "Last" must be expressible without
naming a sibling, because the client often has not loaded the destination's children — that is
exactly the collapsed and border case.

**D6 — Real pointer dragging is validated by hand.**
jsdom does not lay out or measure React Flow nodes, which is why slice 1's tests already look nodes
up by label instead of by role. Rather than assert on a drag that the test environment cannot
really perform, the geometry is extracted into a **pure function** that is tested directly, and the
pointer gesture itself is a manual-validation criterion (`S2_FE_AC19`). Covering it automatically
would mean adding Playwright, which is a separate decision.

## 4. The move endpoint

```http
POST /api/nodes/{id}/move
X-CSRF: 1

{
  "parent_id": "<uuid>",
  "place": "last",              // or "first", or {"after_id": "<uuid>"}
  "version": 7
}
```

`parent_id` is always required, even when it does not change: the caller states the destination it
believes in, and nothing is inferred from hidden state. The response is the moved node as
`NodeOut`, with its new `parent_id`, its new `sort_key` and `version` incremented.

## 5. Acceptance criteria — backend (`S2_BE_*`)

**S2_BE_AC1 — Move contract.**
Given a node N with `version = v`, when `POST /api/nodes/{N}/move` is called with a valid
`parent_id`, `place` and `version: v`, then the answer is `200` with N's `NodeOut`, carrying the new
`parent_id`, a `sort_key` that matches `SORT_KEY_PATTERN` and `version = v+1`. N's own
`child_count` does not change.
→ `test_S2_BE_AC1_*` in `api/tests/test_move.py`

**S2_BE_AC2 — Reorder among siblings.**
Given a parent P with children `[A, B, N]`, when N is moved within P with `place: {"after_id": A}`,
then the next `view` of P returns `[A, N, B]`. With `place: "first"` it returns `[N, A, B]`; with
`place: "last"` it returns `[A, B, N]`. The other siblings keep their own `sort_key` and `version`.
→ `test_S2_BE_AC2_*` in `api/tests/test_move.py`

**S2_BE_AC3 — Append to a parent whose children the caller never loaded.**
Given a destination parent D with children the caller has not fetched, when N is moved with
`place: "last"`, then N becomes D's last child, after every existing one, without the caller naming
any sibling.
→ `test_S2_BE_AC3_*` in `api/tests/test_move.py`

**S2_BE_AC4 — The subtree travels with the node.**
Given N with a subtree of its own and parents P (old) and D (new), when N is moved to D, then every
descendant of N keeps its parent, order and `version`, P's `child_count` drops by one, D's rises by
one, and N is reachable from D in a `view` deep enough to contain it.
→ `test_S2_BE_AC4_*` in `api/tests/test_move.py`

**S2_BE_AC5 — No cycles.**
Given N with a descendant X, when N is moved with `parent_id` equal to N itself or to X, then the
answer is `422` and nothing changes. Moving N to its own current parent is **not** a cycle and is
allowed.
→ `test_S2_BE_AC5_*` in `api/tests/test_move.py`

**S2_BE_AC6 — The root cannot be moved.**
Given the map's root, when it is moved, then the answer is `422` and nothing changes.
→ `test_S2_BE_AC6_*` in `api/tests/test_move.py`

**S2_BE_AC7 — Isolation.**
Given users A and B, when A moves a node of B's map, moves one of their own nodes to a `parent_id`
in B's map, or names an `after_id` in B's map, then the answer is `404` and neither map changes. A
missing id answers `404`.
→ `test_S2_BE_AC7_*` in `api/tests/test_move.py`

**S2_BE_AC8 — `after_id` must be a child of `parent_id`.**
Given an `after_id` that belongs to the caller but is not a child of the destination parent, when
the move is processed, then the answer is `422` and nothing changes. An `after_id` equal to the
moved node itself also answers `422`.
→ `test_S2_BE_AC8_*` in `api/tests/test_move.py`

**S2_BE_AC9 — Version.**
Given N with `version = v`, when a move arrives with `version = v-1` or `v+1`, then the answer is
`409` and nothing changes.
→ `test_S2_BE_AC9_*` in `api/tests/test_move.py`

**S2_BE_AC10 — Moving a node where it already is.**
Given N already last among P's children, when it is moved to P with `place: "last"`, then the answer
is `200`, the order of P's children is unchanged, and N's `version` is incremented like any other
move — the no-op is not special-cased.
→ `test_S2_BE_AC10_*` in `api/tests/test_move.py`

**S2_BE_AC11 — Validation and CSRF.**
A move without the `X-CSRF: 1` header answers `403`. A body with no `version`, no `parent_id`, an
unknown field, a malformed UUID, or a `place` that is neither `"first"`, `"last"` nor
`{"after_id": <uuid>}` answers `422`. In every case nothing changes.
→ `test_S2_BE_AC11_*` in `api/tests/test_move.py`

**S2_BE_AC12 — Keys stay short and well formed.**
Given a sibling list, when a node is repeatedly moved into the same gap — at least 50 times — then
every resulting `sort_key` is unique, matches `SORT_KEY_PATTERN`, stays under the 128-character cap
of the schema, and the siblings' order is the intended one at every step.
→ `test_S2_BE_AC12_*` in `api/tests/test_move.py`

**S2_BE_AC13 — Atomicity.**
Given a failure forced during the move, when it runs, then nothing is left applied: the node keeps
its old parent and `sort_key`.
→ `test_S2_BE_AC13_*` in `api/tests/test_move.py`

## 6. Acceptance criteria — frontend (`S2_FE_*`)

**S2_FE_AC1 — What can be dragged.**
Every node drawn in the window is draggable except the real root of the map and the current focus
— the focus is the window's own root and its parent is not on the canvas. A node being edited or
still `pending` is not draggable either.
→ `S2_FE_AC1:` in `web/src/move.test.tsx`

**S2_FE_AC2 — Drop resolution is a pure function.**
Given the laid-out window, the dragged node and a pointer position, when the drop is resolved, then
the result is exactly one of: `{kind: 'child', parentId}` when the pointer is over a node's body,
`{kind: 'sibling', parentId, afterId}` when it is over a gap between two of the dragged node's
current siblings, or `null` when the drop is not allowed. The function is tested directly, with no
rendering.
→ `S2_FE_AC2:` in `web/src/map/dropTarget.test.ts`

**S2_FE_AC3 — Gaps belong to the current parent only.**
Given a node N being dragged, when the pointer is over a gap between two nodes that are not N's
current siblings, then no insertion position is offered and the resolution falls back to the
enclosing node's body, if any. Gaps among N's own siblings are offered, including the gap before the
first sibling and the one after the last.
→ `S2_FE_AC3:` in `web/src/map/dropTarget.test.ts`

**S2_FE_AC4 — Dropping on a node appends.**
Given N dropped on the body of another node D, when the drop is confirmed, then
`POST /api/nodes/{N}/move` is called with `{parent_id: D, place: 'last', version}` and N is drawn as
D's last child.
→ `S2_FE_AC4:` in `web/src/move.test.tsx`

**S2_FE_AC5 — Dropping in a gap reorders.**
Given N dropped in the gap after its sibling A, when the drop is confirmed, then the call carries
`{parent_id: <current parent>, place: {after_id: A}, version}` and N is drawn between A and the next
sibling.
→ `S2_FE_AC5:` in `web/src/move.test.tsx`

**S2_FE_AC6 — Collapsed and border targets.**
Given N dropped on a collapsed node or on a border ("+k") node, when the drop is confirmed, then it
is sent as `place: 'last'`, the target is **not** expanded, and its "+k" count rises by one once the
window is read again.
→ `S2_FE_AC6:` in `web/src/move.test.tsx`

**S2_FE_AC7 — The breadcrumb is a drop target.**
Given N dropped on a breadcrumb entry, when the drop is confirmed, then the call carries that
ancestor as `parent_id` with `place: 'last'`. If that ancestor is outside the visible window, N
disappears from the canvas, as in `S2_FE_AC13`.
→ `S2_FE_AC7:` in `web/src/move.test.tsx`

**S2_FE_AC8 — Impossible drops are refused.**
Given N dragged over itself, over any of its own descendants, or over a position that would not
change anything, when the pointer is there, then the target is marked as refused, and releasing it
calls no API and leaves the map untouched.
→ `S2_FE_AC8:` in `web/src/move.test.tsx`

**S2_FE_AC9 — Feedback during the drag.**
While a drag is in progress, the dragged node is styled as such, a valid node target is highlighted,
a valid gap shows an insertion line, and a refused target is visibly distinct. Nothing is written
until the drop.
→ `S2_FE_AC9:` in `web/src/move.test.tsx`

**S2_FE_AC10 — Escape cancels.**
Given a drag in progress, when Escape is pressed or the pointer is released outside any target, then
the drag ends, no API is called and the map is unchanged.
→ `S2_FE_AC10:` in `web/src/move.test.tsx`

**S2_FE_AC11 — A reorder inside the parent is optimistic.**
Given a move that keeps the parent, when it is confirmed, then the new order is drawn immediately
and the request is sent afterwards. If the API answers `409`, `422` or `5xx`, the previous order is
restored, a notice is shown and that window is read from the server again.
→ `S2_FE_AC11:` in `web/src/move.test.tsx`

**S2_FE_AC12 — A move to another parent re-reads the window.**
Given a move that changes the parent, when the API answers, then the window is requested again — the
`child_count` of both parents changed — and on failure the node goes back where it was with a
notice, exactly as in `S2_FE_AC11`.
→ `S2_FE_AC12:` in `web/src/move.test.tsx`

**S2_FE_AC13 — A node moved out of the window.**
Given N moved to an ancestor that the current window does not show, when the move succeeds, then N
is no longer drawn, the selection goes to its former parent and a notice says where it went.
→ `S2_FE_AC13:` in `web/src/move.test.tsx`

**S2_FE_AC14 — `Alt+↑` and `Alt+↓` reorder.**
Given a selected node with siblings, when `Alt+↑` or `Alt+↓` is pressed, then it swaps places with
the previous or next sibling and the move is sent with the corresponding `place`. On the first
sibling `Alt+↑` does nothing, and on the last `Alt+↓` does nothing: the selection never leaves its
parent this way.
→ `S2_FE_AC14:` in `web/src/move.test.tsx`

**S2_FE_AC15 — `Alt+→` indents.**
Given a selected node with a previous sibling, when `Alt+→` is pressed, then it becomes that
sibling's **last** child. With no previous sibling, nothing happens.
→ `S2_FE_AC15:` in `web/src/move.test.tsx`

**S2_FE_AC16 — `Alt+←` outdents.**
Given a selected node whose parent is not the focus and not the real root, when `Alt+←` is pressed,
then it becomes its grandparent's **last** child (decision D3). When the parent is the focus or the
real root, nothing happens.
→ `S2_FE_AC16:` in `web/src/move.test.tsx`

**S2_FE_AC17 — The shortcuts panel.**
The "?" panel lists the four new shortcuts with their descriptions, alongside the existing ones.
This **amends slice 1's `S1_FE_AC22`**, which asserts a list of exactly 8 shortcuts; that criterion
and its test are updated in this slice.
→ `S2_FE_AC17:` in `web/src/move.test.tsx`, plus the updated `S1_FE_AC22:` in
`web/src/actions.test.tsx`

**S2_FE_AC18 — Dragging does not trigger the other node actions.**
Given a drag that starts and ends on the same node, when it ends, then the route does not change,
the node is not focused and no move is sent: a drag is never read as a click or a double click.
→ `S2_FE_AC18:` in `web/src/move.test.tsx`

**S2_FE_AC19 — Manual validation of the real gesture.**
With the app running, dragging with the mouse moves a node onto another node, into a gap between its
siblings and onto a breadcrumb entry, with the feedback of `S2_FE_AC9` and the subtree intact.
→ Manual, by hand (decision D6). Not covered by an automated test.

**S2_FE_AC20 — Coverage.**
`pnpm --dir web exec vitest run --coverage` still meets the 80% line threshold.
→ `S2_FE_AC20:` in `web/src/config.test.ts`

## 7. Expected changes by file

| File | Change |
|---|---|
| `api/app/nodes/schemas.py` | `NodeMove` with `parent_id`, `place` (tagged union) and `version` |
| `api/app/nodes/service.py` | `move_node`: ownership, cycle, root and `after_id` checks; key via `key_between` |
| `api/app/nodes/repository.py` | is-a-descendant check and the destination's neighbouring keys |
| `api/app/nodes/router.py` | `POST /nodes/{id}/move` |
| `api/tests/test_move.py` | new, `S2_BE_AC1`–`AC13` |
| `web/src/api/client.ts`, `schema.ts` | `moveNode`, regenerated types |
| `web/src/map/dropTarget.ts` | new, the pure resolution of `S2_FE_AC2` |
| `web/src/map/MapCanvas.tsx` | `nodesDraggable`, drag handlers, drop feedback |
| `web/src/map/useMapView.ts` | `move`, optimistic for a reorder, re-read for a reparent |
| `web/src/map/MapPage.tsx` | the four `Alt` shortcuts |
| `web/src/components/Breadcrumb.tsx` | drop target |
| `web/src/components/ShortcutsHelp.tsx` | the new shortcuts |
| `web/src/actions.test.tsx` | `S1_FE_AC22` updated for the longer list |
| `docs/slices/slice-1-mvp.md` | `S1_FE_AC22` amended |

## 8. Known gaps

- **No automated coverage of the pointer gesture** (decision D6). `S2_FE_AC19` is manual until the
  project decides on Playwright.
- **Keys grow under adversarial reordering.** `S2_BE_AC12` fixes a floor of 50 moves into the same
  gap; a sufficiently long sequence still lengthens keys. There is no renormalization pass, and the
  128-character cap would eventually answer `422`.
- **No touch support**, so the feature is unusable on a tablet until the mobile-friendly view lands.
- **Outdent departs from outliner convention** (decision D3) and may need revisiting once the
  gesture is used in anger.
- **No undo.** The only recovery from an unintended move is another move.
- **Concurrency between two tabs** behaves as in slice 1: the second move gets a `409`, reverts and
  re-reads. It does not show what the other tab did.

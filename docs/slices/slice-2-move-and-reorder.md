# Slice 2 — Move and reorder nodes by dragging

**Status:** delivered. Three criteria were amended while building, each marked *Amended* below with
what changed and why.

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

**D6 — Drop targets are elements, not coordinates.**
The drag uses the browser's own drag and drop: every node is a drop target, and while a drag is in
progress an insertion line is drawn as its own element in each offered gap. Nothing is resolved
from pointer coordinates, so **the drop rules are testable without geometry**: the tests fire
`dragStart`, `dragOver` and `drop` at named elements, exactly as a browser would.

*This replaces the original decision*, which put the geometry in a pure
`resolveDrop(pointer) → target` function and left the gesture to manual validation. The first
attempt was written that way and discarded: jsdom never measures React Flow nodes, so every
coordinate is zero and such a function can only be tested against invented positions, which proves
nothing about the real canvas. With elements as targets, `S2_FE_AC4` through `AC13` are genuinely
automated. `S2_FE_AC19` stays manual, but now covers only what no test environment can check: that
the pointer actually reaches those elements on a real canvas.

**What this decision got wrong, and the correction.** As first written, it treated "the drop rules
are automated" as if it also covered "a drag can start", and it does not: a test that dispatches
`dragstart` directly skips the `mousedown` that a browser sends first, and that `mousedown` was
being swallowed by React Flow's pan handler. The feature shipped unusable with every criterion
green. The lesson is narrow and worth keeping: **when a test replaces a gesture with a synthetic
event, name what the substitution drops, and cover that separately.** `S2_FE_AC21` is that cover
for the `mousedown`; `S2_FE_AC19` remains the manual check for everything after it.

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

**S2_BE_AC10 — Moving a node where it already is.** *(Amended: see the last sentence.)*
Given N already last among P's children, when it is moved to P with `place: "last"`, then the answer
is `200` and the order of P's children is unchanged. The computed position is the one N already
holds, so no row is written and N's `version` does not change: `version` counts changes to the row,
not requests. A move that does change the position bumps it as usual.
*Amended: this first demanded that the version be incremented "like any other move". It is not —
SQLAlchemy writes nothing when no column changed — and demanding it would have meant a pointless
UPDATE just to make a counter move.*
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
→ `S2_FE_AC1:` in `web/src/map/dropTarget.test.ts`

**S2_FE_AC2 — The drop rules are a pure module.**
Given a window and a dragged node, when a target is checked, then `isUsefulTarget` answers whether
it is reachable and would change anything, and `placeFor` turns it into the endpoint's `place`:
`'last'` for a node's body, `'first'` or `{after_id}` for a gap. Both are tested directly, with no
rendering.
*Amended (decision D6): this was "drop resolution is a pure function" taking a pointer position.
Targets are elements now, so there is no geometry to resolve.*
→ `S2_FE_AC2:` in `web/src/map/dropTarget.test.ts`

**S2_FE_AC3 — Gaps belong to the current parent only.**
Given a node N being dragged, when the insertion lines are drawn, then there is one for each gap
among N's **own** siblings that would actually move it — including the gap before the first sibling
— and none anywhere else in the tree. Dropping on any other node's body remains an append.
*Amended (decision D6): the gaps are elements offered during the drag, not regions a pointer is
tested against.*
→ `S2_FE_AC3:` in `web/src/map/dropTarget.test.ts` and `web/src/move.test.tsx`

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

**S2_FE_AC21 — The gesture can begin.** *(added after delivery; see below)*
Given a node, when the mouse is pressed on it and the browser then starts a drag, then the drag
starts: the insertion lines appear and a drop still moves the idea. Concretely, the node carries the
`nopan` class, which is where React Flow's pan filter looks
(`event.target.closest('.nopan')`).

This criterion exists because its absence shipped a broken feature. React Flow adds `nopan` only to
nodes **it** drags, and it drags none of ours — the layout owns the positions (ADR 0003). Without
the class, the pane's `d3-zoom` handles the `mousedown` that precedes every drag and calls
`d3-drag`'s `dragDisable`, which registers a capture-phase listener that `preventDefault`s every
`dragstart` on the window. Every other frontend criterion passed while no drag could start in a
browser, because the tests dispatch `dragstart` directly and never press the mouse first.
→ `S2_FE_AC21:` in `web/src/move.test.tsx`

## 7. Changes by file

| File | Change |
|---|---|
| `api/app/nodes/schemas.py` | `NodeMove` with `parent_id`, `place` (tagged union) and `version` |
| `api/app/nodes/service.py` | `move_node` and `destination_sort_key`: ownership, cycle, root and `after_id` checks; key via `key_between` |
| `api/app/nodes/repository.py` | `is_descendant`, `first_child_sort_key`, and `exclude_id` on the neighbour lookups so the moved node is not its own neighbour |
| `api/app/nodes/router.py` | `POST /nodes/{id}/move` |
| `api/tests/test_move.py` | new, `S2_BE_AC1`–`AC13` |
| `api/scripts/export_openapi.py` | puts the package on the path, so `pnpm gen:api` runs (it was broken) |
| `web/package.json` | `gen:api` passes `--default-non-nullable=false`, so defaulted request fields stay optional |
| `web/src/api/schema.ts` | regenerated; it had drifted into a hand-edited file |
| `web/src/api/client.ts` | `moveNode`, `NodeMove` and `Place` |
| `web/src/map/dropTarget.ts` | new: `isDraggable`, `isUsefulTarget`, `gapSlots`, `placeFor` |
| `web/src/map/tree.ts` | `reorderChild`, for the optimistic reorder |
| `web/src/map/MapCanvas.tsx` | drag flags per node and the gap drop zones |
| `web/src/map/nodes/GapDropZone.tsx` | new: the insertion line between two siblings |
| `web/src/map/nodes/IdeaNode.tsx` | `draggable`, the drag handlers, and `nopan` so the pan handler lets the drag start (`S2_FE_AC21`) |
| `web/src/map/nodes/nodeActions.ts` | drag actions and the drag-related node data |
| `web/src/map/useMapView.ts` | `move`, optimistic for a reorder, re-read for a reparent |
| `web/src/map/MapPage.tsx` | drag state, the four `Alt` shortcuts, Escape cancelling a drag |
| `web/src/components/Breadcrumb.tsx` | drop target |
| `web/src/components/ShortcutsHelp.tsx` | the new shortcuts |
| `web/src/styles.css` | dragged, target and refused states; the insertion line |
| `web/src/test/fakeApi.ts` | `/move`, renumbering the destination's children |
| `web/src/move.test.tsx`, `web/src/map/dropTarget.test.ts` | new, `S2_FE_AC1`–`AC18` |
| `web/src/actions.test.tsx` | `S1_FE_AC22` updated for the longer list |
| `docs/slices/slice-1-mvp.md` | `S1_FE_AC22` amended |

## 8. Traceability

Measured on 2026-11-16, with the slice delivered:

| Suite | Slice 2 test cases | Criteria covered |
|---|---|---|
| Backend (`api/tests/test_move.py`) | 31 | `S2_BE_AC1`–`AC13`, no gaps |
| Frontend (`move.test.tsx`, `dropTarget.test.ts`, `config.test.ts`) | 41 | `S2_FE_AC1`–`AC18`, `AC20` and `AC21`, no gaps |

`S2_FE_AC19` is the only criterion with no automated test, by decision D6.

Whole-repo totals after the slice: **153 backend tests** (98.23% line coverage) and **159 frontend
tests** (99.46%).

```sh
uv run --directory api pytest --collect-only -q | grep -o 'test_S2_BE_AC[0-9]*' | sort -u
pnpm --dir web exec vitest list | grep -o 'S2_FE_AC[0-9]*' | sort -u
```

## 9. Known gaps

- **No automated coverage of the pointer gesture** (decision D6). `S2_FE_AC21` now covers the
  `mousedown` that starts it, and the drop rules are covered by firing drag events at the real
  elements, but nothing checks that a pointer dragged across the React Flow canvas actually
  reaches those elements; that is `S2_FE_AC19`, by hand, until the project decides on Playwright.
- **Panning no longer starts from a node.** `nopan` on the nodes means the canvas is panned from
  the background, as in any React Flow app whose nodes are draggable.
- **The fake API renumbers a parent's children on every move**, while the real one writes only the
  moved row. The frontend tests therefore cannot assert on `sort_key` values, only on order.
- **Keys grow under adversarial reordering.** `S2_BE_AC12` fixes a floor of 50 moves into the same
  gap; a sufficiently long sequence still lengthens keys. There is no renormalization pass, and the
  128-character cap would eventually answer `422`.
- **No touch support**, so the feature is unusable on a tablet until the mobile-friendly view lands.
- **Outdent departs from outliner convention** (decision D3) and may need revisiting once the
  gesture is used in anger.
- **No undo.** The only recovery from an unintended move is another move.
- **Concurrency between two tabs** behaves as in slice 1: the second move gets a `409`, reverts and
  re-reads. It does not show what the other tab did.

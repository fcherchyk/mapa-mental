# Slice 4B — Kanban board of tasks

**Status:** delivered.

Builds on [slice 4A](slice-4a-task-nodes.md) and every slice before it. Criteria ids follow the
convention in [README.md](README.md): `S4B_BE_AC<n>` for the backend suite and `S4B_FE_AC<n>` for
the frontend suite.

The second slice of the task-oriented series. It adds a second way of looking at the map: a
**board** that shows every task under the focused node as a card, in three columns by status, and
lets the user move cards between columns, reorder them, create and delete them.

---

## 1. Context

Today tasks only live on the canvas, and the canvas shows at most N levels under the focus and
hides what is under a collapsed idea. A person who keeps tasks spread over several branches has
no single place to see them all and work through them by status.

### What already exists

- Tasks with `props = {status, checklist}`, edited with a whole-`props` `PATCH` (slice 4A, D5).
- The details panel with title, status, description and checklist, its save-on-blur rules and
  the serialized save queue (slice 3, D4).
- `sort_keys.key_between`, the fractional keys used for sibling order.
- The focus in the URL (`/`, `/n/:nodeId`), the breadcrumb, the header actions and the window
  cache `ViewCache`.
- The HTML5 drag pattern with an insertion line, from the checklist editor.

### What is missing

- A read of **every** task under a node, at any depth and ignoring `collapsed`. The window
  (`GET /view`) cannot provide it: it stops at N levels and respects `collapsed`.
- An order for cards that does not depend on which board is showing them.
- A board page, its route and a way to switch between map and board.
- The path of a node, to show it in the panel.

## 2. Scope

### Included

- **Board view** at `/board` (the root) and `/n/:nodeId/board` (any idea), with a **Map | Board**
  toggle in the header. The board title is the focused node's title.
- **Three columns**: To do, In progress, Done. Each shows the focus's task descendants with that
  status, at any depth, collapsed or not.
- **One global card order per map** (`board_rank`), so a reorder made on one board holds on every
  board that shows the same cards. New tasks are placed in tree order.
- **Moving cards**: drag between columns (changes status) and within a column (reorders), and
  Alt+←/→ (status) and Alt+↑/↓ (order) on the focused card.
- **Creating** tasks from an "Add task" button at the bottom of the **To do** column, as direct
  children of the focus.
- **Deleting** cards with 🗑 and the Delete key, without confirmation.
- **Details panel** on the board: a single click on a card opens the same panel as on the map.
- **Path in the panel**: a read-only line with the node's ancestors, shown in both views.
- **Roadmap**: "Google Drive documents" is removed from the README roadmap, and this slice takes
  the 4B row of the slice index.

### Explicitly out

- Boards of anything but tasks, or columns other than the three statuses.
- Filters, search, swimlanes, WIP limits, column collapse.
- Creating cards in In progress or Done.
- Live refresh from other tabs. The board reads the server each time it is opened.
- Any change to the map canvas other than the path line in the panel.
- A cap on the number of cards.
- Keeping `board_rank` in step with tree moves (decision D3).
- Touch and mobile drag.

## 3. Decisions

**D1 — The view lives in the URL.**
`/board` is the root's board and `/n/:nodeId/board` is the board of any other node. Back,
forward and reload keep the view. The header shows a toggle, a navigation group labelled "View"
with two links, "Map" and "Board". The current one carries `aria-current="page"`. Switching keeps
the focus. The breadcrumb navigates within the current view: on the board, a breadcrumb entry
opens that ancestor's board. The breadcrumb takes no drop on the board. The "Visible levels"
selector only shows in the map view, because the board ignores N.

**D2 — One global order: `board_rank`.**
Every task has a `board_rank`, a fractional key like `sort_key` (`nodes.board_rank`, text, empty
for ideas). Cards are sorted by `board_rank` within each column on every board, then by `id` to
break ties. Every board is a subset of the same order, so a reorder made on one board holds
wherever the same cards appear together. A reorder writes only the moved card's row.
Reordering B "right before A" places B right before A in the global order. Cards that were
between them, and that other boards show, end up after B.

**D3 — The default order is tree order, set when a task is born.**
A new task takes the rank right after the task that precedes it in the map's depth-first tree
order (siblings by `sort_key`). With no preceding task, it goes right before the following one.
In an empty map it takes the first key. The migration gives existing tasks ranks in tree order.
After that the rank is independent of the tree: moving a task, or an idea with tasks inside, in
the tree does **not** change any rank.

**D4 — Moving a card is one atomic write: `POST /nodes/{id}/board-move`.**
`{ status, place?, version }`. `place` is `{before_id}` or `{after_id}`, naming another task of
the same map. The server sets the status inside `props`, leaving the checklist untouched, and
computes the new rank. The client never does key arithmetic, as with `move`. Without `place`
only the status changes and the rank is kept. A drag uses it, because a drop into another column
at a given spot changes status and position together. Alt+↑/↓ also use it. Alt+←/→ and the
panel's status control keep using `PATCH` with the whole `props` (slice 4A, D5).
`board_rank` is not in `props`: `props` is replaced whole by every checklist save, and the two
would collide.

**D5 — A status change keeps the rank.**
Alt+←/→, the panel's status control, and a drop into an **empty** column change the status
only. The card lands in the new column wherever its rank places it, not at the top or bottom.

**D6 — Alt+arrows do nothing at the edges.**
Alt+→ on a Done card, Alt+← on a To do card, Alt+↑ on the first card of its column and Alt+↓ on
the last card of its column send nothing and change nothing.

**D7 — Cards.**
A card shows the title, a left stripe in the status colour (as on the canvas, slice 4A D8) and
the checklist progress `done/total` when the checklist is not empty. It has a 🗑 button labelled
"Delete <title>", shown on hover, on keyboard focus and on the selected card. A card is
focusable with Tab, and its accessible name is its title. Cards show no path: the path lives in
the panel.

**D8 — Selection and keyboard on the board.**
- **Click** or **Enter** on a card selects it and opens the panel. **Double-click** does nothing.
- **Escape** on the board, or a click on an empty area, clears the selection and closes the panel.
- **Delete** on the focused card deletes it.
- **Alt+←/→, Alt+↑/↓** act on the focused card (D4 to D6), and keyboard focus stays on the card
  after the move.
- The map's own shortcuts (Tab, Shift+Tab, Space, Backspace, plain arrows) do nothing on the
  board.
- When a panel edit ends, focus returns to the selected card, or to the board if the card no
  longer exists.

**D9 — Dragging cards.**
HTML5 drag and drop. While a card is dragged, an insertion line shows at the gap under the
pointer, in any column.
- A drop in a gap of the **same** column reorders the card (`board-move` with the same status).
- A drop in another column changes status and position in one `board-move`.
- A drop on an empty column changes the status only (`place` is `null`).
- A drop where the card already is sends nothing, and Escape cancels the drag.

The gap names its neighbour: `{after_id: <card above>}`, or `{before_id: <first card>}` for the
top gap. Card drags never interact with the canvas or the checklist editor.

**D10 — Creating cards.**
An "Add task" button at the bottom of the To do column opens an inline editor labelled "New task
title". Enter with a non-empty trimmed title creates the task as the **last child of the focus**
in the tree, with status to do, and opens the next editor (the chain, as on the map). Escape, or
Enter on an empty editor, ends the chain. The card goes at the bottom of To do on this board: the
create carries `board_place: {after_id: <last To do card>}`. With To do empty it carries none and
D3 applies. The panel stays hidden while a card is being created. Creation is optimistic, with a
pending card until the API answers.

**D11 — Deleting cards.**
🗑 or Delete sends `DELETE /nodes/{id}` at once, with no dialog, because tasks are always leaves.
It is optimistic: the card disappears, and it comes back with a notice if the API fails.

**D12 — Path in the panel.**
`NodeDetail` gains `path`, the list `[{id, title}]` from the map's root to the node's parent
(empty for the root). The panel shows it above the title as plain, non-clickable text, joined
with "›", labelled "Path". It shows in both views, for ideas and tasks. A title save on any node
drops the other cached details, so no cached path keeps a stale title.

**D13 — Freshness between views.**
The board has no cache: it reads `GET /board` each time it is mounted. Every mutation made on the
board clears the `ViewCache`, so the map shows the new colours and titles when you switch back.
Mutations on the map need nothing, because the board always reads again.

**D14 — Failures.**
As on the map, every board mutation is optimistic. On a `409`, `422` or `5xx` it rolls back,
shows the map's notice ("Could not save…" / the conflict notice) and reads the board again. All
board mutations go through one serialized queue, each with the version the previous one returned
(slice 3, D4).

**D15 — Empty board.**
With no task under the focus, the three columns are drawn empty, with the hint "No tasks under
<title>" and the "Add task" button.

**D16 — Shortcuts help.**
The "?" panel gains a "Board" group with these entries:
- Enter: "Opens the focused card's details."
- Alt+← / Alt+→: "Moves the card to the previous or next column."
- Alt+↑ / Alt+↓: "Moves the card up or down in its column."
- Delete: "Deletes the card."
- Escape: "Clears the selection."
- Drag: "Drag a card to another column or position."

## 4. API changes

Migration `0003_board_rank`: adds the nullable column `nodes.board_rank` (text) and the index
`(map_id, board_rank)`, and backfills every task, map by map, with keys spread in depth-first
tree order. Ideas keep `NULL`.

```http
GET /api/nodes/{id}/board
→ 200 BoardView
{ "focus": NodeOut, "ancestors": [NodeOut],          # root … focus's parent, as in /view
  "tasks": [NodeOut] }                               # every task descendant, by board_rank, id
→ 404 if the node belongs to someone else

POST /api/nodes/{task}/board-move
X-CSRF: 1
{ "status": "in_progress", "place": { "after_id": "<task>" }, "version": 4 }
→ 200 NodeOut           # props.status updated, checklist untouched, version + 1
{ "status": "done", "version": 4 }                    # no place: status only, rank kept
→ 409 stale version · 404 not owned
→ 422 node is not a task · place names itself, an idea or a node of another map
      · unknown status · both before_id and after_id

POST /api/nodes/{idea}/children
{ "title": "Buy milk", "kind": "task", "board_place": { "after_id": "<task>" } }
→ 201 NodeOut           # rank right after that task
→ 422 board_place on an idea, or naming a non-task / another map's node
→ 404 board_place naming a missing or another user's node

GET /api/nodes/{id}
→ 200 NodeDetail  + "path": [ { "id": …, "title": "My map" }, { "id": …, "title": "Project" } ]
```

`NodeOut` does not expose `board_rank`: order is carried by the order of `tasks`.

## 5. Acceptance criteria — backend (`S4B_BE_*`)

**S4B_BE_AC1 — The board has every task under the focus.**
Given a focus F with tasks at levels 1, 2 and 5, some under a collapsed idea, and tasks outside
F's subtree, when `GET /nodes/{F}/board` is sent, then `tasks` holds exactly F's task
descendants, with no ideas, and `focus` and `ancestors` match `/view`'s.
→ `test_S4B_BE_AC1_*` in `api/tests/test_board.py`

**S4B_BE_AC2 — The board is ordered by rank.**
`tasks` comes in `board_rank` order, regardless of status and tree position. A board without
tasks answers `200` with `tasks = []`.
→ `test_S4B_BE_AC2_*`

**S4B_BE_AC3 — A new task is placed in tree order.**
Given tasks A and C in tree order with C right after A, when a task B is created between them in
the tree (before C among its siblings, or under an idea that sits between them), then the root's
board lists A, B, C. A task created in a map without tasks, and one created before every other
task in tree order, also land at their tree position.
→ `test_S4B_BE_AC3_*`

**S4B_BE_AC4 — `board_place` on create.**
`POST /children` with `kind: "task"` and `board_place: {after_id: X}` places the task right after
X, and `{before_id: X}` right before X, whatever its tree position. `board_place` with
`kind: "idea"`, or naming an idea, answers `422`; naming a missing or another user's node answers
`404`. Nothing is created in either case.
→ `test_S4B_BE_AC4_*`

**S4B_BE_AC5 — `board-move` reorders.**
Given the order A, B, C, D, when B is moved with `{after_id: D}`, then the order is A, C, D, B;
with `{before_id: A}`, it is B, A, C, D. Only B's row changes, and its `version` goes up by 1.
→ `test_S4B_BE_AC5_*`

**S4B_BE_AC6 — `board-move` changes the status and keeps the checklist.**
Moving a task with a checklist with `status: "done"` and a `place` sets `props.status = "done"`,
leaves the checklist identical, and places it as asked. Without `place`, only the status changes
and the order is unchanged. A move that changes neither status nor position answers `200` with
the same `version`.
→ `test_S4B_BE_AC6_*`

**S4B_BE_AC7 — `board-move` refusals.**
Each of these changes nothing: moving an idea (`422`); a `place` that names the task itself or an
idea (`422`) or a missing node (`404`, as `move` answers for a missing `after_id`); an unknown
status (`422`); `place` carrying both `before_id` and `after_id`, or any other key (`422`).

A stale `version` answers `409`. Another user's task, or a `place` naming one, answers `404`
without revealing it. A request without `X-CSRF` answers `403`.
→ `test_S4B_BE_AC7_*`

**S4B_BE_AC8 — Tree changes keep ranks.**
Moving a task to another idea, moving an idea with tasks inside, deleting with `reparent`, and
patching props or title leave every remaining task's `board_rank` unchanged.
→ `test_S4B_BE_AC8_*`

**S4B_BE_AC9 — Migration backfill.**
After `0003` runs on a database with tasks spread over several branches and two maps, every task
has a rank, every idea has `NULL`, and each map's board lists its tasks in depth-first tree order.
The downgrade drops the column.
→ `test_S4B_BE_AC9_*` in `api/tests/test_board.py`

**S4B_BE_AC10 — Path in the detail.**
`GET /nodes/{id}` returns `path` from the root to the parent, with current titles. It is `[]`
for the root. `PATCH` also answers with `path`.
→ `test_S4B_BE_AC10_*`

**S4B_BE_AC11 — Isolation.**
`GET /board` of another user's node answers `404`.
→ `test_S4B_BE_AC11_*`

## 6. Acceptance criteria — frontend (`S4B_FE_*`)

### Navigation

**S4B_FE_AC1 — Board routes.**
`/board` requests `GET /nodes/{root}/board`, and `/n/X/board` requests X's. Both draw the focus's
title as the board's heading and three columns: "To do", "In progress" and "Done". Reload keeps
the board.
→ `S4B_FE_AC1:` in `web/src/board.test.tsx`

**S4B_FE_AC2 — The toggle.**
The header has a "View" navigation group with "Map" and "Board". The current one has
`aria-current="page"`. From `/n/X`, "Board" goes to `/n/X/board`, and "Map" goes back to `/n/X`.
Back and forward work across the switch. "Visible levels" only shows on the map.
→ `S4B_FE_AC2:`

**S4B_FE_AC3 — Breadcrumb on the board.**
On `/n/X/board`, clicking an ancestor opens that ancestor's board (the root's at `/board`).
→ `S4B_FE_AC3:`

### Cards

**S4B_FE_AC4 — Columns and cards.**
Each column lists the tasks with its status, in the order the API returned them. A card shows
the title, a stripe with `data-status` and the accessible label "Status: …", and `2/5` progress
with the label "2 of 5 done" only when the checklist is not empty. A column's heading shows its
count.
→ `S4B_FE_AC4:`

**S4B_FE_AC5 — Empty board.**
A focus with no tasks shows three empty columns, the hint "No tasks under <title>" and the "Add
task" button.
→ `S4B_FE_AC5:`

### Selection and panel

**S4B_FE_AC6 — Click opens the panel.**
Clicking a card, or Enter on a focused card, opens "Task details" for that task. Double-click
does nothing else. Escape, or a click on an empty area, closes the panel.
→ `S4B_FE_AC6:`

**S4B_FE_AC7 — Panel edits reach the card.**
Changing the title in the panel renames the card. Changing the status in the panel moves the card
to that column at its rank position, with the stripe updated at once, and sends `PATCH` with the
whole `props`. Checklist changes update the card's progress.
→ `S4B_FE_AC7:`

**S4B_FE_AC8 — Path in the panel.**
In both views, the panel shows the "Path" line with the ancestors' titles from the root to the
parent, joined with "›", as text with no links. For the root it shows nothing.
→ `S4B_FE_AC8:` in `web/src/detailsPanel.test.tsx`

### Moving

**S4B_FE_AC9 — Drag to another column.**
Dragging a To do card onto the gap after card Y in "In progress" sends `board-move` with
`{status: "in_progress", place: {after_id: Y}, version}`, and draws the card there at once. The
top gap sends `{before_id: <first card>}`. An empty column sends no `place`.
→ `S4B_FE_AC9:`

**S4B_FE_AC10 — Drag within a column.**
Given A, B, C in To do, dragging A to the gap after C sends `board-move` with
`{status: "to_do", place: {after_id: C}}`, and the column reads B, C, A at once. Dropping A on
its own gap sends nothing. Escape during a drag sends nothing.
→ `S4B_FE_AC10:`

**S4B_FE_AC11 — Alt+←/→ change the status.**
On a focused In progress card, Alt+→ sends `PATCH` with the props and `status: "done"`, and Alt+←
sends it with `"to_do"`. The card moves to that column at its rank position and keeps keyboard
focus. Alt+→ on Done, and Alt+← on To do, send nothing.
→ `S4B_FE_AC11:`

**S4B_FE_AC12 — Alt+↑/↓ reorder.**
Given A, B, C in a column, Alt+↑ on B sends `board-move` with `{before_id: A}`, and Alt+↓ on B
sends it with `{after_id: C}`. Each uses the same status, and the card keeps focus. Alt+↑ on the
first card and Alt+↓ on the last send nothing. Neighbours are those of this board's column.
→ `S4B_FE_AC12:`

**S4B_FE_AC13 — Move failure rolls back.**
When a `board-move` or a status `PATCH` answers `409` or `5xx`, the card returns to its column
and position, a notice shows, and the board is read again.
→ `S4B_FE_AC13:`

### Creating and deleting

**S4B_FE_AC14 — Add task.**
"Add task" in To do opens "New task title". Enter on "Milk" sends `POST /nodes/{focus}/children`
with `{title: "Milk", kind: "task", board_place: {after_id: <last To do card>}}`. With To do
empty, it carries no `board_place`. The card shows at the bottom of To do at once, and the next
editor opens. Escape, or Enter on an empty editor, ends the chain. Only the To do column has the
button.
→ `S4B_FE_AC14:`

**S4B_FE_AC15 — Creation failure.**
If `POST` fails, the pending card disappears and a notice shows.
→ `S4B_FE_AC15:`

**S4B_FE_AC16 — Delete.**
🗑 "Delete <title>", or Delete on a focused card, sends `DELETE` at once with no dialog, and
the card disappears. On failure it comes back and a notice shows. If the deleted card was
selected, the panel closes.
→ `S4B_FE_AC16:`

### Keyboard, sync, help

**S4B_FE_AC17 — Map shortcuts are off on the board.**
On the board, Tab, Shift+Tab, Space, Backspace and the plain arrows never create, collapse,
navigate or move anything. While a panel field has focus, Alt+arrows and Delete do not act on
cards.
→ `S4B_FE_AC17:`

**S4B_FE_AC18 — The map is fresh after the board.**
Given `/n/X` was visited, when a card's status is changed on `/n/X/board` and "Map" is clicked,
then the window is requested again and the task's stripe shows the new status.
→ `S4B_FE_AC18:`

**S4B_FE_AC19 — The board reads again on every visit.**
Going board → map → board sends `GET /board` twice.
→ `S4B_FE_AC19:`

**S4B_FE_AC20 — Shortcuts help.**
The "?" panel lists the "Board" group with the wording of D16.
→ `S4B_FE_AC20:` in `web/src/actions.test.tsx`

**S4B_FE_AC21 — Manual validation.**
With the app running:
- Open the board from the root and from a branch.
- Drag cards between columns and within them, then open another branch's board and see the
  relative order kept.
- Use Alt+arrows, including at the edges.
- Add several tasks with Enter, delete with 🗑 and Delete, and edit in the panel and see the path.
- Switch to the map and see the colours.
- Reload and see everything persisted.

→ Manual, by hand.

**S4B_FE_AC22 — Coverage.**
`pnpm --dir web exec vitest run --coverage` still meets the 80% line threshold.
→ `S4B_FE_AC22:` in `web/src/config.test.ts`

## 7. Criteria amended in earlier slices

| Criterion | Change |
|---|---|
| `NodeDetail` contract (slice 3) | Gains `path`. |
| `S1_FE_AC22` and successors, the shortcuts panel | New "Board" group (`S4B_FE_AC20`). |
| Header (slice 1) | Gains the Map/Board toggle. "Visible levels" shows only in the map view. |
| README "Features" and "Roadmap" | Board features added; "Google Drive documents" removed from the roadmap. |
| `docs/slices/README.md` | The 4B row now points to this document. |

## 8. Changes by file

| File | Change |
|---|---|
| `api/migrations/versions/0003_board_rank.py` | new: column, index, tree-order backfill, downgrade |
| `api/app/models.py` | `Node.board_rank` |
| `api/app/nodes/schemas.py` | `BoardView`, `BoardMove`, `BeforeAfter` place, `NodeCreate.board_place`, `PathEntry`, `NodeDetail.path` |
| `api/app/nodes/repository.py` | `BOARD_SQL` (task descendants, any depth, by rank), tree-order neighbours of a task, next/previous rank in a map, path query |
| `api/app/nodes/board.py` | new: `get_board`, `board_move`, `rank_for_new_task` (D3 and `board_place`), `tree_neighbours` |
| `api/app/nodes/service.py` | rank on task create, `path` in `to_node_detail` |
| `api/tests/test_description.py` | `S3_BE_AC3` tolerates `path` |
| `api/app/nodes/router.py` | `GET /{id}/board`, `POST /{id}/board-move` |
| `api/tests/test_board.py` | new, `S4B_BE_AC1`–`AC11` |
| `web/src/api/schema.ts` | regenerated (`pnpm gen:api`) |
| `web/src/api/client.ts` | `BoardView`, `getBoard`, `boardMove` |
| `web/src/App.tsx` | `/board` and `/n/:nodeId/board` routes |
| `web/src/session.tsx` | `boardPathFor` |
| `web/src/components/ViewToggle.tsx` | new: the "View" Map/Board links |
| `web/src/components/Breadcrumb.tsx` | path builder per view; drop optional (already) |
| `web/src/components/DetailsPanel.tsx` | the "Path" line |
| `web/src/components/ShortcutsHelp.tsx` | "Board" group |
| `web/src/map/MapPage.tsx` | the toggle in the header |
| `web/src/map/useMapView.ts`, `map/detailCache.ts`, `map/tree.ts` | drop other cached details after a title save (D12); `setCreated` takes the path; `pathTo` |
| `web/src/navigation.test.tsx`, `actions.test.tsx`, `move.test.tsx` | `board_rank` in a fixture; help assertions scoped to the "Map" group |
| `web/src/board/BoardPage.tsx` | new: header, heading, columns, panel, keyboard |
| `web/src/board/BoardColumn.tsx`, `BoardCard.tsx` | new: list, gaps, insertion line, card, 🗑, inline editor |
| `web/src/board/useBoardView.ts` | new: load, optimistic queue, status, board-move, create, delete, details for the panel, cache clear |
| `web/src/board/boardOrder.ts` | new, pure: columns from tasks, the place for a gap, neighbours for Alt+↑/↓, local reorder |
| `web/src/styles.css` | board layout, cards, insertion line, toggle |
| `web/src/test/fakeApi.ts` | `board_rank`, `/board`, `/board-move`, `board_place`, `path` |
| `web/src/board.test.tsx` | new, `S4B_FE_AC1`–`AC7`, `AC9`–`AC19` |
| `web/src/board/boardOrder.test.ts` | new, supporting unit tests |
| `web/src/detailsPanel.test.tsx`, `actions.test.tsx`, `config.test.ts` | `S4B_FE_AC8`, `AC20`, `AC22` |
| `docs/slices/README.md`, `README.md`, `.agents/memory/architecture.md` | index, features, roadmap, architecture |

## 9. Traceability

Measured on 2026-11-18, with the slice implemented:

| Suite | Slice 4B test cases | Criteria covered |
|---|---|---|
| Backend (`api/tests/test_board.py`) | 37 | `S4B_BE_AC1`–`AC11`, no gaps |
| Frontend (`board.test.tsx`, `detailsPanel.test.tsx`, `actions.test.tsx`, `config.test.ts`) | 34, plus 10 supporting tests in `board/boardOrder.test.ts` | `S4B_FE_AC1`–`AC20` and `AC22`, no gaps |

`S4B_FE_AC21` is manual and was validated by hand on 2026-11-18, together with a smoke test of
the whole app.

Whole-repo totals after the slice: **250 backend tests** (98% line coverage) and **266 frontend
tests** (99.46% line coverage).

```sh
uv run --directory api pytest --collect-only -q | grep -o 'test_S4B_BE_AC[0-9]*' | sort -u
pnpm --dir web exec vitest list | grep -o 'S4B_FE_AC[0-9]*' | sort -u
```

## 10. Known gaps

- **Global "right before" semantics.** A reorder on one board can move a card past cards that
  only other boards show (D2).
- **Rank ignores later tree moves.** A task moved to another branch keeps its board position
  (D3), so a board can diverge from tree order over time.
- **No live sync** across tabs. Boards read the server on open.
- **No cap.** A very large subtree draws every card.
- **Status by colour.** Cards carry the same colour-only signal as the canvas (slice 4A gap).

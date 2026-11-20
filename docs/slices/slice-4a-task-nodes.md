# Slice 4A — Task nodes: kind, status and checklist

**Status:** delivered. *Slice 5 replaced the task button with the kind menu: "+" or Shift+Tab
opens it and "Task" (or 2) creates a task. D9, D14, `S4A_FE_AC1`–`AC5` and `AC23` are amended
accordingly; see [slice 5](slice-5-document-nodes.md), section 7.*

Builds on [slice 1](slice-1-mvp.md), [slice 2](slice-2-move-and-reorder.md) and
[slice 3](slice-3-node-details.md). Criteria ids follow the convention in [README.md](README.md):
`S4A_BE_AC<n>` for the backend suite and `S4A_FE_AC<n>` for the frontend suite.

This is the first of a series of slices about task-oriented nodes. It adds the second node kind,
`task`, and the machinery every later kind will reuse: a kind chosen at creation, a component per
kind on the canvas, a details panel that adapts to the kind, and typed `props` validated per kind.

---

## 1. Context

Today every node is an `idea`: a title, a description, and children. The data model already
anticipates other kinds (ADR 0013): `nodes.kind` is text, `nodes.props` is jsonb validated by a
Pydantic schema per kind in `app/node_types`, `POST /children` and `PATCH` already accept `kind`
and `props`, and `NodeRenderer` already picks a component by `kind`. Nothing uses that machinery
yet beyond `idea` with empty props.

This slice adds the **task**: a node that has a title and a description like an idea, plus a
**status** (to do, in progress, done) and a **checklist**. A task is drawn differently on the
canvas, with a coloured stripe for its status and its checklist progress, and its status and
checklist are edited in the details panel.

### What already exists

- `app/node_types.NODE_TYPES`, `validate_props(kind, props)`, `NodeCreate.kind` and
  `NodeCreate.props` with per-kind validation.
- `NodeOut.kind` and `NodeOut.props` in every response, including the window.
- `NodeRenderer` with a `NODE_COMPONENTS` map by kind; `IdeaNode` is the only entry.
- The details panel, its save-on-blur rules and the serialized save queue (slice 3, D4).
- Drop-target rules in `map/dropTarget.ts`, and `dropState: 'refused'` styling.

### What is missing

- A `task` kind and its `props` schema.
- A rule that some kinds cannot have children, enforced by the API and reflected in the UI.
- A way to create a task, a component to draw it, and panel controls for status and checklist.

## 2. Scope

### Included

- **`kind = "task"`** with `props = { status, checklist }`, validated on create and on every
  `PATCH` of `props`.
- **Tasks are leaves.** The API refuses to create a child under a task and to move a node into a
  task. The UI offers no create affordance on a task and refuses drops and keyboard moves into it.
- **A node's kind is fixed at creation.** `PATCH` no longer accepts `kind` at all.
- **Creating a task**: a second button on each idea ("Add a task inside …") and the
  **Shift+Tab** shortcut. Both open the same inline title editor used for ideas.
- **`TaskNode`** on the canvas: a left stripe coloured by status and the checklist progress
  `done/total`.
- **Details panel for a task**: title, a segmented status control, description, and a checklist
  editor with add, edit text, toggle done, delete and drag-and-drop reorder.
- **Shortcuts help** updated.

### Explicitly out

- Any other kind (document, event, project…). This slice only adds `task`.
- Converting an idea into a task or back. Delete and create a new one.
- Coupling between checklist and status (auto-done, auto-check). They are independent.
- Due dates, assignees, priorities, tags, or any task field beyond status and checklist.
- Filtering or listing tasks across the map (roadmap: filtered views).
- Showing the status word on the canvas. The canvas shows colour and progress; the word lives in
  the panel.
- Checklist items with more than plain text (no links, no nested items, no descriptions).
- Keyboard reorder of checklist items (Alt+arrows). Reorder is by drag only in this slice.
- A migration. No column changes; `props` already exists.

## 3. Decisions

**D1 — Task data lives in `props`, including the checklist, and travels with the window.**
`props = { "status": "to_do" | "in_progress" | "done", "checklist": [ { "id", "text", "done" } ] }`.
This departs from slice 3's D2 (the description is read on demand): a checklist is bounded (30
items × 100 characters) and the canvas needs the progress count for every visible task, so
fetching it per node would cost one request per task on screen. `NodeOut` keeps its shape; only
the content of `props` changes for tasks.

**D2 — Kind is immutable.**
`NodePatch` drops its `kind` field, so a `PATCH` that carries `kind` answers `422` (unknown
field). There is no conversion endpoint. This simplifies `props` validation: the kind that
validates a patch is always the stored one.

**D3 — Tasks are leaves, enforced by the API.**
`app/node_types` gains a per-kind `allows_children` flag (`idea: true`, `task: false`).
`POST /nodes/{task}/children` and `POST /nodes/{x}/move` with `parent_id` a task answer `422`.
The root is created as an `idea` and kinds never change, so the root can never be a task; the
UI never offers to create a task where there is no parent. `DELETE … ?children=reparent` is
unaffected: the parent of a node with children is never a task.

**D4 — Checklist item ids are client-generated.**
Each item carries an `id` (any non-empty string up to 64 characters; the SPA uses
`crypto.randomUUID()`). The API validates that ids are unique within the checklist and otherwise
treats them as opaque. The client needs stable keys the moment it adds an item, before any
server answer, and the whole `props` is replaced on each save (D5), so server-assigned ids would
buy nothing.

**D5 — Every task edit sends the whole `props`.**
Status and checklist changes are each one `PATCH /nodes/{id}` with `{ props, version }`, where
`props` is the complete object. The serialized queue of slice 3 (D4) means successive edits in
the same panel never conflict with each other. Two tabs editing the same task collide as a `409`
and roll back, as any other edit does today. There is no per-item endpoint.

**D6 — Limits.**
At most **30** items per checklist. Item text is trimmed, **1 to 100** characters. `status` must
be one of the three values; a missing `status` defaults to `to_do` and a missing `checklist` to
`[]`, so `POST /children` with `kind: "task"` and no `props` creates a valid task. Any other key
in `props` answers `422`. Idea props stay `{}` and refuse every key.

**D7 — Status and checklist are independent.**
Checking every item does not set `done`; setting `done` does not check items. The canvas shows
both signals so the two can be read at a glance.

**D8 — Canvas visualization.**
A task is drawn like an idea (same size, same title), with a **left stripe** 6px wide in the
status colour: blue for to do, yellow for in progress, green for done. Right of the title, when
the checklist is not empty, the progress `done/total` (for example `2/5`). An empty checklist
shows nothing. The status word is not drawn; the stripe carries it as an accessible label
("Status: In progress") for assistive technology only. Tasks show no "+" and no "+k": they never
have children. They show 🗑 like ideas, and they can be dragged.

**D9 — Creating a task mirrors creating an idea.** *(Amended by slice 5, D8: the button and the
direct Shift+Tab gave way to the kind menu.)*
A second button on every **idea** (not on tasks) with the accessible label "Add a task inside
<title>", shown with the same hover/selection rules as "+", and the **Shift+Tab** shortcut. Both
open the inline `TitleEditor` with the label "New task title". Confirming creates the node with
`kind: "task"` and default props. **Enter while creating a task opens a sibling task**, as Enter
while creating an idea opens a sibling idea: the chain keeps the kind. The panel stays hidden
during inline creation (slice 3, D8).

**D10 — Nothing happens where a task cannot act.**
On a selected task: Tab, Shift+Tab and Space do nothing. Enter and double-click do nothing (a
focused task would show an empty map). → does nothing (no children). Dropping on a task's body
shows the refused state and does nothing; Alt+→ onto a task sibling does nothing. Deleting a task
never opens the dialog: it is always a leaf.

**D11 — The panel adapts to the kind.**
The panel's accessible label is "Idea details" or "Task details". For a task the fields are, in
order: Title, Status, Description, Checklist. Title and Description behave exactly as in slice 3.

**D12 — Status control.**
A segmented control, a `radiogroup` labelled "Status" with three radios: "To do", "In progress",
"Done". Choosing one saves immediately (one `PATCH` with the whole `props`), the stripe on the
canvas changes at once (optimistic) and focus stays in the control. Arrow keys move among the
radios as browsers do. Escape in the control gives the keyboard back to the map.

**D13 — Checklist editor.**
A list (`role="list"`, labelled "Checklist") with one row per item: a drag handle, a checkbox
labelled by the item text, the text as an editable field, and a "Remove <text>" button. Below the
list, an input labelled "New item" and a counter `<n> / 30`.

- **Add**: Enter in "New item" with non-empty trimmed text appends an item (`done: false`) and
  clears the input; the input keeps focus so several items can be typed in a row. Blur with text
  also adds. Whitespace-only text is ignored. At 30 items the input is disabled.
- **Toggle**: clicking the checkbox saves at once.
- **Edit text**: the text field saves on blur or Enter when trimmed text differs; empty text
  restores the previous value and shows "Item text can't be empty"; Escape restores and returns
  focus to the map. The field does not accept more than 100 characters.
- **Remove**: saves at once, no confirmation.
- **Reorder**: items are draggable with the browser's HTML5 drag and drop, inside the panel only.
  While one is dragged, an insertion line is shown at the gap under the pointer; dropping saves
  the new order. Dropping where the item already is sends nothing. Escape cancels the drag. This
  drag never reaches the canvas: a checklist item dropped on the map does nothing, and a map node
  dropped on the panel does nothing.
- Every change above is optimistic: the panel and the canvas progress update at once, and a
  failed save rolls both back and re-reads (slice 3, AC11).

**D14 — Shortcuts help wording.**
New entry **Shift+Tab**: "With the map focused, adds a task inside the selected idea and starts
editing it. Tasks can't contain anything." The Tab, Drag and Alt+→ entries say "idea or task"
where a task may be the subject, and "idea" where only an idea can be the target.

## 4. API changes

No new endpoint and no migration.

```http
POST /api/nodes/{parent}/children
X-CSRF: 1
{ "title": "Buy milk", "kind": "task" }
→ 201 NodeOut   props = { "status": "to_do", "checklist": [] }

POST /api/nodes/{parent}/children
{ "title": "Buy milk", "kind": "task",
  "props": { "status": "in_progress",
             "checklist": [ { "id": "a1", "text": "Go to the shop", "done": true } ] } }
→ 201 NodeOut

POST /api/nodes/{task}/children         → 422  "a task cannot have children"
POST /api/nodes/{x}/move  { parent_id: <task>, … }   → 422  "a task cannot have children"

PATCH /api/nodes/{task}
{ "props": { "status": "done", "checklist": [ … ] }, "version": 3 }
→ 200 NodeDetail

PATCH /api/nodes/{id}  { "kind": "task", "version": 3 }      → 422  (unknown field)
PATCH /api/nodes/{idea} { "props": { "status": "done" }, … }  → 422  (idea props take no keys)
```

`TaskProps` (Pydantic, `extra="forbid"`):

| Field | Type | Rules |
|---|---|---|
| `status` | `"to_do" \| "in_progress" \| "done"` | default `to_do` |
| `checklist` | `list[ChecklistItem]` | default `[]`, max 30, ids unique |
| `ChecklistItem.id` | `str` | 1–64 chars, opaque |
| `ChecklistItem.text` | `str` | trimmed, 1–100 chars |
| `ChecklistItem.done` | `bool` | default `false` |

`validate_props` already returns the model's `model_dump()`, so stored props always carry both
keys with defaults applied and trimmed text.

## 5. Acceptance criteria — backend (`S4A_BE_*`)

**S4A_BE_AC1 — Create a task with defaults.**
Given an idea P, when `POST /children` is sent with `{title, kind: "task"}` and no `props`, then
the answer is `201` with `kind = "task"`, `props = {"status": "to_do", "checklist": []}` and
`child_count = 0`. The same node appears in `GET /view` of P with the same `kind` and `props`.
→ `test_S4A_BE_AC1_*` in `api/tests/test_tasks.py`

**S4A_BE_AC2 — Create a task with props.**
When `POST /children` carries `kind: "task"` and props with a valid status and a checklist, then
they are stored as sent, with item texts trimmed and `done` defaulting to `false` where omitted.
→ `test_S4A_BE_AC2_*` in `api/tests/test_tasks.py`

**S4A_BE_AC3 — Invalid task props are refused.**
Each of these answers `422` and creates nothing: an unknown status; a checklist of 31 items; an
item with empty or whitespace-only text; an item text of 101 characters; two items with the same
id; an item without `id` or without `text`; an unknown key in `props` or in an item. A checklist of
exactly 30 items and a text of exactly 100 characters are accepted.
→ `test_S4A_BE_AC3_*` in `api/tests/test_tasks.py`

**S4A_BE_AC4 — Idea props stay empty.**
`POST /children` with `kind: "idea"` (or no kind) and `props: {"status": "done"}` answers `422`.
`PATCH` of an idea with `props: {"status": "done"}` answers `422` and nothing changes.
→ `test_S4A_BE_AC4_*` in `api/tests/test_tasks.py`

**S4A_BE_AC5 — Edit task props.**
Given a task T with `version = v`, when `PATCH` is sent with `{props, version: v}` carrying a new
status and a reordered, edited checklist, then the answer is `200 NodeDetail` with the props
exactly as validated and `version = v+1`; `GET /nodes/{T}` and `GET /view` of its parent return the
same props. A `PATCH` with the same props answers `200` without incrementing `version`.
→ `test_S4A_BE_AC5_*` in `api/tests/test_tasks.py`

**S4A_BE_AC6 — Invalid props on PATCH are refused and change nothing.**
Given T, when `PATCH` carries props that break any rule of AC3, together with a new `title`, then
the answer is `422` and neither props nor title change.
→ `test_S4A_BE_AC6_*` in `api/tests/test_tasks.py`

**S4A_BE_AC7 — Kind cannot be patched.**
`PATCH` with `{kind: "task", version}` on an idea, or `{kind: "idea", version}` on a task, or even
`{kind: <same kind>, version}`, answers `422` and nothing changes.
→ `test_S4A_BE_AC7_*` in `api/tests/test_tasks.py`

**S4A_BE_AC8 — A task cannot have children.**
Given a task T, when `POST /nodes/{T}/children` is sent, then the answer is `422` and no node is
created. When `POST /nodes/{N}/move` is sent with `parent_id = T` for any N, then the answer is
`422` and N keeps its parent and `sort_key`.
→ `test_S4A_BE_AC8_*` in `api/tests/test_tasks.py`

**S4A_BE_AC9 — Tasks move and delete like ideas.**
A task can be moved to another idea (`place` first, last and after a sibling) and reordered among
its siblings, and `DELETE` removes it with `204`. The root created on first login is an `idea`.
→ `test_S4A_BE_AC9_*` in `api/tests/test_tasks.py`

**S4A_BE_AC10 — Version and isolation.**
A `PATCH` of props with a stale `version` answers `409` and nothing changes. Creating or patching
a task on another user's node answers `404`.
→ `test_S4A_BE_AC10_*` in `api/tests/test_tasks.py`

## 6. Acceptance criteria — frontend (`S4A_FE_*`)

### Creating tasks

**S4A_FE_AC1 — The task button.** *(Amended by slice 5: the "Task" entry of the kind menu of
"+"; tasks have no "+", and a node being created has none either.)*
Every idea node has a button with the accessible label "Add a task inside <title>", shown under
the same rules as "+" (focus, selection, hover; never while editing or pending). Task nodes have
neither "+" nor the task button.
→ `S4A_FE_AC1:` in `web/src/tasks.test.tsx`

**S4A_FE_AC2 — Creating a task inline.** *(Amended by slice 5: Shift+Tab opens the kind menu and
2, or "Task", opens the editor.)*
Given an idea selected and the map focused, when Shift+Tab is pressed (or the task button is
clicked), then an inline editor labelled "New task title" opens as a new last child. Confirming
with Enter sends `POST /children` with `{title, kind: "task"}` (no `props`), and the created node
is drawn as a task with a to-do stripe and no progress. The panel stays hidden while editing.
→ `S4A_FE_AC2:` in `web/src/tasks.test.tsx`

**S4A_FE_AC3 — Enter chains tasks.**
Given a task being created inline, when Enter confirms it, then the next inline editor is also
"New task title" and the second `POST` also carries `kind: "task"`. Escape on the empty one ends
the chain and selects the last created task.
→ `S4A_FE_AC3:` in `web/src/tasks.test.tsx`

**S4A_FE_AC4 — Creating under a border or collapsed idea.**
Shift+Tab on a border idea moves the focus one level toward it and then creates the task there;
on a collapsed idea it expands first, as Tab does (`S1_FE_AC*` rules for "+").
→ `S4A_FE_AC4:` in `web/src/tasks.test.tsx`

**S4A_FE_AC5 — Nothing is created inside a task.**
Given a task selected, when Tab or Shift+Tab is pressed, then no editor opens and no request is
sent. Space does nothing.
→ `S4A_FE_AC5:` in `web/src/tasks.test.tsx`

### Canvas

**S4A_FE_AC6 — The stripe follows the status.**
A task node carries `data-status` and a stripe element with the accessible label "Status: To
do" / "Status: In progress" / "Status: Done", and a class that maps to blue / yellow / green in
`styles.css`. No visible status word is drawn on the node.
→ `S4A_FE_AC6:` in `web/src/tasks.test.tsx`

**S4A_FE_AC7 — Progress.**
A task with items shows `<done>/<total>` (for example `2/5`) with the accessible label
"2 of 5 done". A task with an empty checklist shows no progress element. The count updates
when items are toggled, added or removed in the panel.
→ `S4A_FE_AC7:` in `web/src/tasks.test.tsx`

**S4A_FE_AC8 — No "+k" and no children.**
A task never shows the hidden-children indicator. → on a selected task keeps the selection on it.
→ `S4A_FE_AC8:` in `web/src/tasks.test.tsx`

**S4A_FE_AC9 — Tasks are not focusable.**
Double-clicking a task, or Enter on a selected task, navigates nowhere and sends no request.
→ `S4A_FE_AC9:` in `web/src/tasks.test.tsx`

**S4A_FE_AC10 — Drops into a task are refused.**
While dragging an idea over a task, the task shows the refused state and dropping sends nothing.
Alt+→ on a node whose sibling above is a task sends nothing. A task itself can be dragged onto an
idea and between its siblings, and Alt+↑/↓/← move it, as any idea (`S2_FE_*` rules).
→ `S4A_FE_AC10:` in `web/src/tasks.test.tsx`

**S4A_FE_AC11 — Deleting a task never asks.**
Delete or 🗑 on a task sends `DELETE` at once, without the dialog.
→ `S4A_FE_AC11:` in `web/src/tasks.test.tsx`

### Panel: status

**S4A_FE_AC12 — The task panel.**
Selecting a task opens the panel labelled "Task details" with, in order, Title, a `radiogroup`
"Status" with the current status checked, Description, and a "Checklist" list. Selecting an idea
shows "Idea details" with no Status and no Checklist. The panel follows the selection between an
idea and a task.
→ `S4A_FE_AC12:` in `web/src/taskPanel.test.tsx`

**S4A_FE_AC13 — Changing the status.**
Given a task with `version = v` and props `P`, when "Done" is chosen, then `PATCH /nodes/{id}` is
sent with `{props: {...P, status: "done"}, version: v}`, the stripe changes to green at once, and
the radio stays checked after the answer. Choosing the already-checked status sends nothing.
→ `S4A_FE_AC13:` in `web/src/taskPanel.test.tsx`

**S4A_FE_AC14 — Status failure rolls back.**
Given the `PATCH` answers `409` or `5xx`, then the radio and the stripe return to the previous
status, a notice is shown, and the window and detail are read again.
→ `S4A_FE_AC14:` in `web/src/taskPanel.test.tsx`

### Panel: checklist

**S4A_FE_AC15 — Adding items.**
Typing "Milk" in "New item" and pressing Enter sends `PATCH` with the checklist plus
`{id: <non-empty string>, text: "Milk", done: false}` at the end, clears the input and keeps focus
in it. Leading/trailing spaces are trimmed. Whitespace-only text sends nothing. The counter reads
`<n> / 30`, and at 30 items the input is disabled.
→ `S4A_FE_AC15:` in `web/src/taskPanel.test.tsx`

**S4A_FE_AC16 — Toggling items.**
Clicking an item's checkbox sends `PATCH` with that item's `done` flipped and the others
untouched; the canvas progress updates at once. The status is not changed by toggling.
→ `S4A_FE_AC16:` in `web/src/taskPanel.test.tsx`

**S4A_FE_AC17 — Editing item text.**
Changing an item's text and blurring (or Enter) sends `PATCH` with the new trimmed text and the
same id. An unchanged text sends nothing. Empty text restores the previous one and shows "Item
text can't be empty". Escape restores it and gives focus to the map. The field accepts at most
100 characters.
→ `S4A_FE_AC17:` in `web/src/taskPanel.test.tsx`

**S4A_FE_AC18 — Removing items.**
Clicking "Remove <text>" sends `PATCH` without that item and the list and progress update at once.
→ `S4A_FE_AC18:` in `web/src/taskPanel.test.tsx`

**S4A_FE_AC19 — Reordering by drag.**
Given items A, B, C, when A is dragged and dropped on the gap after C, then `PATCH` is sent with
the order B, C, A and the list is redrawn in that order at once. Dropping A on the gap where it
already is (before B) sends nothing. Escape during the drag cancels it and sends nothing. The
drag does not mark any canvas node as a drop target.
→ `S4A_FE_AC19:` in `web/src/taskPanel.test.tsx`

**S4A_FE_AC20 — Checklist failure rolls back.**
Given a checklist `PATCH` answers `409`, `422` or `5xx`, then the list, the counter and the canvas
progress return to the last saved checklist, a notice is shown, and the window and detail are
read again.
→ `S4A_FE_AC20:` in `web/src/taskPanel.test.tsx`

**S4A_FE_AC21 — Saves are serialized with title and description.**
Given a title save in flight for a task, when a checklist change is made, then its `PATCH` is sent
only after the first answers and with the version it returned (slice 3, D4).
→ `S4A_FE_AC21:` in `web/src/taskPanel.test.tsx`

**S4A_FE_AC22 — Map shortcuts are off in the new controls.**
While the status radios, an item text, the "New item" input or a checkbox has focus, Tab,
Shift+Tab, Delete, Backspace, Space, the arrows and Alt+arrows never act on the map.
→ `S4A_FE_AC22:` in `web/src/taskPanel.test.tsx`

### Help, manual, coverage

**S4A_FE_AC23 — The shortcuts panel.** *(Amended by slice 5, `S5_FE_AC22`: new Shift + Tab
wording, and the Alt and Drag entries name documents.)*
The "?" panel lists Shift+Tab with the wording of D14 and the amended Tab, Drag and Alt+→ entries.
→ `S4A_FE_AC23:` in `web/src/actions.test.tsx`

**S4A_FE_AC24 — Manual validation.**
With the app running: create tasks with the button and Shift+Tab; chain several with Enter; see
the stripe and progress on the canvas; change status and see the colour change; add, check, edit,
reorder by drag and remove items; drag an idea onto a task and see it refused; drag a task onto an
idea and see it move; reload and see everything persisted.
→ Manual, by hand.

**S4A_FE_AC25 — Coverage.**
`pnpm --dir web exec vitest run --coverage` still meets the 80% line threshold.
→ `S4A_FE_AC25:` in `web/src/config.test.ts`

## 7. Criteria amended in earlier slices

| Criterion | Change |
|---|---|
| `PATCH` accepts `kind` (slice 1 contract, `S1_BE_*` and the README) | `kind` is removed from `NodePatch`; sending it answers `422`. Any existing test that patched `kind` is rewritten or removed. |
| `S1_FE_AC22`, `S2_FE_AC17`, `S3_FE_AC20` — Shortcuts panel | New Shift+Tab entry and the amended wording (`S4A_FE_AC23`). |
| `S2_FE_AC*` — drop on a node body makes it the last child | Only when the body is an idea. A task body refuses the drop. |
| README "Features" | Task nodes, the task button, Shift+Tab and the panel controls added. |

## 8. Changes by file

| File | Change |
|---|---|
| `api/app/node_types/__init__.py` | `TaskProps`, `ChecklistItem`, `TaskStatus`; registry entries with `allows_children`; `allows_children(kind)` |
| `api/app/nodes/schemas.py` | remove `kind` from `NodePatch` |
| `api/app/nodes/service.py` | leaf check in `create_child` and `move_node`; drop the `kind` branch of `apply_patch` |
| `api/tests/test_tasks.py` | new, `S4A_BE_AC1`–`AC10` |
| `api/tests/test_nodes.py` (and others) | any test that patches `kind` |
| `web/src/api/schema.ts` | regenerated (`pnpm gen:api`) |
| `web/src/api/client.ts` | `TaskProps`, `ChecklistItem`, `TaskStatus` types, written by hand: `props` is opaque in the OpenAPI document |
| `web/src/map/nodes/taskProps.ts` | new: `taskPropsOf(node)` with defaults, `progressOf`, `STATUS_LABELS`, `allowsChildren(kind)` |
| `web/src/map/nodes/TaskNode.tsx` | new: stripe, progress, 🗑, drag, refused drop |
| `web/src/map/nodes/IdeaNode.tsx` | the task button |
| `web/src/map/nodes/NodeRenderer.tsx` | `task: TaskNode` |
| `web/src/map/nodes/TitleEditor.tsx` | label by kind ("New task title") |
| `web/src/map/nodes/nodeActions.ts` | `createChild(id, kind)` |
| `web/src/map/dropTarget.ts` | `isUsefulTarget` refuses `child` targets whose parent is a leaf kind |
| `web/src/map/nodes/nodeChrome.tsx` | new: the classes, drag wiring and 🗑 that every kind shares |
| `web/src/map/useMapView.ts` | `startCreateChild(parentId, goTo, kind)`, pending node kind, `createNode` sends `kind`, Enter chains the kind, `DetailsChange.props`, optimistic `props` on the canvas |
| `web/src/map/MapPage.tsx` | Shift+Tab; Tab/Space/Enter/double-click no-ops on tasks; `open` guard |
| `web/src/components/DetailsPanel.tsx` | kind-aware label and layout; mounts `StatusControl` and `ChecklistEditor` for tasks |
| `web/src/components/StatusControl.tsx` | new: the segmented radiogroup |
| `web/src/components/ChecklistEditor.tsx` | new: list, add, toggle, edit, remove, HTML5 drag reorder |
| `web/src/components/ShortcutsHelp.tsx` | Shift+Tab entry and wording |
| `web/src/styles.css` | stripe colours, progress, task button, checklist rows, insertion line |
| `web/src/test/fakeApi.ts` | `kind` and `props` on nodes, task defaults, leaf refusal on `/children` and `/move`, `kind` refused on `PATCH` |
| `web/src/tasks.test.tsx` | new, `S4A_FE_AC1`–`AC11` |
| `web/src/taskPanel.test.tsx` | new, `S4A_FE_AC12`–`AC22` |
| `web/src/actions.test.tsx`, `web/src/config.test.ts`, `web/src/move.test.tsx` | `S4A_FE_AC23`, `AC25` and the amended help wording |
| `docs/slices/README.md`, `README.md`, `.agents/memory/architecture.md` | index, features, architecture |

## 9. Traceability

Measured on 2026-11-17, with the slice implemented:

| Suite | Slice 4A test cases | Criteria covered |
|---|---|---|
| Backend (`api/tests/test_tasks.py`) | 37 | `S4A_BE_AC1`–`AC10`, no gaps |
| Frontend (`tasks.test.tsx`, `taskPanel.test.tsx`, `actions.test.tsx`, `config.test.ts`) | 43 | `S4A_FE_AC1`–`AC23` and `AC25`, no gaps |

`S4A_FE_AC24` is manual and was validated by hand on 2026-11-18.

Whole-repo totals after the slice: **213 backend tests** (98.81% line coverage) and **222 frontend
tests** (99.38% line coverage).

```sh
uv run --directory api pytest --collect-only -q | grep -o 'test_S4A_BE_AC[0-9]*' | sort -u
pnpm --dir web exec vitest list | grep -o 'S4A_FE_AC[0-9]*' | sort -u
```

## 10. Known gaps

- **Whole-props saves.** Two tabs editing different items of the same task collide as `409`. A
  per-item endpoint or a merge would fix it; not needed for one person on one map.
- **Colour and progress only on the canvas.** The status word is only in the panel, by decision.
  The stripe's accessible label covers screen readers but not colour-blind sighted users; a shape
  or icon per status is a candidate for the design slice.
- **No keyboard reorder** of checklist items.
- **No bulk operations** on checklists (clear done, check all).
- **Tasks have no dates, owners or priority.** Later slices in the series.

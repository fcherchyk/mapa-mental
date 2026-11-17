# Slice 3 — Node details: description and side panel

**Status:** delivered. The criteria amended while building are marked in place; section 7 lists the
earlier criteria this slice changed.

Builds on [slice 1](slice-1-mvp.md) and [slice 2](slice-2-move-and-reorder.md). Criteria ids follow
the convention in [README.md](README.md): `S3_BE_AC<n>` for the backend suite and `S3_FE_AC<n>` for
the frontend suite.

---

## 1. Context

Today a node is a short title (at most 200 characters), and nothing else. Any detail about an idea
has to be squeezed into the title or kept somewhere else. Renaming happens on the canvas: F2 or the
pencil button turns the node's label into an inline text field.

This slice gives every node a **description** and moves editing out of the canvas into a
**details panel** on the right. The panel opens when a node is selected and is already in edit
mode. The canvas goes back to being a map: it shows titles only and loses the pencil.

### What already exists

- `PATCH /api/nodes/{id}` edits `title`, `collapsed`, `sort_key`, `kind` and `props`, with optimistic
  version control (`version`, `409` when it does not match).
- `NodeOut` is the node's shape in every response, and `WindowNode` (in `GET /view`) extends it.
- In the SPA, `selectedId` already moves with clicks and arrows, and `editingId` marks the node whose
  `TitleEditor` is open inline.
- `S1_FE_AC20` returns focus to the map after an edit, so the shortcuts keep working.

### What is missing

- A place to store the description, and a way to read a single node by id: there is no
  `GET /api/nodes/{id}` today.
- Any UI beyond the canvas, the header and the dialogs.

## 2. Scope

### Included

- **A `description` column** on `nodes`: plain text, optional, up to **1000 characters**.
- **`GET /api/nodes/{id}`**, which returns a single node with its description.
- **`PATCH /api/nodes/{id}` accepts `description`**, with the same version control as the title.
- **A details panel** on the right. It shows the selected node's title and description, already
  editable, follows the selection, and saves on blur or when the selection changes.
- **The pencil button goes away.** F2 now moves focus to the title field in the panel.
- **Inline creation stays.** Tab, "+" and Enter (while creating) work as today.

### Explicitly out

- Markdown, rich text, links or attachments in the description. The roadmap's Google Docs linking
  covers longer content.
- Any sign on the canvas that a node has a description.
- Resizing, docking or collapsing the panel, and any layout for small screens or mobile.
- Editing several nodes at once.
- Actions in the panel (delete, move, collapse). The panel is strictly title + description.
- Showing what another tab changed. A conflict behaves as it does today.
- The Drive document node, the Google Picker and incremental `drive.file`, which move to slice 4.

## 3. Decisions

**D1 — The description is a real column, not part of `props`.**
`nodes.description TEXT NOT NULL DEFAULT ''`, added by an Alembic migration. `props` is per-kind
data validated by each kind's schema (ADR 0013). A description applies to every kind, including
future Drive or calendar nodes, so it sits next to `title`. Existing rows get `''`.

**D2 — The description is read on demand, not shipped with the window.**
`NodeOut` and `WindowNode` do **not** gain a `description` field, so `GET /view` stays as light as
it is. A new `NodeDetail` (`NodeOut` + `description`) is returned by `GET /api/nodes/{id}` and by
`PATCH /api/nodes/{id}`. The SPA asks for the detail when a node is selected and keeps it in a
cache by id. The cache is refreshed by every successful `PATCH` of that node and dropped when the
node is deleted.

**D3 — Empty is the only "no description".**
The API never returns `null`. A missing description is `""`. Sending `""` clears it. Unlike the
title, the description is **not trimmed**, because line breaks and indentation are the user's.
Whitespace-only text is stored as sent.

**D4 — Save on blur or when the selection changes, one field at a time.**
There is no Save button and no debounce. A field is saved when it loses focus with a value
different from the last saved one. A change of selection blurs the field, so it also saves. Each
save is one `PATCH` carrying only the changed field and the latest known `version`. Saves to the
same node are **serialized**: a second save waits for the first answer and uses the `version` it
returned, so editing the title and then the description never produces a self-inflicted `409`.

**D5 — Keys inside the panel.**
- **Title field.** Enter saves and returns focus to the map. Escape restores the last saved title
  and returns focus to the map. Enter never creates a sibling here: that only happens during inline
  creation (`S1_FE_AC11`).
- **Description field.** Enter inserts a line break. Escape restores the last saved description and
  returns focus to the map.
- While either field has focus, the map shortcuts (Tab, Delete, Space, arrows, Backspace, F2,
  `Alt`+arrows) do not run. Tab moves between the fields as browser focus normally does.

**D6 — Selecting a node does not steal focus.**
When a node is selected by click or arrow, the panel opens or updates but the keyboard focus
**stays on the map**, so the arrows keep moving the selection and the panel follows it. Focus goes
into the panel only with a click on a field or with F2.

**D7 — When the panel is open.**
The panel is drawn only while a node is selected. It sits to the right of the canvas and the canvas
shrinks to make room. It does not overlay the canvas, so the selected node is never hidden under
it. The selection, and with it the panel, is cleared by Escape on the map (when nothing is being
dragged or edited) and by a click on the empty canvas. *This is new behaviour: today the selection
can only move, never clear.*

**D8 — Inline creation is unchanged, and the panel stays out of its way.**
Creating is a fast, creative flow: Tab, "+" and Enter-while-creating still open the inline
`TitleEditor` on the canvas, as in slice 1. Confirming a title with Enter creates the node and opens
the next sibling inline right away, so a whole branch can be typed without stopping. Details come
later, one node at a time. While any node is being created inline (still `pending` or
`editingId`), the panel is **not drawn** and never takes focus. The chain ends when the user presses
Escape on the empty sibling, or confirms by blurring instead of pressing Enter. Then the
selection lands on the last created node (as in slice 1), the panel reappears showing it with an
empty description, and focus stays on the map.

**D9 — The root can be edited but not deleted.**
The real root appears in the panel like any other node, with title and description editable. The
panel offers no delete in any case, and the root keeps its slice 1 protection against Delete and 🗑.

## 4. API changes

```http
GET /api/nodes/{id}
→ 200 NodeDetail

PATCH /api/nodes/{id}
X-CSRF: 1

{ "description": "Line one\nLine two", "version": 7 }
→ 200 NodeDetail
```

`NodeDetail` is `NodeOut` plus `description: string`. `title` and `description` may be sent
together or separately in a `PATCH`. A `PATCH` that changes neither field leaves `version` as it is
(the same rule as `S2_BE_AC10`).

## 5. Acceptance criteria — backend (`S3_BE_*`)

**S3_BE_AC1 — Migration.**
Given a database at the previous revision with existing nodes, when the migration runs, then
`nodes.description` exists, is `NOT NULL`, and every existing row has `''`. The downgrade drops the
column.
→ `test_S3_BE_AC1_*` in `api/tests/test_description.py`

**S3_BE_AC2 — New nodes start empty.**
When a node is created (first login root, or `POST /children`), then its description is `""`.
`POST /children` does not accept `description`: an unknown field answers `422`.
→ `test_S3_BE_AC2_*` in `api/tests/test_description.py`

**S3_BE_AC3 — Read one node.**
Given a node N of the caller's map, when `GET /api/nodes/{N}` is called, then the answer is `200`
with `NodeDetail`: every `NodeOut` field with the same values `view` reports, plus `description`.
→ `test_S3_BE_AC3_*` in `api/tests/test_description.py`

**S3_BE_AC4 — The window stays light.**
When `GET /api/nodes/{id}/view` is called, then neither `focus`, `ancestors` nor `nodes` carry a
`description` field.
→ `test_S3_BE_AC4_*` in `api/tests/test_description.py`

**S3_BE_AC5 — Edit the description.**
Given N with `version = v`, when `PATCH` is sent with `{description, version: v}`, then the answer is
`200` with `NodeDetail`, the new description exactly as sent (not trimmed, line breaks kept) and
`version = v+1`. The next `GET /api/nodes/{N}` returns the same text. Sending `""` clears it.
→ `test_S3_BE_AC5_*` in `api/tests/test_description.py`

**S3_BE_AC6 — Length limit.**
A description of exactly 1000 characters is accepted. One of 1001 characters answers `422` and
nothing changes. `null` answers `422`.
→ `test_S3_BE_AC6_*` in `api/tests/test_description.py`

**S3_BE_AC7 — Title and description together.**
Given N with `version = v`, when `PATCH` carries both `title` and `description`, then both change and
`version = v+1`, a single increment. An empty or whitespace-only title still answers `422`, and then
the description does not change either.
→ `test_S3_BE_AC7_*` in `api/tests/test_description.py`

**S3_BE_AC8 — Version.**
Given N with `version = v`, when a `PATCH` with `description` arrives with `version` other than `v`,
then the answer is `409` and the description does not change. A `PATCH` whose `description` equals
the stored one answers `200` without incrementing `version`.
→ `test_S3_BE_AC8_*` in `api/tests/test_description.py`

**S3_BE_AC9 — The root is editable.**
Given the map's real root, when its title and description are patched, then the answer is `200` and
both change.
→ `test_S3_BE_AC9_*` in `api/tests/test_description.py`

**S3_BE_AC10 — Isolation and CSRF.**
Given users A and B, when A calls `GET` or `PATCH` on a node of B's map, then the answer is `404`
and nothing changes. A missing id answers `404`, and a malformed one answers `422`. A `PATCH`
without `X-CSRF: 1` answers `403`. `GET` without a session answers `401`.
→ `test_S3_BE_AC10_*` in `api/tests/test_description.py`

## 6. Acceptance criteria — frontend (`S3_FE_*`)

### The panel

**S3_FE_AC1 — The panel opens with the selection.**
With no node selected, no panel is drawn. When a node is selected by click, then the panel appears
on the right with a "Title" field and a "Description" field (both with accessible labels), filled
with the node's values from `GET /api/nodes/{id}`. While that request is in flight, the title (known
from the window) is shown and the description field is disabled.
→ `S3_FE_AC1:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC2 — The panel follows the selection.**
Given the panel open on A, when the arrows move the selection to B, then the panel shows B, and
keyboard focus is still on the map (decision D6). Returning to A does not call `GET` again: the
detail comes from the cache.
→ `S3_FE_AC2:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC3 — The panel closes.**
Given the panel open, when Escape is pressed on the map or the empty canvas is clicked, then the
selection is cleared and the panel is no longer drawn. Escape during a drag still only cancels the
drag (`S2_FE_AC10`).
→ `S3_FE_AC3:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC4 — Load failure.**
Given `GET /api/nodes/{id}` answers `404` or `5xx`, when the panel opens, then it shows an error
message with a "Retry" button. The title field stays editable and the description field stays
disabled.
→ `S3_FE_AC4:` in `web/src/detailsPanel.test.tsx`

### Editing in the panel

**S3_FE_AC5 — Saving the title.**
Given the panel on N with `version = v`, when the title is changed and the field loses focus (or
Enter is pressed), then `PATCH /api/nodes/{N}` is sent with `{title, version: v}`. The canvas label
updates immediately (optimistic), and N takes the returned version. Leading and trailing spaces are
trimmed. If the value is unchanged, nothing is sent.
→ `S3_FE_AC5:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC6 — Empty title is refused.**
Given the title field emptied (or whitespace only), when it loses focus or Enter is pressed, then no
request is sent, the field shows an inline error ("Title can't be empty") and restores the last
saved title.
→ `S3_FE_AC6:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC7 — Saving the description.**
Given the panel on N, when the description is changed and the field loses focus, then `PATCH` is
sent with `{description, version}` and the text exactly as typed, line breaks included. Enter in the
description inserts a line break and sends nothing. If the value is unchanged, nothing is sent.
→ `S3_FE_AC7:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC8 — Length limit in the field.**
The description field does not accept more than 1000 characters and shows a counter
(`<n> / 1000`).
→ `S3_FE_AC8:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC9 — Changing selection saves.**
Given an unsaved change in either field of node A, when the canvas selection changes to B (click or
arrows after leaving the field), then A's change is sent with A's id and version, and the panel
shows B. The save is not lost or sent against B.
→ `S3_FE_AC9:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC10 — Saves to the same node are serialized.**
Given a title save in flight for N, when the description is then saved, then the second `PATCH` is
sent only after the first one answers, with the `version` the first answer returned (decision D4).
→ `S3_FE_AC10:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC11 — Failure rolls back.**
Given a save that answers `409`, `422` or `5xx`, then the field (and the canvas label, for the title)
returns to the last saved value, a notice is shown and the window and the detail are read from the
server again, as `S1_FE_AC12` does today.
→ `S3_FE_AC11:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC12 — Escape discards.**
Given an unsaved change in a panel field, when Escape is pressed in that field, then the field
returns to the last saved value, nothing is sent and focus returns to the map container. The panel
stays open on the same node.
→ `S3_FE_AC12:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC13 — Map shortcuts are off while typing.**
While a panel field has focus, Tab, Delete, Backspace, Space, the arrows, F2 and `Alt`+arrows act on
the text (or move focus, for Tab) and never on the map: nothing is created, deleted, collapsed,
moved or navigated.
→ `S3_FE_AC13:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC14 — Focus returns to the map after the title.**
After Enter or Escape in the title field, or Escape in the description, `document.activeElement` is
the map container, so Tab creates a child, F2 goes back to the title, and Space collapses. This
replaces `S1_FE_AC20` (see below).
→ `S3_FE_AC14:` in `web/src/detailsPanel.test.tsx`

### F2, the pencil and creation

**S3_FE_AC15 — F2 goes to the panel.**
Given a selected node, when F2 is pressed on the map, then the panel's title field gets focus with
its text selected. No inline editor opens on the canvas.
→ `S3_FE_AC15:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC16 — No pencil.**
No node on the canvas draws a pencil or rename button, on hover, selection or focus. "+" and 🗑
keep their slice 1 behaviour.
→ `S3_FE_AC16:` in `web/src/actions.test.tsx`

**S3_FE_AC17 — Inline creation keeps its flow and then hands over to the panel.**
Given Tab (or "+") on a selected node, while the inline title is open the panel is not drawn. Then
Enter confirms (`POST /children`, as in `S1_FE_AC11`) and opens the next sibling inline, still
without the panel and without moving focus out of the inline editor. When the chain ends with
Escape on the empty sibling, the last created node is selected, the panel shows it with an empty
description **without** a `GET` (the creation answer is enough), and focus is on the map.
→ `S3_FE_AC17:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC18 — The root in the panel.**
Given the real root selected, then the panel shows its title and description, both editable and
saved like any other node's. The panel offers no delete for any node.
→ `S3_FE_AC18:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC19 — Deleting the selected node.**
Given the panel open on N, when N is deleted (Delete or 🗑), then N's detail is dropped from the
cache and the panel moves on to the selection that follows the delete (the same node slice 1
selects). Any unsaved change in N's fields is discarded without a request.
*Amended while building: this said "the panel closes", but a delete always leaves another node
selected, so the panel follows it.* In a real browser, clicking 🗑 blurs the field first, so a
change typed just before is saved and then deleted along with the node, which is harmless.
→ `S3_FE_AC19:` in `web/src/detailsPanel.test.tsx`

**S3_FE_AC20 — The shortcuts panel.**
The "?" panel describes F2 as "Edit the selected idea in the details panel." and lists Escape as
"Clear the selection and close the details panel." The Enter entry now speaks of creating an idea
instead of editing a title. This amends `S1_FE_AC22` and `S2_FE_AC17`.
→ `S3_FE_AC20:` in `web/src/actions.test.tsx`

**S3_FE_AC21 — Manual validation.**
With the app running, selecting nodes with the mouse and arrows shows their details on the right
without hiding the selected node. Editing the title and description saves on blur and on selection
change, and a reload shows the saved text.
→ Manual, by hand.

**S3_FE_AC22 — Coverage.**
`pnpm --dir web exec vitest run --coverage` still meets the 80% line threshold.
→ `S3_FE_AC22:` in `web/src/config.test.ts`

## 7. Criteria amended in earlier slices

| Criterion | Change |
|---|---|
| `S1_FE_AC12` — Rename | Renaming happens in the panel. F2 focuses the panel's title field. The pencil is gone. The `PATCH` contract is unchanged. |
| `S1_FE_AC20` — Shortcuts after the pencil | Superseded by `S3_FE_AC14`. The test is removed or rewritten against the panel. |
| `S1_FE_AC21` — Shortcuts after the "+" | F2 now focuses the panel instead of opening the inline editor. |
| `S1_FE_AC11` — Create | Enter chains siblings only during an inline creation. The test that started from F2 on an existing node now starts from Tab. The inline editor's accessible label is "New idea title", so it is never confused with the panel's "Title". |
| `S1_FE_AC18` — "+" while editing | Checked on a node being created, the only node edited on the canvas. |
| `S1_FE_AC22`, `S2_FE_AC17` — Shortcuts panel | New wording for F2 and Enter, and the new Escape entry (`S3_FE_AC20`). |
| `S1_BE_AC23` — Migrations immutable | It required a single migration file. It now requires `0001` to be unchanged and the migrations to form one linear chain from it. Already amended in `slice-1-mvp.md`. |
| README "Features" | Pencil references removed. Description and details panel added. |

## 8. Changes by file

| File | Change |
|---|---|
| `api/migrations/versions/0002_node_description.py` | new: `description TEXT NOT NULL DEFAULT ''` |
| `api/app/models.py` | `Node.description` |
| `api/app/nodes/schemas.py` | `DESCRIPTION_MAX_LENGTH = 1000`, `description` on `NodePatch`, `NodeDetail` |
| `api/app/nodes/service.py` | `get_node`, and the description in `update_node` |
| `api/app/nodes/router.py` | `GET /nodes/{id}`. `PATCH` answers `NodeDetail` |
| `api/tests/test_description.py` | new, `S3_BE_AC1`–`AC10` |
| `web/src/api/schema.ts` | regenerated (`pnpm gen:api`) |
| `web/src/api/client.ts` | `getNode`, `NodeDetail`, `description` on the patch |
| `web/src/map/detailCache.ts` | new: detail cache by id |
| `web/src/map/useMapView.ts` | selection clearing, serialized saves per node, detail refresh |
| `web/src/components/DetailsPanel.tsx` | new: the panel, its fields, keys and error states |
| `web/src/map/MapPage.tsx` | layout with the panel, F2 → panel, Escape / empty-canvas click clear the selection |
| `web/src/map/nodes/IdeaNode.tsx`, `nodeActions.ts` | pencil removed. Inline `TitleEditor` only for creation |
| `web/src/components/ShortcutsHelp.tsx` | F2 and Escape wording |
| `web/src/styles.css` | panel layout |
| `web/src/test/fakeApi.ts` | `GET /nodes/{id}` and `description` on `PATCH` |
| `web/src/detailsPanel.test.tsx` | new, `S3_FE_AC1`–`AC19` |
| `web/src/actions.test.tsx`, `web/src/editing.test.tsx` | `S3_FE_AC16`, `AC20` and the amended slice 1 tests |
| `web/src/map/nodes/TitleEditor.tsx` and its test, `web/src/navigation.test.tsx` | the "New idea title" label; a fixture gained the new field |
| `api/tests/test_translation.py` | `S1_BE_AC23` amended: a linear migration chain instead of a single file |
| `docs/slices/slice-1-mvp.md`, `slice-2-move-and-reorder.md` | the amendments of section 7 |
| `docs/slices/README.md`, `README.md` | index, features, roadmap line |

## 9. Traceability

Measured on 2026-11-17, with the slice delivered:

| Suite | Slice 3 test cases | Criteria covered |
|---|---|---|
| Backend (`api/tests/test_description.py`) | 23 | `S3_BE_AC1`–`AC10`, no gaps |
| Frontend (`detailsPanel.test.tsx`, `actions.test.tsx`, `config.test.ts`) | 25 | `S3_FE_AC1`–`AC20` and `AC22`, no gaps |

`S3_FE_AC21` is the only criterion with no automated test: the manual pass over the real canvas,
done on 2026-11-17.

Whole-repo totals after the slice: **176 backend tests** (98.61% line coverage) and **179 frontend
tests** (99.53%).

```sh
uv run --directory api pytest --collect-only -q | grep -o 'test_S3_BE_AC[0-9]*' | sort -u
pnpm --dir web exec vitest list | grep -o 'S3_FE_AC[0-9]*' | sort -u
```

## 10. Known gaps

- **No sign on the canvas** that a node has a description. You have to select it to find out.
- **1000 characters** is a deliberate limit. Longer content waits for Google Docs linking.
- **A blur that never happens.** If the tab is closed or reloaded while a field has unsaved text,
  that text is lost. There is no `beforeunload` save.
- **Concurrency between two tabs** behaves as in slice 1: the second save gets a `409`, rolls back
  and re-reads.
- **The panel takes width from the canvas.** On narrow windows the map gets cramped until the
  mobile-friendly view.

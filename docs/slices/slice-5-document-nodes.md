# Slice 5 — Document nodes: Markdown body with a plain and a rich editor

**Status:** delivered. Validated by hand in three rounds on 2026-11-20 (`S5_FE_AC23`).

Builds on [slice 1](slice-1-mvp.md) to [slice 4B](slice-4b-kanban-board.md). Criteria ids follow
the convention in [README.md](README.md): `S5_BE_AC<n>` for the backend suite and `S5_FE_AC<n>`
for the frontend suite.

This slice adds the third node kind, `document`: a node with a title and a Markdown body instead
of a description. It is edited in the details panel as raw Markdown or as rich text, it cannot have
children, and it is drawn on the canvas as a page. Since every kind now has a way to be created,
the "+" of an idea becomes a small menu to choose the kind.

---

## 1. Context

Slice 4A built the machinery for kinds (ADR 0013): `nodes.kind`, per-kind `props` validated in
`app/node_types`, a per-kind `allows_children` flag, a canvas component per kind and a panel that
adapts to the kind. A document reuses all of it. What a document adds is a **long text**, which
neither the window (`props` travel with every `GET /view`) nor the description column (1000
characters) can carry.

### What already exists

- `NODE_TYPES` with `allows_children`; leaf rules in `POST /children` and `POST /move`.
- `NodeDetail`, read on demand by the panel (slice 3, D2), and the detail cache in the SPA.
- `NodeRenderer` with a component per kind; `allowsChildren(kind)` used by every leaf check of the
  SPA (`dropTarget`, `startCreateChild`, `open`).
- The panel's serialized save queue (slice 3, D4) and optimistic rollback.

### What is missing

- A `document` kind and a place to store its body.
- An editor for Markdown, plain and rich.
- A way to create a document. Two create buttons per idea already crowd the node; a third would
  not scale to the kinds on the roadmap.

## 2. Scope

### Included

- **`kind = "document"`**, a leaf, with `props = {}`.
- **The body in its own table** (`node_documents`), up to 100,000 characters of raw Markdown, read
  on demand with `GET /nodes/{id}` and saved with `PATCH /nodes/{id}`.
- **The kind menu**: "+" on an idea, or Shift+Tab, opens a menu with Idea, Task and Document;
  1, 2 and 3 choose. Tab still creates an idea directly. The task button of slice 4A is removed.
- **`DocumentNode`** on the canvas: the size of an idea, drawn as a page with a folded corner and
  a page icon.
- **Document panel**: title, a "Plain text | Rich text" switch, the editor, a counter, a save
  status and an "Expand editor" button that makes the panel cover the map.
- **Saving**: on blur, after two idle seconds, and when the panel goes away; a warning before
  closing the tab with unsaved text; conflicts keep the draft and offer Overwrite or Discard.
- **Shortcuts help** updated, with a new "Document" group.
- **ADR 0014**: TipTap as the rich text editor.

### Explicitly out

- Exporting or downloading a document as a `.md` file; importing one by dropping it on the map.
- Version history, search, and converting an idea into a document (kinds stay immutable).
- Images, tables and raw HTML in documents.
- A preview of the body on the canvas.
- Collaborative editing or merging two tabs' edits.

## 3. Decisions

**D1 — Kind `document`, a leaf.**
`NODE_TYPES` gains `document` with `DocumentProps` (no keys, `extra="forbid"`),
`allows_children=False` and `has_content=True`. Every leaf rule of slice 4A applies: no child, no
move into it, no focus, no "+", no "+k", deleted without the dialog.

**D2 — The body lives in a separate table.**
Migration `0004` creates `node_documents(node_id PK → nodes.id ON DELETE CASCADE, content TEXT NOT
NULL DEFAULT '')`. The row is created with the node, in the same transaction, and goes away with it
through the cascade, also when an ancestor is deleted. The window queries never touch it. The body
is raw Markdown, **stored exactly as sent** (not trimmed, like the description), up to **100,000**
characters.

**D3 — Content instead of description, read on demand.**
`NodeDetail` gains `content: str`, which is `""` for ideas and tasks. `NodeOut`, `WindowNode` and
`GET /view` do not change. `PATCH` accepts `content` only for a document (`422` "only a document has
content" otherwise) and refuses `description` on a document (`422` "a document has no
description"). `null` is refused as for the description. A real change bumps the node's `version`
like any edit; the same content answers `200` without bumping it; a `PATCH` with title and content
bumps it once. `POST /children` takes no `content`: a document is born empty.

**D4 — Two modes, Markdown always.**
The draft is always a Markdown string. **Plain text** is a monospace textarea with the raw source.
**Rich text** is TipTap (ADR 0014) with a toolbar and the extensions' Markdown typing shortcuts
(`# `, `- `, `1. `, `[ ] `, `> `, three backticks, `---`, `**bold**`, `*italic*`, `~~strike~~`,
`` `code` ``). Supported formats: headings 1–3, bold, italic, strikethrough, inline code, code
blocks, bullet, numbered and checkbox lists, blockquotes, links and horizontal rules. Saving from
rich mode may **reformat** the Markdown (list markers, spacing, a trailing blank line) as long as
its meaning is kept; anything outside the supported formats, such as raw HTML, is dropped. Opening
a document in rich mode and moving around in it never rewrites it: until the text really changes,
the editor reports the content it loaded. The last mode used is remembered **per browser**
(`localStorage`, key `mindmap.documentEditorMode`); the default is rich. The rich editor is loaded
lazily, in its own bundle chunk.

**D5 — Saving long text.**
The body saves when the editor loses focus, **two seconds after the last change**, when Escape
leaves the editor, and when the panel goes away (another selection, a new focus, an inline
creation). Text typed while a save is in flight is saved right after it. While there is unsaved
text, closing or reloading the tab asks the browser to confirm. Saves go through the same queue as
every other edit (slice 3, D4), each with the version the previous one returned. Unlike the other
fields, **a failure never rolls the editor back**:

- `409`: the draft stays, a notice says "This document changed elsewhere. Your text is kept here."
  and offers **Overwrite** (read the node again and send the draft with its new version) or
  **Discard mine and reload** (read the node again and show its text). Until one is chosen, nothing
  else is saved.
- Any other failure: the draft stays, "Could not save the document." with **Retry**. The next
  change also retries.
- A save started when the panel was already gone reports a failure as a map notice.

**D6 — The panel is wider for documents, and can cover the map.**
For a document the panel is 36rem wide. "Expand editor" makes it cover the whole map area;
"Collapse editor" or Escape in the editor brings it back. The expanded state belongs to one node.

**D7 — Canvas.**
`DocumentNode` has the footprint of an idea (200 × 44), a lined background, a folded top-right
corner and a 📄 icon labelled "Document", then the title and 🗑. The body is never drawn on the
canvas. A document can be dragged like any node.

**D8 — The kind menu.**
Every idea has one "+" (accessible label "Add inside <title>", `aria-haspopup="menu"`). Clicking it,
or Shift+Tab with the map focused and an idea selected, selects the idea and opens a `role="menu"`
labelled "What to add inside <title>" with three `menuitem`s: **1 Idea**, **2 Task**, **3
Document**. The first entry takes the focus. The number keys choose, ↑ and ↓ move (wrapping), Enter
or a click chooses; Escape or Tab closes it and gives the keyboard back to the map; a second click
on "+", another selection or a blur out of the menu closes it. While the menu is open the map
also answers 1–3 and Escape, wherever the focus is, so the keys work even if the focus never reached
the menu (*found in manual validation*: in the browser it sometimes did not). Choosing runs the creation of slices
1 and 4A for that kind, including the border and collapsed rules. **Tab still creates an idea
directly.** Shift+Tab on a task or a document does nothing. The "☑" task button of slice 4A is
removed.

**D9 — A new document opens its editor.**
Confirming a new document's title with **Enter** does not chain a sibling (ideas and tasks still
do): once the API answers, the document is selected, the panel opens and the editor takes the
focus, in either mode. Leaving the title by blur creates the document without taking the focus.

**D10 — Nothing runs from a document.**
ProseMirror only renders the nodes of the schema, so raw HTML never reaches the page. Links must
be absolute `http://`, `https://` or `mailto:` addresses: the Link button refuses anything else
with "Links must start with https://, http:// or mailto:", and a `javascript:` link read from the
Markdown is drawn without its address.

**D11 — Escape never discards a document.**
In the editor, Escape collapses the expanded panel (keeping the focus); otherwise it saves and
gives the keyboard back to the map. The panel's title keeps the slice 3 rules.

*Decisions D12 to D14 come from the manual validation of 2026-11-20.*

**D12 — Tab writes in the editor.**
In plain text, Tab inserts a tab character at the cursor (keeping the browser's undo history). In
rich text, Tab nests a list item and Shift+Tab lifts it; in a code block or in the middle of a line
Tab inserts a tab; at the start of a line it inserts an **em space** (U+2003), because a tab or
four spaces at the start of a Markdown line turn the paragraph into a code block the next time the
document is read. Elsewhere Shift+Tab does nothing. The keyboard leaves the editor with Escape
(D11). Tabs are drawn four columns wide.

**D13 — Toolbar tooltips.**
Each toolbar button shows a tooltip on hover and on keyboard focus, after a short delay: its name,
its keyboard shortcut written for the platform (⌘⇧8 on a Mac, Ctrl+Shift+8 elsewhere) and the
Markdown that does the same (for example "Bold — ⌘B, or type \*\*text\*\*"). The tooltip is the
button's accessible description.

**D14 — Help wording and closing.**
The help says "Only ideas can have child nodes." where it used to say that tasks and documents
"can't contain anything" (a document has content). The help panel also closes on a press anywhere
outside it and its "?" button, leaving the focus where the press put it.

**D15 — The help panel has one tab per section** *(second round of manual validation)*.
The panel is twice as wide (44rem at most) and shows Map, Board and Document as tabs
(`role="tablist"`) instead of three stacked groups. It opens on the tab of the view the user is
in: Board on the board, Document on the map while a document's panel is open, Map otherwise; every
opening starts there again. The arrows move between tabs, wrapping, and select as they move.

## 4. API changes

```http
POST /api/nodes/{parent}/children
{ "title": "Meeting notes", "kind": "document" }
→ 201 NodeOut   props = {}

GET /api/nodes/{document}
→ 200 NodeDetail   { …NodeOut, "description": "", "content": "# Agenda\n…", "path": […] }

PATCH /api/nodes/{document}
{ "content": "# Agenda\n\n- budget\n", "version": 3 }
→ 200 NodeDetail   version = 4

PATCH /api/nodes/{idea}      { "content": "x", "version": 1 }       → 422 "only a document has content"
PATCH /api/nodes/{document}  { "description": "x", "version": 1 }   → 422 "a document has no description"
PATCH /api/nodes/{document}  { "content": <100,001 chars>, … }       → 422
POST  /api/nodes/{document}/children                                 → 422 "a document cannot have children"
POST  /api/nodes/{x}/move  { parent_id: <document>, … }              → 422
```

`GET /view` and `GET /board` do not change; documents never appear on a board.

## 5. Acceptance criteria — backend (`S5_BE_*`)

**S5_BE_AC1 — Migration.**
`0004` creates `node_documents` with `node_id` and `content` (`NOT NULL`), and a foreign key to
`nodes` with `ON DELETE CASCADE`; downgrading to `0003` drops it.
→ `test_S5_BE_AC1_*` in `api/tests/test_documents.py`

**S5_BE_AC2 — Create a document.**
`POST /children` with `kind: "document"` answers `201` with `props = {}` and `child_count = 0`; its
detail has `content = ""` and a `node_documents` row exists. `GET /view` carries the kind but never
`content`. Ideas, tasks and the root have `content = ""` in their detail and no row.
→ `test_S5_BE_AC2_*`

**S5_BE_AC3 — What creation refuses.**
`props` with any key, a `content` field and a `board_place` each answer `422` and create nothing.
→ `test_S5_BE_AC3_*`

**S5_BE_AC4 — Edit the content.**
`PATCH {content, version}` stores the text exactly (line breaks and indentation kept), answers it in
`NodeDetail` and bumps `version`; the same content does not bump it; `""` clears it; title and
content in one `PATCH` bump it once; patching the title alone keeps the content.
→ `test_S5_BE_AC4_*`

**S5_BE_AC5 — Limits.**
Exactly 100,000 characters are accepted. 100,001 characters, `null` or a non-string answer `422`,
and neither content nor title change.
→ `test_S5_BE_AC5_*`

**S5_BE_AC6 — Content belongs to documents.**
`content` on an idea or a task, `description` on a document and any key in a document's `props`
answer `422`, and nothing changes.
→ `test_S5_BE_AC6_*`

**S5_BE_AC7 — A document cannot have children.**
`POST /children` under a document and `POST /move` into a document answer `422`; nothing changes.
→ `test_S5_BE_AC7_*`

**S5_BE_AC8 — Moves, deletes and the board.**
A document moves and keeps its content. Deleting it, or an ancestor, removes its body row. Documents
do not appear on `GET /board`.
→ `test_S5_BE_AC8_*`

**S5_BE_AC9 — Version and isolation.**
A stale `version` answers `409` and changes nothing; another user's document answers `404` to `GET`
and `PATCH`.
→ `test_S5_BE_AC9_*`

## 6. Acceptance criteria — frontend (`S5_FE_*`)

### The kind menu

**S5_FE_AC1 — "+" opens the kind menu.**
Clicking "+" on an idea selects it and opens the menu "What to add inside <title>" with Idea, Task
and Document, numbered 1–3 (`aria-keyshortcuts` and a visible `kbd`), the first entry focused and
"+" `aria-expanded="true"`. A second click closes it and focuses the map. Tasks and documents have
no "+".
→ `S5_FE_AC1:` in `web/src/documents.test.tsx`

**S5_FE_AC2 — Shift+Tab and the numbers.**
With an idea selected, Shift+Tab opens the menu; 1, 2 and 3 open "New idea title", "New task
title" and "New document title" and the creation posts no kind, `task` or `document`. If the focus
did not reach the menu, 3 and Escape still work from the map. Shift+Tab on a task or a document
opens nothing.
→ `S5_FE_AC2:`

**S5_FE_AC3 — Closing and moving in the menu.**
Escape closes it without creating and focuses the map, keeping the selection; Tab closes it too;
selecting another node closes it; ↑ and ↓ move between entries, wrapping, and Enter chooses; a
double click inside the menu does not focus the idea.
→ `S5_FE_AC3:`

### Creating documents

**S5_FE_AC4 — Creating a document.**
Choosing Document opens "New document title" (the panel stays hidden while it is typed). Enter
posts `{title, kind: "document"}`, opens no sibling, draws the node as a document, opens "Document
details" and focuses the editor, in plain and in rich mode. Leaving the title by blur creates it
without taking the focus. Escape on an empty title creates nothing.
→ `S5_FE_AC4:`

**S5_FE_AC5 — Under a border or collapsed idea.**
The menu's Document on a border idea moves the focus one level toward it first; on a collapsed
idea, it expands it first (`S1_FE_AC26` rules).
→ `S5_FE_AC5:`

### Canvas

**S5_FE_AC6 — A document is drawn as a page.**
The node has the `is-document` class, the 📄 icon labelled "Document", its title and "Delete
<title>", and neither "+" nor "+k". The body is not on the canvas.
→ `S5_FE_AC6:`

**S5_FE_AC7 — A document is a leaf.**
Tab and Space do nothing on it and → keeps the selection; double click and Enter navigate nowhere;
an idea dragged over it shows the refused state and dropping sends nothing; Alt+→ onto it sends
nothing; it can be dragged onto an idea; Delete removes it without the dialog.
→ `S5_FE_AC7:`

### Panel and editor

**S5_FE_AC8 — The document panel.**
Selecting a document opens "Document details" (class `is-document`) with Title, the "Editor mode"
group, "Expand editor", the editor with the body and the counter `<n> / 100,000`, and no
Description. The body comes from `GET /nodes/{id}`. An idea's panel keeps its Description and has
no editor. A failed read shows "Could not load the document." with Retry.
→ `S5_FE_AC8:` in `web/src/documentPanel.test.tsx`

**S5_FE_AC9 — Plain text saves on blur.**
A changed body is sent on blur as `{content, version}` exactly as typed, and the status reads
"Saved". An unchanged body sends nothing. The textarea takes at most 100,000 characters.
→ `S5_FE_AC9:`

**S5_FE_AC10 — Autosave.**
Two seconds after the last change the body saves once ("Unsaved changes" until then); typing
restarts the wait; the focus stays in the editor. Text typed while a save is in flight is saved
right after it, with the version the first one returned.
→ `S5_FE_AC10:`

**S5_FE_AC11 — Leaving the panel saves.**
Selecting another node with unsaved text saves it. If that save fails, the map shows "The document
changed elsewhere: your last changes to it were not saved." (or "Could not save your last changes
to the document."). Deleting the document does not try to save it.
→ `S5_FE_AC11:`

**S5_FE_AC12 — Closing the tab asks first.**
A `beforeunload` is cancelled while there is unsaved text, and not once it is saved.
→ `S5_FE_AC12:`

**S5_FE_AC13 — A conflict keeps the draft.**
On `409` the draft stays, the conflict notice offers Overwrite and Discard, the map is not
reloaded and nothing is rolled back; until a choice is made nothing else is sent. Overwrite reads
the node and sends the draft with its new version. Discard reads the node, shows its text and
sends nothing; the next edit goes out with the version that was read.
→ `S5_FE_AC13:`

**S5_FE_AC14 — Other failures offer a retry.**
On `5xx` the draft stays and "Could not save the document." offers Retry, which sends it again.
→ `S5_FE_AC14:`

**S5_FE_AC15 — Plain and rich modes.**
Rich is the default and renders the Markdown (headings, lists) with a "Formatting" toolbar; Plain
shows the source in a textarea. The choice is stored in the browser and used for every document.
Switching modes keeps an unsaved draft.
→ `S5_FE_AC15:`

**S5_FE_AC16 — The rich editor.**
The toolbar offers, in order, Heading 1–3, Bold, Italic, Strikethrough, Inline code, Bullet list,
Numbered list, Checklist, Quote, Code block, Link and Horizontal rule. Opening a document and
moving around in it sends nothing. A format applied from the toolbar shows as pressed and is saved
as Markdown. The Link button refuses a `javascript:` address with the D10 message and accepts an
`https://` one. A body over 100,000 characters is not saved and the status says why.
→ `S5_FE_AC16:`

**S5_FE_AC17 — Markdown round trip.**
Each supported format loads into the rich editor and comes out as the same Markdown, and is drawn
with its own element. Raw HTML and `javascript:` addresses are never drawn. `isAllowedLink`
accepts `http(s)://…` and `mailto:…` and refuses `javascript:`, `data:`, relative paths, bare
domains, other protocols and empty strings.
→ `S5_FE_AC17:` in `web/src/components/document/documentMarkdown.test.ts`

**S5_FE_AC18 — Escape never discards.**
Escape in the editor, plain or rich, saves the draft, keeps it in the editor, gives the keyboard
back to the map and keeps the document selected.
→ `S5_FE_AC18:` in `web/src/documentPanel.test.tsx`

**S5_FE_AC19 — The expanded editor.**
"Expand editor" adds `is-expanded` to the panel and becomes "Collapse editor" (`aria-pressed`);
Escape in the editor collapses it and keeps the focus there.
→ `S5_FE_AC19:`

**S5_FE_AC20 — Saves are serialized.**
A body change made while a title save is in flight is sent after it, with the version it
returned.
→ `S5_FE_AC20:`

**S5_FE_AC21 — Map shortcuts are off in the editor.**
Delete, Backspace, Space, the arrows and Alt+arrows typed in the editor never act on the map.
→ `S5_FE_AC21:`

### Help, manual, coverage

**S5_FE_AC22 — The shortcuts panel.**
Shift + Tab reads "With the map focused, opens the menu of what to add inside the selected idea,
as + does: press 1 for an idea, 2 for a task or 3 for a document. Only ideas can have child
nodes." A "Document" group lists Markdown, Tab, Ctrl/⌘ + B, I and Escape. F2, Delete, Enter, Alt
and Double click entries name every kind (see section 7).
→ `S5_FE_AC22:` in `web/src/actions.test.tsx`

**S5_FE_AC23 — Manual validation.**
With the app running: open the kind menu with "+" and with Shift+Tab, choose with the mouse, the
numbers and the arrows; create a document and type straight away; switch modes and reload to see
the mode kept; use every toolbar button and the Markdown shortcuts; expand and collapse; wait for
the autosave; edit in two tabs and resolve the conflict both ways; try to close the tab with
unsaved text; drag an idea onto a document and see it refused; reload and see everything kept.
After the first round (2026-11-20): Shift+Tab then 1/2/3; Tab in both modes and in lists; hover the
toolbar; click outside the help panel. After the second round: open "?" from the map, the board and
with a document selected, and see the right tab chosen; switch tabs by click and arrows.
→ Manual, by hand.

**S5_FE_AC24 — Coverage.**
`pnpm --dir web exec vitest run --coverage` still meets the 80% line threshold.
→ `S5_FE_AC24:` in `web/src/config.test.ts`

**S5_FE_AC25 — A press outside closes the help.**
With the help open, a press on the map closes it, sets "?" `aria-expanded="false"` and does not
move the focus to "?". A press inside the panel keeps it open, and "?" still toggles it.
→ `S5_FE_AC25:` in `web/src/actions.test.tsx`

**S5_FE_AC26 — Toolbar tooltips.**
Every toolbar button is described by a `role="tooltip"` element whose text starts with its name and
carries its keys and Markdown (D13); the keys are written as ⌘⌥⇧ on a Mac and Ctrl+Alt+Shift
elsewhere.
→ `S5_FE_AC26:` in `web/src/documentPanel.test.tsx`

**S5_FE_AC28 — The help has one tab per section.**
The help shows the Map, Board and Document tabs with only the selected tab's list visible; a click
or the arrows (wrapping) switch. It opens on Map on the map, on Board on the board, and on
Document while a document's panel is open; reopening follows the view again.
→ `S5_FE_AC28:` in `web/src/actions.test.tsx`

**S5_FE_AC27 — Tab writes in the editor.**
In plain text Tab inserts a tab at the cursor, Shift+Tab changes nothing, the focus stays and the
tab is saved. In rich text Tab writes a tab mid-line and an em space at the start of a line,
Shift+Tab keeps the focus, and both are saved. In a rich text list Tab nests the item and Shift+Tab
lifts it back, keeping the focus.
→ `S5_FE_AC27:` in `web/src/documentPanel.test.tsx`

## 7. Criteria amended in earlier slices

| Criterion | Change |
|---|---|
| `S1_BE_AC17` — invalid kind | Its example of an unknown kind was `document`; it is now `spreadsheet`. |
| `S3_BE_AC3` — detail fields | `NodeDetail` also carries `content`. |
| `S1_FE_AC17`, `AC18`, `AC19`, `AC21`, `AC24`–`AC27` — the "+" | "+" is labelled "Add inside <title>" and opens the kind menu; the child is created by choosing Idea. A single click on "+" focuses the menu instead of a title field; Enter or Space on "+" opens the menu, and a second Enter or Space creates the idea. |
| `S4A_FE_AC1` — the task button | Replaced by the "Task" entry of the kind menu; a node being created has no "+". |
| `S4A_FE_AC2`–`AC4` — creating tasks | Shift+Tab opens the menu and 2 chooses Task. |
| `S4A_FE_AC5` — nothing inside a task | Shift+Tab on a task opens no menu. |
| `S1_FE_AC22` — closing the help | Besides Escape and a second click on "?", a press outside closes it (`S5_FE_AC25`). |
| `S1_FE_AC22`, `S2_FE_AC17`, `S3_FE_AC20`, `S4B_FE_AC20` — shortcuts panel groups | The three groups became tabs (`S5_FE_AC28`): each list lives in a `tabpanel` and only the selected one is drawn. |
| `S1_FE_AC22`, `S2_FE_AC17`, `S3_FE_AC20`, `S4A_FE_AC23` — shortcuts panel | New Shift + Tab wording; F2 "Edit the selected node's title in the details panel."; Delete, Enter, Alt and Double click name documents; the drag entry says "Drop any node … tasks and documents never do."; Shift + Tab and Alt + → end with "Only ideas can have child nodes." |
| README "Features" | Documents, the kind menu and the document editor added; the task button removed. |

## 8. Changes by file

| File | Change |
|---|---|
| `api/app/node_types/__init__.py` | `DOCUMENT_KIND`, `DocumentProps`, `has_content` flag and helper |
| `api/app/models.py` | `NodeDocument` |
| `api/migrations/versions/0004_node_documents.py` | new table |
| `api/app/nodes/schemas.py` | `CONTENT_MAX_LENGTH`, `NodePatch.content`, `NodeDetail.content`, null refused for both texts |
| `api/app/nodes/service.py` | body row on create, `document_content`, content/description rules, `apply_content` (version bump through `updated_at`, no autoflush) |
| `api/tests/test_documents.py` | new, `S5_BE_AC1`–`AC9` |
| `api/tests/test_nodes.py`, `test_description.py` | amended `S1_BE_AC17`, `S3_BE_AC3` |
| `web/package.json` | `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-list` |
| `web/src/api/schema.ts` | regenerated |
| `web/src/map/nodes/kinds.ts` | new: kind constants, `allowsChildren`, `isDocument`, kind names, `CREATABLE_KINDS` |
| `web/src/map/nodes/KindMenu.tsx` | new: the menu |
| `web/src/map/nodes/DocumentNode.tsx` | new: the page on the canvas |
| `web/src/map/nodes/IdeaNode.tsx`, `NodeRenderer.tsx`, `nodeActions.ts`, `taskProps.ts` | one "+" with the menu; `document` component; menu actions; kinds moved to `kinds.ts` |
| `web/src/map/MapCanvas.tsx`, `MapPage.tsx` | menu state, Shift+Tab, raised `zIndex` for the open menu, document props for the panel |
| `web/src/map/useMapView.ts`, `detailCache.ts` | `saveContent`, `refreshNode`, `editorFocusFor`; Enter on a new document opens the editor; `withoutDetailFields` |
| `web/src/components/DetailsPanel.tsx` | kind-aware label, no description for documents, wide and expanded panel |
| `web/src/components/document/DocumentEditor.tsx` | new: modes, autosave, unload warning, conflict and retry |
| `web/src/components/document/RichDocumentEditor.tsx` | new, lazy: TipTap, toolbar, links |
| `web/src/components/document/documentExtensions.ts`, `documentLimits.ts` | new: the schema; the limit and link rule without TipTap |
| `web/src/components/ShortcutsHelp.tsx` | wording, the "Document" group, closing on an outside press, tabs with a per-view default |
| `web/src/styles.css` | menu, page, wide/expanded panel, editor and toolbar |
| `web/src/test/fakeApi.ts`, `setup.ts`, `renderApp.tsx` | documents and content; in-memory `localStorage` (Node 25 hides jsdom's); empty `Range` measures (ProseMirror scrolls into view); fake-timer option |
| `web/src/documents.test.tsx`, `documentPanel.test.tsx`, `components/document/documentMarkdown.test.ts` | new |
| `web/src/actions.test.tsx`, `tasks.test.tsx`, `move.test.tsx`, `config.test.ts` | amended criteria, `S5_FE_AC22`, `AC24` |
| `docs/`, `README.md`, `.agents/memory/` | this document, index, features, ADR 0014, architecture |

## 9. Traceability

Measured on 2026-11-20, after the fixes from the first manual validation:

| Suite | Slice 5 test cases | Criteria covered |
|---|---|---|
| Backend (`api/tests/test_documents.py`) | 26 | `S5_BE_AC1`–`AC9`, no gaps |
| Frontend (`documents.test.tsx`, `documentPanel.test.tsx`, `documentMarkdown.test.ts`, `actions.test.tsx`, `config.test.ts`) | 86 | `S5_FE_AC1`–`AC22` and `AC24`–`AC28`, no gaps |

`S5_FE_AC23` is manual and was validated by hand on 2026-11-20.

Whole-repo totals after the slice: **276 backend tests** (98% line coverage) and **352 frontend
tests** (99% line coverage).

```sh
uv run --directory api pytest --collect-only -q | grep -o 'test_S5_BE_AC[0-9]*' | sort -u
pnpm --dir web exec vitest list | grep -o 'S5_FE_AC[0-9]*' | sort -u
```

## 10. Known gaps

- **Whole-body saves.** Two tabs editing the same document collide as a `409`; the user chooses
  one text. There is no merge.
- **Reformatting in rich mode.** Saving from rich text may change list markers and spacing, and
  drops anything outside the supported formats (D4). Plain mode never reformats.
- **Rich mode in tests.** jsdom cannot type into a contenteditable reliably, so the rich editor is
  driven through TipTap's commands in tests; the Markdown typing shortcuts are TipTap's own and are
  covered by the manual validation.
- **A save in flight when the panel goes away** reports a later failure only if it was the save
  started by leaving; a save that was already in flight and then fails is not reported.
- **Tab and accessibility.** Tab writes in the editor, so keyboard users leave it with Escape; the
  help and the Escape entry say so.
- **Em spaces.** An indent typed at the start of a rich text line is an em space, which shows as
  an invisible character in plain mode.
- **Bundle size.** The rich editor is a separate 477 kB chunk (151 kB gzip), loaded the first time
  a document opens in rich mode.

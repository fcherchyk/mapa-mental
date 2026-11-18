# Slice specifications

A **slice** is a vertical cut of the product: a set of behaviour that is delivered, tested and
usable on its own. Each slice has one document here, which describes **what the product does when
that slice is finished**, written as acceptance criteria that every test can point back to.

These documents describe the *current state* of the product. They are not run logs: the
chronological history of how each slice was built lives in `.agents/memory/specs/` (one spec per
run, in Spanish, kept as history) and in `.agents/log.md`.

## Index

| Slice | Document | Status |
|---|---|---|
| 1 | [slice-1-mvp.md](slice-1-mvp.md) — MVP: Google login, one map, create/edit/navigate/delete ideas | Delivered |
| 2 | [slice-2-move-and-reorder.md](slice-2-move-and-reorder.md) — move and reorder nodes by dragging and with the keyboard | Delivered |
| 3 | [slice-3-node-details.md](slice-3-node-details.md) — node description and details side panel (replaces the pencil) | Delivered |
| 4A | [slice-4a-task-nodes.md](slice-4a-task-nodes.md) — task nodes: kind, status and checklist | Delivered |
| 4B | [slice-4b-kanban-board.md](slice-4b-kanban-board.md) — kanban board of the focused node's tasks, with one global card order | Delivered |

The backlog beyond slice 1 is the [Roadmap in `README.md`](../../README.md#roadmap).

## Naming convention for acceptance criteria

Every acceptance criterion has an id of the form:

```
S<slice>_<layer>_AC<number>
```

- `S1` — the slice the criterion belongs to.
- `BE` — verified by the backend suite (`api/tests/`, pytest).
  `FE` — verified by the frontend suite (`web/src/`, Vitest).
- `AC<number>` — the criterion's number **within that slice and layer**. Numbers are not reused.

Examples: `S1_BE_AC11` (visible window), `S1_FE_AC25` (first-use hint), `S4A_BE_AC8` (a task
cannot have children). A slice split into parts keeps the letter in the id, as `S4A` does.

## How criteria map to tests

Every criterion has at least one test, and every test that verifies a criterion carries its id at
the start of the test name:

- **Backend (pytest):** the function is `test_S1_BE_AC11_window_has_focus_ancestors_and_two_levels`.
  The `test_` prefix is kept because pytest only collects functions matching `test*`.
  Run one criterion with `pytest -k S1_BE_AC11`.
- **Frontend (Vitest):** the test name starts with the id,
  `it('S1_FE_AC6: /n/X requests the window with the user's depth …')`.
  Run one criterion with `vitest run -t S1_FE_AC6`.

Tests **without** an id are supporting unit tests (pure functions, helpers, regression cases). They
are welcome, they are not traceability gaps, and they are listed under "Supporting tests" in each
slice document.

When behaviour changes, update the criterion in the slice document and the test name together.

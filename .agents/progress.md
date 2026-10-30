# Progreso · corrida: borrar nodos y hojas con dos modos

Spec: "borrar nodos y hojas desde la SPA, con dos modos" (backend + `web/`).

## Hecho

- [x] Backend: `DELETE /api/nodes/{id}?children=cascade|reparent` (`nodes/router.py`, `service.py`,
      `repository.py`). Reparent en una transacción: claves nuevas con `key_between` bisectadas
      (`spread_keys`) entre el hermano anterior y el siguiente; `version` de los hijos sube por el ORM.
- [x] Tests pytest: `api/tests/test_delete_modes.py` (CA1 a CA4).
- [x] Cliente: `deleteNode(id, { children })` en `web/src/api/client.ts` (+ test).
- [x] `useMapView`: hoja se borra directo; intermedio abre `DeleteRequest`; `confirmRemove` / `cancelRemove`.
- [x] `components/DeleteDialog.tsx` (role=dialog, aria-modal, foco inicial en Cancelar, Tab cíclico, Esc).
- [x] Botón de borrar en `IdeaNode` (no en la raíz ni en nodos pending); `ShortcutsHelp` actualizado.
- [x] Vitest: `web/src/deleteModes.test.tsx` (CA5 a CA11) y adaptación de tests con `window.confirm`.
      `fakeApi` soporta `?children=reparent`.

## Verificado

- [x] `uv run --directory api pytest -q --cov=app --cov-fail-under=80`: 116 en verde, 98%.
- [x] `pnpm --dir web exec vitest run --coverage`: 118 en verde, 99,4% de líneas.
- [x] `tsc --noEmit` y `eslint .` limpios; `ruff format` y `ruff check` limpios.

## Rechazados / pendientes

- `pnpm --dir web run gen:api` y `prettier --check` requirieron aprobación y no se corrieron.
  `schema.ts` solo trae esquemas de componentes (no query params), así que no cambia por esta spec.

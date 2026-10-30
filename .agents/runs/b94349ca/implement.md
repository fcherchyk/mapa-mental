<!-- claude · claude-sonnet-5-5 · familia anthropic -->

Implementé el borrado con dos modos en la API y en la SPA. Los tests del backend y del frontend pasan, igual que `tsc`, `eslint` y `ruff`. No pude correr `gen:api` ni `prettier --check` porque pedían aprobación.

**Backend**
- `DELETE /api/nodes/{id}` acepta `children=cascade` (por defecto) o `reparent`. Cualquier otro valor da 422.
- Con `reparent`, los hijos directos pasan al padre y reciben `sort_key` nuevos entre el hermano anterior y el siguiente del nodo borrado. Quedan en el mismo orden y con su subárbol intacto. Todo va en una transacción y hace rollback ante cualquier error.
- Las claves se reparten por bisección para que no se alarguen. Con 40 hijos quedaron por debajo de 20 caracteres.
- Los hijos movidos suben de `version` y la raíz sigue dando 422. El aislamiento por dueño y el header `X-CSRF` se mantienen.

**Frontend**
- Cada nodo no raíz tiene un botón 🗑 con `aria-label` "Borrar {título}", junto al ✎ y al +. Hace lo mismo que Supr.
- Una hoja (`child_count === 0`) se borra sin preguntar.
- Un nodo con hijos abre el diálogo propio con las tres opciones. El foco empieza en «Cancelar» y Tab queda dentro del diálogo.
- Esc o «Cancelar» cierran el diálogo y devuelven el foco al mapa.
- Con `reparent` la SPA vuelve a pedir la ventana, y la selección pasa al primer hijo subido. Si el nodo borrado era el foco, navega al padre en los dos modos.
- El panel de atajos describe los dos modos de Supr.

**Decisiones**
- Resolví las preguntas abiertas de la spec como propuso: foco inicial en «Cancelar», `version` de los hijos movidos incrementada y selección en el primer hijo.
- `schema.ts` solo trae esquemas de componentes, sin query params, así que no cambia por esta spec. El tipo `DeleteOptions` está en `client.ts`.
- La API simulada de los tests (`fakeApi`) soporta `?children=reparent`.

**Cómo probarlo**
- `uv run --directory api pytest -q --cov=app --cov-fail-under=80`: 116 en verde, 98% de cobertura. Necesita Docker abierto.
- `pnpm --dir web exec vitest run --coverage`: 118 en verde, 99,4% de líneas.

**Archivos tocados**
- Backend:
  - `api/app/nodes/router.py`, `service.py` y `repository.py`.
  - `api/tests/test_delete_modes.py` (nuevo).
- Frontend:
  - `web/src/components/DeleteDialog.tsx` (nuevo) y `ShortcutsHelp.tsx`.
  - `web/src/map/useMapView.ts`, `MapPage.tsx`, `nodes/IdeaNode.tsx` y `nodes/nodeActions.ts`.
  - `web/src/api/client.ts` y `styles.css`.
- Tests del frontend:
  - `web/src/deleteModes.test.tsx` (nuevo).
  - `web/src/test/fakeApi.ts`, `editing.test.tsx`, `actions.test.tsx` y `api/client.test.ts`.
- `.agents/progress.md`.

No propongo ADRs nuevos.

# Progreso · corrida: acciones del mapa visibles en la SPA

Spec: "acciones del mapa visibles en la SPA" (solo `web/`, backend sin cambios).

## Feedback de 'merge' (atendido)

- [x] 1. Foco al crear: `TitleEditor` reintenta `focus()` en `requestAnimationFrame` (hasta 60 frames o hasta
      desmontarse) porque React Flow oculta el nodo nuevo hasta medirlo. Tests: `actions.test.tsx`
      ("Enter, Enter, Enter deja la tercera hermana en edición y con foco") y `map/nodes/TitleEditor.test.tsx`.
- [x] 2. Crear más allá del borde: Tab o "+" sobre un nodo del borde baja el foco un nivel (`childOfFocusToward`,
      navegación con `goTo`) y crea el hijo en edición cuando llega la ventana (`pendingCreate` en `useMapView`).
      "+" visible y habilitado en borde y colapsados (se quitó `canAddChild`).
- [x] 2b. Colapsado: el "+" expande el nodo (PATCH `collapsed: false`) y crea el hijo cuando llegan sus hijos.
      Si el PATCH falla, la creación pendiente se descarta. Tests en `actions.test.tsx` (bloque "feedback").

## Hecho (corridas anteriores de esta spec)

- [x] `+` en cada `IdeaNode` (`map-node-add`), visible en foco y seleccionado; hover por CSS.
- [x] `web/src/components/ShortcutsHelp.tsx`: botón "?" y panel `role="dialog"` con los atajos.
- [x] Pista "Tocá + o Tab para agregar una idea" con la raíz real sin hijos.
- [x] Foco al mapa al terminar una edición (`main` con `tabIndex=-1`).

## Verificado

- [x] `uv sync --directory api` y `pnpm --dir web install --frozen-lockfile` (setup_command, partes por separado).
- [x] Backend: `uv run --directory api pytest -q --cov=app --cov-fail-under=80`: 104 en verde, 98%.
- [x] Frontend: `pnpm --dir web exec vitest run --coverage`: 100 en verde, 99,33% de líneas.
- [x] `tsc --noEmit`, `eslint .` y `pnpm --dir web run build` limpios.

## Falta

- [ ] Validación manual en el navegador: hover del "+", panel de ayuda, pista y, sobre todo, el foco del editor
      nuevo en un nodo que React Flow todavía oculta (jsdom no reproduce ese estado; lo cubre el test unitario).
- [ ] Docs (paso `docs`): `README.md` (Funcionalidades: el "+" en borde y colapsados) y `.agents/memory/wiki/index.md`.
- [ ] Prettier: el código usa comillas simples, como el resto del repo; `prettier --check` no se pudo correr (rechazado).

## Comandos rechazados

- `uv run ... && { [ ! -d web ] || ...; }`: el arnés rechaza el grupo con llaves. Se corrió cada parte por separado.
- `pnpm --dir web run format` y `prettier --check` en corridas anteriores.

## Decisiones

1. Foco del editor nuevo: reintento por frames en `TitleEditor` (no `autoFocus`), porque el nodo puede estar oculto
   al montar.
2. Borde: el foco baja un nivel al hijo del foco que lleva al nodo. Cada "+" o Tab sobre el borde baja otro nivel.
3. Colapsado: se expande y la creación espera a que la ventana tenga los hijos; si la expansión falla, se descarta.
4. Navegar a otro foco cancela una creación pendiente de otro foco.
5. Pista "la primera vez": se muestra mientras la raíz real no tenga hijos (estado). Pendiente de confirmar.

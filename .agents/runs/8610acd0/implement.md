<!-- claude · claude-haiku-5-5 · familia anthropic -->

Atendí el feedback de 'merge' (los dos puntos). Tests del frontend, backend, typecheck, lint y build pasan. No hice commit.

**Archivos tocados** (todos en `web/`, el backend no cambió)
- `src/map/nodes/TitleEditor.tsx`: el foco ya no depende de `autoFocus`. Reintenta `focus()` en frames (hasta 60) hasta que el campo lo tiene o se desmonta. React Flow oculta el nodo nuevo hasta medirlo, y un elemento oculto no recibe foco.
- `src/map/useMapView.ts`: `startCreateChild(parentId, goTo)` decide según el nodo:
  - Borde: el foco baja un nivel al hijo del foco que lleva al nodo (`goTo`). La creación queda pendiente y se completa cuando llega esa ventana.
  - Colapsado: expande con PATCH y crea el hijo cuando llegan sus hijos.
  - Si el PATCH falla, la pendiente se descarta. Si el usuario navega a otro foco, también se cancela.
  - `setCollapsed` se extrajo de `toggleCollapse` para reutilizarlo.
- `src/map/tree.ts`: `childOfFocusToward` y `hasLoadedChildren`.
- `src/map/MapPage.tsx`, `MapCanvas.tsx`, `nodes/IdeaNode.tsx`, `nodes/nodeActions.ts`: pasan `goTo` y quitan `canAddChild`. El "+" queda habilitado en borde y colapsados.
- Tests: `src/actions.test.tsx` (bloque "feedback", y el test de CA2 que ahora espera el "+" habilitado), `src/editing.test.tsx` (Tab sobre borde ahora baja un nivel) y el nuevo `src/map/nodes/TitleEditor.test.tsx`.
- `.agents/progress.md` actualizado.

**Decisiones**
- Borde: cada "+" o Tab sobre el borde baja un nivel, así que la vista se mueve de a un nivel por vez.
- Colapsado: el "+" expande el nodo y después crea el hijo. Si la expansión falla, no queda una creación pendiente que se dispare más tarde.
- Pista "la primera vez": sigue como estado (se muestra mientras la raíz real no tenga hijos). Hay que confirmarlo con vos, porque el pedido dice "la primera vez".

**Resultados**
- Vitest: 100 en verde, 99,33% de líneas.
- Backend (`pytest --cov-fail-under=80`): 104 en verde, 98%.
- `tsc`, `eslint` y `vite build`: limpios.
- El `test_command` con llaves fue rechazado por el arnés, así que corrí sus dos partes por separado.

**Cómo probarlo**
- `pnpm --dir web exec vitest run --coverage`.
- Manual, con `docker compose up`: el "+" en un nodo del borde y en uno colapsado, y el foco del editor nuevo en un nodo recién creado. jsdom no reproduce el nodo oculto de React Flow, así que el reintento de foco solo lo cubre el test unitario.

**Pendiente**
- Validación manual en el navegador (hover, panel de ayuda, pista, foco).
- Docs del paso `docs`: el README y la wiki todavía no mencionan que el "+" funciona en borde y colapsados.
- Prettier no se pudo correr (rechazado en corridas anteriores).

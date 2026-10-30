<!-- claude · claude-haiku-5-5 · familia anthropic -->

Implementé la spec en `web/`: el "+" en cada nodo, la ayuda de atajos con su pista, y el foco que vuelve al mapa después de editar. El backend no cambió. Tests del frontend: 80 en verde con 99,5% de líneas. Backend: 104 en verde con 98%. No commiteé nada.

**Archivos**
- `web/src/map/nodes/IdeaNode.tsx`: botón "+" junto al lápiz, con `aria-label` "Agregar idea dentro de <título>". Se ve siempre en el foco y en el seleccionado; en los demás aparece con el mouse encima (CSS). Click y doble click no llegan al mapa.
- `web/src/map/nodes/nodeActions.ts`: `createChild` en las acciones y `canAddChild` en los datos del nodo.
- `web/src/map/MapCanvas.tsx`: calcula `canAddChild`.
- `web/src/components/ShortcutsHelp.tsx` (nuevo): botón "?" con `aria-expanded` y panel `role="dialog"` con los ocho atajos. Escape cierra y devuelve el foco al "?".
- `web/src/map/MapPage.tsx`: el mapa recibe foco (`tabIndex=-1`) al terminar una edición, la pista de raíz vacía, y los atajos quedan desactivados mientras la ayuda está abierta.
- `web/src/styles.css`: estilos del "+", de la pista y del panel.
- `web/src/actions.test.tsx` (nuevo): 15 tests, nombrados `CA1`…`CA9` según los criterios de la spec.
- `.agents/progress.md`: sección nueva de esta corrida.

**Decisiones**
- **Foco al terminar una edición.** React Flow desmonta el editor un render después de que `editingId` vuelve a `null`, así que el chequeo inicial no alcanzaba. Ahora cuenta como foco perdido también el editor que todavía está en el mapa. Si el usuario hace click en otro lado, el foco no se fuerza.
- **"+" en nodos colapsados o del borde.** Aparece en el DOM pero deshabilitado, porque ahí un hijo nuevo quedaría oculto. Así respondo la pregunta abierta de la spec: el "+" no enfoca el nodo primero.
- **Pista "la primera vez".** La muestro mientras la raíz no tenga hijos, no una sola vez por persona. Sigue pendiente de confirmar, como dice la spec.
- **Enter sobre un hijo recién creado** sigue abriendo un hermano en edición, como ya hacía.

**Para validar a mano**
- Después de cerrar la ayuda, el foco queda en el "?" (lo pide la spec). Un Tab o un atajo en ese momento no actúa sobre el mapa hasta hacer click en él. Conviene revisar si eso se siente bien.
- El hover del "+" y el aspecto del panel no se pueden probar en jsdom.

**Lo que no hice**
- `pnpm --dir web exec vite build` fue rechazado por el arnés, igual que en la corrida anterior. Typecheck y lint sí pasan.
- Los docs (`README.md` y la wiki) quedan para el paso `docs`.

**Cómo probarlo**
- `pnpm --dir web exec vitest run --coverage`
- `pnpm --dir web exec tsc --noEmit && pnpm --dir web exec eslint .`
- Backend: `uv run --directory api pytest -q --cov=app --cov-fail-under=80` (con Docker abierto).

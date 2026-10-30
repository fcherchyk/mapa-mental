<!-- openrouter · nvidia/nemotron-3-ultra-550b-a55b:free · familia nvidia -->

Veredicto: OK
Criterios cubiertos: Backend CA1-CA4 (tests en test_delete_modes.py), Frontend CA5-CA11 (tests en deleteModes.test.tsx y editing.test.tsx). Botón visible con aria-label, hoja sin diálogo, nodo intermedio con diálogo accesible (role=dialog, aria-modal, foco en Cancelar, Tab/Shift+Tab/Esc), dos modos cascade/reparent, reparent atómico con spread_keys, validaciones CSRF/owner/root/422, foco navega al padre, ShortcutsHelp actualizado.
Riesgos: En useMapView.ts `deleteNode` para cascade+focus hace dos `mutate` que llaman a `call` (API) dos veces; `reloadFromServer` no se ve definido en el diff (puede estar fuera del recorte). En service.py `move_children_to_parent` no incrementa `version` de los hijos movidos (test CA2 espera que suba).
Sugerencias: Revisar `deleteNode` para no duplicar la llamada a la API en cascade+focus; confirmar que `reloadFromServer` existe y que `version` se incrementa (evento SQLAlchemy o a mano).

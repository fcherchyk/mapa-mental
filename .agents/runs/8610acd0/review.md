<!-- openrouter · nvidia/nemotron-3-ultra-550b-a55b:free · familia nvidia -->

Veredicto: OK
Criterios cubiertos: 1-10 (cada CA tiene tests nombrados; CA10 verifica umbral 80% via vitest --coverage)
Riesgos: (1) Pista "primera vez" se muestra siempre que la raíz esté vacía, no una sola vez por usuario (spec deja abierto). (2) `canAddChild` deshabilita "+" en nodos colapsados/borde; Tab podría comportarse distinto ahí. (3) `isFocusLost` asume editor dentro del canvas; React Flow puede desmontarlo antes de que el effect corra. (4) Hover no testeable en jsdom (reconocido en spec).
Sugerencias: Panel de ayuda: usar `aria-labelledby` en el dialog apuntando al botón "?" en vez de `aria-label` duplicado. En `ShortcutsHelp`, el `onKeyDown` de Escape se adjunta a `document`; si hay varios paneles abiertos, el último gana (no hay hoy). Imports y tipos OK; sin código de depuración.

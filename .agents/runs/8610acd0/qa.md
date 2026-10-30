<!-- antigravity · gemini-3.8-flash-high · familia google -->

Se implementaron y ejecutaron los tests automatizados en [web/src/actions.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/actions.test.tsx) utilizando Vitest y React Testing Library, cubriendo todos los criterios de aceptación de la especificación junto con casos borde y entradas inválidas (títulos vacíos, con espacios, cancelación con Escape, nodos en edición, atajos bloqueados durante la ayuda, y persistencia de pista inicial).

No se modificó código de producción y todos los tests pasaron exitosamente, alcanzando un **99.49%** de cobertura de líneas (superando ampliamente el umbral del 80%).

### Tabla de resultados por criterio de aceptación

| Criterio | Test | Resultado |
|---|---|---|
| **CA1**: `+` crea un hijo en edición | `CA1: el + de la raíz crea un hijo en edición y Enter lo manda a POST` | PASÓ |
| **CA1**: `+` crea un hijo en edición | `CA1: el + de un nodo hijo crea un hijo en edición dentro de ese nodo` | PASÓ |
| **CA1**: `+` crea un hijo en edición (entradas inválidas) | `CA1: un título vacío o con solo espacios al crear con + no se envía a la API` | PASÓ |
| **CA1**: `+` crea un hijo en edición (caso borde) | `CA1: Escape al crear un hijo con + cancela la creación sin llamar a la API` | PASÓ |
| **CA1**: `+` crea un hijo en edición (formato) | `CA1: un título con espacios a los extremos al crear con + se envía recortado` | PASÓ |
| **CA2**: `+` presente donde corresponde | `CA2: el + está en el DOM de cada nodo no pendiente; el foco y el seleccionado lo muestran` | PASÓ |
| **CA2**: `+` presente donde corresponde (nodo en edición) | `CA2: un nodo en edición no tiene el botón + en el DOM` | PASÓ |
| **CA2**: `+` presente donde corresponde (caso borde) | `CA2: el + de un nodo colapsado o del borde aparece deshabilitado` | PASÓ |
| **CA3**: `+` no dispara otras acciones | `CA3: el doble click en el + de un nodo que no es el foco no cambia la ruta` | PASÓ |
| **CA3**: `+` no dispara otras acciones (nodo foco) | `CA3: el doble click en el + del nodo foco no sube de nivel ni cambia la ruta` | PASÓ |
| **CA3**: `+` no dispara otras acciones | `CA3: el click simple en el + de un hijo no navega ni enfoca ese nodo` | PASÓ |
| **CA4**: Atajos funcionan tras el lápiz | `CA4: atajos funcionan tras el lápiz: al confirmar, el foco vuelve al mapa y Tab crea un hijo` | PASÓ |
| **CA4**: Atajos funcionan tras el lápiz (hermano con Enter) | `CA4: atajos funcionan tras el lápiz: Enter abre un hermano con el foco ahí; Escape devuelve el foco al mapa` | PASÓ |
| **CA4**: Atajos funcionan tras el lápiz (cancelar con Escape) | `CA4: si la edición del lápiz se cancela con Escape, el foco vuelve al mapa` | PASÓ |
| **CA4**: Atajos funcionan tras el lápiz (confirmar con blur) | `CA4: al confirmar edición del lápiz desenfocando (blur), el foco en el mapa permite atajos como F2` | PASÓ |
| **CA5**: Atajos funcionan tras el `+` | `CA5: F2 funciona después de crear un hijo con el +` | PASÓ |
| **CA5**: Atajos funcionan tras el `+` (cancelar con Escape) | `CA5: si la creación con + se cancela con Escape, el foco vuelve al mapa y los atajos siguen andando` | PASÓ |
| **CA6**: Abrir y cerrar la ayuda (panel y descripciones) | `CA6: ? abre el panel con los 8 atajos y sus descripciones, y Escape lo cierra devolviendo el foco al botón` | PASÓ |
| **CA6**: Abrir y cerrar la ayuda (segundo click) | `CA6: un segundo click en ? cierra el panel y devuelve el foco al botón` | PASÓ |
| **CA7**: Ayuda no dispara atajos del mapa (Supr/Espacio) | `CA7: con el panel abierto, Supr y Espacio no borran ni colapsan nodos` | PASÓ |
| **CA7**: Ayuda no dispara atajos del mapa (Tab/F2/Enter/Backspace) | `CA7: con el panel abierto, Tab, F2, Backspace y Enter no crean hijos, no editan ni navegan` | PASÓ |
| **CA8**: Uso solo con teclado (`?` con Enter/Espacio, `+` con Enter) | `CA8: se usa solo con teclado: Enter o Espacio sobre ? abren y cierran la ayuda; Enter sobre el + crea un hijo` | PASÓ |
| **CA8**: Uso solo con teclado (`+` con Espacio) | `CA8: Espacio sobre el botón + crea un hijo en edición` | PASÓ |
| **CA9**: Pista inicial (creación con Tab) | `CA9: se ve con la raíz real sin hijos y desaparece al crear el primer hijo con Tab` | PASÓ |
| **CA9**: Pista inicial (creación con `+`) | `CA9: desaparece al crear el primer hijo usando el botón +` | PASÓ |
| **CA9**: Pista inicial (cancelación con Escape) | `CA9: si se cancela la creación del primer hijo con Escape, la pista se mantiene visible` | PASÓ |
| **CA9**: Pista inicial | `CA9: no aparece si la raíz ya tiene hijos` | PASÓ |
| **CA9**: Pista inicial | `CA9: no aparece si el foco no es la raíz real` | PASÓ |
| **CA10**: Cobertura y trazabilidad | `CA10: la suite cubre todos los criterios y supera el umbral del 80% de líneas configurado en Vite` | PASÓ (99.49% líneas) |

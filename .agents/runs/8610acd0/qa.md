<!-- antigravity · gemini-3.8-flash-high · familia google -->

Se implementaron y ejecutaron los tests automatizados en [actions.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/actions.test.tsx) utilizando Vitest y React Testing Library. Se cubren todos los criterios de aceptación de la especificación, los casos borde y entradas inválidas, así como los escenarios derivados del feedback (foco en hermanas consecutivas, creación más allá del borde y en nodos colapsados, persistencia y reaparición de la pista inicial al quedar vacío el mapa).

No se modificó código de producción y todos los tests pasaron exitosamente, alcanzando un **99.33%** de cobertura de líneas en la SPA (superando el umbral requerido del 80%).

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
| **CA2**: `+` presente donde corresponde (borde y colapsado) | `CA2: el + de un nodo colapsado o del borde está presente y habilitado` | PASÓ |
| **CA2**: `+` presente donde corresponde (nodo pendiente) | `CA2: el nodo pendiente creado con el botón + no tiene el botón + en el DOM` | PASÓ |
| **CA3**: `+` no dispara otras acciones | `CA3: el doble click en el + de un nodo que no es el foco no cambia la ruta` | PASÓ |
| **CA3**: `+` no dispara otras acciones (nodo foco) | `CA3: el doble click en el + del nodo foco no sube de nivel ni cambia la ruta` | PASÓ |
| **CA3**: `+` no dispara otras acciones | `CA3: el click simple en el + de un hijo no navega ni enfoca ese nodo` | PASÓ |
| **CA4**: Atajos funcionan tras el lápiz | `CA4: atajos funcionan tras el lápiz: al confirmar, el foco vuelve al mapa y Tab crea un hijo` | PASÓ |
| **CA4**: Atajos funcionan tras el lápiz (hermano con Enter) | `CA4: atajos funcionan tras el lápiz: Enter abre un hermano con el foco ahí; Escape devuelve el foco al mapa` | PASÓ |
| **CA4**: Atajos funcionan tras el lápiz (cancelar con Escape) | `CA4: si la edición del lápiz se cancela con Escape, el foco vuelve al mapa` | PASÓ |
| **CA4**: Atajos funcionan tras el lápiz (confirmar con blur) | `CA4: al confirmar edición del lápiz desenfocando (blur), el foco en el mapa permite atajos como F2` | PASÓ |
| **CA4**: Atajos funcionan tras el lápiz (otros atajos) | `CA4: cancelar la edición del lápiz con Escape permite colapsar con Espacio` | PASÓ |
| **CA5**: Atajos funcionan tras el `+` | `CA5: F2 funciona después de crear un hijo con el +` | PASÓ |
| **CA5**: Atajos funcionan tras el `+` (cancelar con Escape) | `CA5: si la creación con + se cancela con Escape, el foco vuelve al mapa y los atajos siguen andando` | PASÓ |
| **CA5**: Atajos funcionan tras el `+` (crear nieto con Tab) | `CA5: tras crear un hijo con el botón +, Tab sobre el nuevo hijo crea un nieto en edición` | PASÓ |
| **CA6**: Abrir y cerrar la ayuda (panel y descripciones) | `CA6: ? abre el panel con los 8 atajos y sus descripciones, y Escape lo cierra devolviendo el foco al botón` | PASÓ |
| **CA6**: Abrir y cerrar la ayuda (segundo click) | `CA6: un segundo click en ? cierra el panel y devuelve el foco al botón` | PASÓ |
| **CA7**: Ayuda no dispara atajos del mapa (Supr/Espacio) | `CA7: con el panel abierto, Supr y Espacio no borran ni colapsan nodos` | PASÓ |
| **CA7**: Ayuda no dispara atajos del mapa (Tab/F2/Enter/Backspace) | `CA7: con el panel abierto, Tab, F2, Backspace y Enter no crean hijos, no editan ni navegan` | PASÓ |
| **CA7**: Ayuda no dispara atajos del mapa (flechas) | `CA7: con el panel abierto, las flechas no cambian la selección` | PASÓ |
| **CA8**: Uso solo con teclado (`?` con Enter/Espacio, `+` con Enter) | `CA8: se usa solo con teclado: Enter o Espacio sobre ? abren y cierran la ayuda; Enter sobre el + crea un hijo` | PASÓ |
| **CA8**: Uso solo con teclado (`+` con Espacio) | `CA8: Espacio sobre el botón + crea un hijo en edición` | PASÓ |
| **CA8**: Uso solo con teclado (navegación Tab entre controles) | `CA8: con el foco en un botón, Tab no crea un hijo sino que navega al siguiente control interactivo` | PASÓ |
| **CA9**: Pista inicial (creación con Tab) | `CA9: se ve con la raíz real sin hijos y desaparece al crear el primer hijo con Tab` | PASÓ |
| **CA9**: Pista inicial (creación con `+`) | `CA9: desaparece al crear el primer hijo usando el botón +` | PASÓ |
| **CA9**: Pista inicial (cancelación con Escape) | `CA9: si se cancela la creación del primer hijo con Escape, la pista se mantiene visible` | PASÓ |
| **CA9**: Pista inicial | `CA9: no aparece si la raíz ya tiene hijos` | PASÓ |
| **CA9**: Pista inicial | `CA9: no aparece si el foco no es la raíz real` | PASÓ |
| **CA9**: Pista inicial (caso borde: reaparición al quedar vacío) | `CA9: si se borra el único hijo de la raíz, la pista vuelve a aparecer` | PASÓ |
| **Feedback 1**: Foco en hermanas consecutivas | `feedback 1: Enter, Enter, Enter deja la tercera hermana en edición y con foco` | PASÓ |
| **Feedback 2**: Borde (`+`) | `feedback 2: + sobre un nodo del borde baja el foco un nivel y crea el hijo en edición` | PASÓ |
| **Feedback 2**: Borde (`Tab`) | `feedback 2: Tab sobre un nodo del borde baja el foco un nivel y crea el hijo en edición` | PASÓ |
| **Feedback 2**: Colapsado (`+`) | `feedback 2: + sobre un nodo colapsado lo expande y después crea el hijo en edición` | PASÓ |
| **Feedback 2**: Colapsado con fallo de API | `feedback 2: si la expansión del + falla, no queda una creación pendiente que se dispare después` | PASÓ |
| **CA10**: Cobertura y trazabilidad | `CA10: la suite cubre todos los criterios y supera el umbral del 80% de líneas configurado en Vite` | PASÓ (99.33% líneas) |

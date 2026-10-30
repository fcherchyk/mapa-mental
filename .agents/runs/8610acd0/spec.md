<!-- claude-readonly · claude-opus-5-5 · familia anthropic -->

# Spec: acciones del mapa visibles en la SPA

## 1. Contexto

Hoy la única forma de crear un hijo es la tecla Tab, y la pantalla no lo dice en ningún lado. Una persona nueva no tiene cómo enterarse. Además, después de hacer click en el lápiz (✎), el foco del navegador se queda en ese botón. `MapPage.handleKey` ignora las teclas cuyo destino es un elemento interactivo (`isInteractiveTarget`), así que los atajos dejan de andar hasta que se hace click en otro lado. Este cambio suma un botón "+" en cada nodo, una ayuda de atajos y una pista inicial, y devuelve el foco al mapa después de cada acción con el mouse. Todo queda en el frontend (`web/`).

## 2. Alcance

**Incluye**
- Un botón "+" en `IdeaNode` (y en cualquier tipo de nodo que use `NodeActions`). Crea un hijo en edición con el mismo camino que Tab (`view.startCreateChild`). Para eso se suma `createChild` a `NodeActions`.
- Visibilidad del "+": siempre en el nodo foco, y en los demás nodos cuando están seleccionados o con el mouse encima. Se maneja con clases CSS. El botón está siempre en el DOM salvo que el nodo esté en edición o sea `pending`, igual que el lápiz.
- Un botón "?" en `map-header-actions` que abre y cierra un panel de atajos con estas entradas: Tab, F2, Espacio, Supr, Enter, Retroceso, flechas y doble click, cada una con una descripción en español que siga el ADR 0009.
- Una pista "Tocá + o Tab para agregar una idea", visible mientras el foco es la raíz real y no tiene hijos.
- Un contenedor del mapa que puede recibir el foco (`tabIndex=-1`). Al terminar una acción iniciada con un botón del nodo (lápiz o "+"), es decir al confirmar o cancelar la edición, el foco vuelve a ese contenedor. Lo mismo pasa al cerrar el panel de ayuda, que devuelve el foco al botón "?".
- `aria-label` en "+" (`Agregar idea dentro de <título>`) y en "?" (`Atajos de teclado`). El "?" lleva `aria-expanded`. El panel lleva `role="dialog"` y un nombre accesible.
- Tests con Vitest y Testing Library, con la API simulada de `src/test/fakeApi.ts`.

**Queda afuera**
- Cualquier cambio en el backend o en la API, incluida guardar en el servidor que la pista ya se vio.
- Atajos nuevos, por ejemplo la tecla "?" para abrir la ayuda.
- Arrastrar o reordenar nodos (corte 2).
- Rediseño visual del nodo más allá de sumar el botón.

## 3. Criterios de aceptación

1. **"+" crea un hijo en edición.**
   - Dado un mapa con la raíz enfocada.
   - Cuando la persona hace click en el botón con nombre accesible "Agregar idea dentro de <título raíz>".
   - Entonces aparece un nodo hijo nuevo con el editor de título abierto, igual que al apretar Tab con la raíz seleccionada. Al confirmar con Enter se llama a `POST /nodes/{id}/children` con el título escrito.

2. **"+" está presente donde corresponde.**
   - Dado un mapa con foco, hijos y un nodo `pending`.
   - Cuando se renderiza.
   - Entonces el nodo foco tiene el "+" con una clase que lo deja siempre visible. Los nodos no `pending` que no están en edición tienen el "+" en el DOM. Los nodos `pending` o en edición no lo tienen.
   - El hover se cubre con CSS y no se testea en jsdom; ver riesgos.

3. **"+" no dispara otras acciones del nodo.**
   - Dado un nodo que no es el foco.
   - Cuando se hace doble click sobre su botón "+".
   - Entonces la ruta no cambia, porque el botón detiene la propagación igual que el lápiz.

4. **Los atajos siguen andando después del lápiz.**
   - Dado un nodo seleccionado.
   - Cuando se hace click en el lápiz, se escribe un título, se confirma con Enter y después se aprieta Tab.
   - Entonces `document.activeElement` es el contenedor del mapa y Tab abre un hijo nuevo en edición. Lo mismo pasa si la edición se cancela con Escape.

5. **Los atajos siguen andando después del "+".**
   - Dado un hijo creado con el botón "+" y confirmado.
   - Cuando se aprieta F2.
   - Entonces el nodo seleccionado entra en edición.

6. **Abrir y cerrar la ayuda.**
   - Dado el mapa cargado.
   - Cuando se hace click en el botón "Atajos de teclado".
   - Entonces aparece un `role="dialog"` que lista Tab, F2, Espacio, Supr, Enter, Retroceso, flechas y doble click, cada uno con su descripción, y el botón pasa a `aria-expanded="true"`.
   - Cuando después se aprieta Escape o se vuelve a hacer click en el botón, el panel se cierra, el foco vuelve al botón "?" y `aria-expanded` pasa a `"false"`.

7. **La ayuda no dispara atajos del mapa.**
   - Dado el panel abierto y un nodo seleccionado.
   - Cuando se aprieta Supr o Espacio.
   - Entonces no se borra ni se colapsa ningún nodo.

8. **Se puede usar solo con teclado.**
   - Dado el mapa cargado.
   - Cuando se navega con el foco del navegador hasta "?" o hasta un "+" y se aprieta Enter o Espacio.
   - Entonces se ejecuta la misma acción que con el click: abrir la ayuda o crear un hijo en edición.

9. **Pista inicial.**
   - Dado el foco en la raíz real sin hijos.
   - Cuando se renderiza el mapa.
   - Entonces se ve el texto "Tocá + o Tab para agregar una idea".
   - Cuando se crea y confirma el primer hijo, el texto desaparece.
   - Dado un mapa cuya raíz ya tiene hijos, o el foco en un nodo que no es la raíz, el texto no aparece.

10. **Cobertura.** `pnpm --dir web exec vitest run --coverage` pasa con el umbral de 80% de líneas. Cada criterio tiene al menos un test cuyo nombre lo menciona, por ejemplo `CA4: atajos funcionan tras el lápiz`.

## 4. Riesgos y preguntas abiertas

- **Qué significa "la primera vez".** Este borrador interpreta la pista como un estado: se muestra mientras la raíz no tenga hijos. Si la intención era mostrarla una sola vez por persona aunque borre todos sus hijos, hay que guardarlo en el navegador (con `localStorage` vale solo por dispositivo), porque el pedido dice que el backend no cambia. Hay que confirmarlo.
- **"+" en los nodos del borde (nivel N) y en los colapsados.** El hijo nuevo quedaría fuera de la ventana visible (ADR 0011) o escondido. Se asume el mismo comportamiento que tiene hoy Tab en ese caso. ¿Conviene que el "+" sobre un nodo del borde lo enfoque primero, o que no aparezca?
- **Tab con el foco del navegador en un botón.** Tab sigue la navegación estándar del navegador, no crea un hijo, porque los botones son interactivos. Esto es necesario para el criterio 8, pero hay que dejarlo claro en el panel de ayuda ("con el mapa enfocado").
- **Hover en jsdom.** jsdom no aplica CSS, así que la visibilidad al pasar el mouse no se puede verificar con Vitest. Se testea la presencia en el DOM y las clases. La parte visual queda para la validación manual.
- **Nodo seleccionado al terminar.** Después de crear un hijo con "+" y confirmarlo, ¿la selección queda en el hijo nuevo, igual que con Tab? Se asume que sí, porque se reutiliza el mismo camino.
- **Enter en la edición crea un hermano.** `commitEdit` recibe `createSibling`. Si el título se confirma de una forma que abre un hermano en edición, el foco tiene que quedarse en el editor nuevo y no volver al mapa. El foco vuelve al mapa recién cuando no queda ninguna edición abierta.

<!-- claude-readonly · claude-opus-5-5 · familia anthropic -->

# Spec: borrar nodos y hojas desde la SPA, con dos modos

## 1. Contexto

Hoy solo se puede borrar con Supr. Borra el nodo con todo su subárbol, y si tiene descendientes pregunta con `window.confirm`. No hay un control visible para borrar ni forma de quitar un nodo intermedio sin perder sus hijos. Este cambio es para quien usa el mapa: suma un botón de borrar en cada nodo y un diálogo propio para los nodos con hijos, con un segundo modo que borra solo el nodo y sube sus hijos al padre. Ese modo también queda en la API.

## 2. Alcance

**Incluye**

- **Botón de borrar en `IdeaNode`.** Va junto al ✎ y al +, con `aria-label` (por ejemplo «Borrar idea»). No aparece en la raíz real del mapa (`parent_id === null`) ni en nodos `pending`. Hace lo mismo que Supr.
- **Hoja sin confirmación.** Una hoja es un nodo con `child_count === 0` (sin hijos visibles ni ocultos) y se borra sin preguntar.
- **Diálogo propio para nodos intermedios.** Es un componente React, no `window.confirm`. Tiene `role="dialog"`, `aria-modal="true"` y un título accesible, y se maneja entero con teclado: el foco queda dentro mientras está abierto, Tab y Shift+Tab recorren las opciones, Esc cancela y al cerrarse el foco vuelve al contenedor del mapa. Tiene tres opciones:
  - **«Borrar todo a partir de acá»**: borra el subárbol, como hoy. Indica la cantidad de descendientes con la misma lógica actual de exacto o «al menos N».
  - **«Borrar solo este y subir sus hijos»**: borra con `children=reparent`.
  - **«Cancelar»**: no hace nada.
- **Backend.** `DELETE /api/nodes/{id}` acepta el query param opcional `children` con los valores `cascade` (por defecto, el comportamiento actual) o `reparent`. Con `reparent`, en una sola transacción:
  - los hijos directos pasan a tener `parent_id` = padre del nodo borrado;
  - reciben `sort_key` nuevos, válidos según `SORT_KEY_PATTERN`, generados con `key_between`. Quedan estrictamente entre el hermano anterior y el siguiente que tenía el nodo borrado, y conservan su orden relativo;
  - después se borra el nodo, y el subárbol de cada hijo queda intacto.

  Se mantienen el aislamiento por dueño (join con `maps.owner_id`, 404 si el nodo no es del usuario), el header `X-CSRF` y el 422 al intentar borrar la raíz. Un valor inválido de `children` da 422.
- **Cliente.** `api.deleteNode(id, { children })` en `api/client.ts`, con `schema.ts` regenerado. Después de un borrado con `reparent`, la SPA invalida la caché de ventanas y vuelve a pedir la ventana actual, porque los nietos suben un nivel y pueden entrar en la ventana visible.
- **Foco.** Si el nodo borrado, en cualquiera de los dos modos, es el foco, la SPA navega al padre igual que hoy.
- **Panel de atajos.** El texto de Supr en `ShortcutsHelp` pasa a describir los dos modos.
- **Tests.** pytest contra PostgreSQL (testcontainers) y Vitest. Los tests actuales que espían `window.confirm` se adaptan al diálogo.

**Queda afuera**

- Deshacer el borrado.
- Borrar varios nodos a la vez.
- Mover nodos arrastrando (corte 2).
- Cambios de esquema o migraciones.

## 3. Criterios de aceptación

**Backend (pytest)**

1. **CA1, cascade por defecto.** Dado un nodo N con hijos y nietos, cuando hago `DELETE /api/nodes/{N}` sin `children` o con `children=cascade`, entonces la respuesta es 204 y no queda N ni ninguno de sus descendientes.
2. **CA2, reparent: posición y orden.** Dado un padre P con hijos `[A, N, B]` y N con hijos `[c1, c2, c3]` (c1 con subárbol propio), cuando hago `DELETE /api/nodes/{N}?children=reparent`, entonces:
   - la respuesta es 204;
   - los hijos de P ordenados por `sort_key` son `[A, c1, c2, c3, B]`;
   - todos los `sort_key` son únicos y cumplen `SORT_KEY_PATTERN`;
   - el subárbol de c1 queda igual.

   El mismo test cubre N como primer hijo y N como último hijo de P.
3. **CA3, reparent: atomicidad.** Dado un fallo forzado durante el reparent (por ejemplo, un error simulado después de mover los hijos), cuando se ejecuta el borrado, entonces no queda ningún cambio aplicado: N y sus hijos siguen como estaban.
4. **CA4, seguridad y validación.** Probar `DELETE` con `children=reparent` en estos casos:

   | Caso | Respuesta | Efecto |
   |---|---|---|
   | Sin `X-CSRF` | 403 | No se borra nada |
   | Nodo de otro usuario | 404 | No se borra nada |
   | Raíz del mapa | 422 | No se borra nada |
   | `children=foo` | 422 | No se borra nada |

**Frontend (Vitest)**

5. **CA5, botón visible.** Dado un mapa con raíz e hijos, cuando se renderiza, entonces:
   - cada nodo no raíz muestra un botón con `aria-label` de borrar;
   - la raíz real no lo muestra;
   - activar el botón equivale a seleccionar el nodo y pulsar Supr.
6. **CA6, hoja.** Dado un nodo con `child_count === 0`, cuando lo borro (con el botón o con Supr), entonces no se abre ningún diálogo, no se llama a `window.confirm`, se llama a `deleteNode(id)` en modo cascade y el nodo desaparece.
7. **CA7, nodo intermedio: diálogo.** Dado un nodo con `child_count > 0`, sus hijos visibles o no, cuando lo borro, entonces:
   - se abre un `role="dialog"` con las tres opciones y el texto incluye la cantidad de descendientes («al menos N» si hay niveles sin cargar);
   - no se llama a `window.confirm`;
   - el foco queda dentro del diálogo.
8. **CA8, subárbol.** Dado el diálogo abierto, cuando elijo «Borrar todo a partir de acá», entonces se llama a `deleteNode(id)` en modo cascade, desaparecen el nodo y sus descendientes, y el diálogo se cierra.
9. **CA9, reparent.** Dado el diálogo abierto para N, hijo de P con hijos `[c1, c2]`, cuando elijo «Borrar solo este y subir sus hijos», entonces:
   - se llama a `deleteNode(N, { children: 'reparent' })`;
   - se vuelve a pedir la ventana;
   - c1 y c2 aparecen como hijos de P, en el lugar de N y en ese orden.
10. **CA10, cancelar.** Dado el diálogo abierto, cuando elijo «Cancelar» o pulso Esc, entonces no se llama a `deleteNode`, el mapa queda igual y el foco vuelve al contenedor del mapa.
11. **CA11, foco borrado.** Dado que el nodo en foco (`/n/:id`) es intermedio, cuando lo borro con cualquiera de los dos modos, entonces la SPA navega a `/n/{parentId}`.

## 4. Riesgos y preguntas abiertas

- **Foco inicial del diálogo.** Propongo que empiece en «Cancelar», la opción menos destructiva, a costa de un paso más con teclado. Hay que confirmarlo. ¿Hacen falta también atajos de una tecla dentro del diálogo?
- **Hojas sin confirmación desde el botón.** Un click accidental en el botón borra una hoja sin preguntar y no hay deshacer. Hay que confirmar que se acepta ese riesgo.
- **`version` de los hijos movidos.** Los hijos reparentados cambian `parent_id` y `sort_key`. ¿Hay que incrementarles `version` para que una edición concurrente con una versión vieja dé 409? Propongo que sí.
- **Espacio entre claves.** Generar k claves entre dos hermanos muy próximos puede alargar los `sort_key`. Hay que verificar que no se pase el `max_length=128` del esquema (no es una restricción de la base, pero sí de la API al hacer PATCH).
- **Dónde queda la selección después del reparent.** ¿En el primer hijo subido o en el padre? Propongo el primer hijo.
- **Nodos `collapsed` o del borde (+k, ADR 0011).** Sus hijos no están cargados, pero el reparent sigue funcionando en el servidor. El cliente se apoya en volver a pedir la ventana y no en una actualización optimista.
- **Forma del parámetro.** El pedido sugiere `?children=reparent`. Se elige `cascade|reparent` con `cascade` por defecto para no romper a los clientes actuales; cualquier otro nombre requiere confirmación.

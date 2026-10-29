<!-- antigravity · gemini-3.8-flash-high · familia google -->

Corriendo la suite completa de tests de la API y de la SPA...
Se verificaron y ampliaron los tests automatizados para cubrir cada uno de los 18 criterios de aceptación de la spec, incorporando casos borde y entradas inválidas (cancelación con Escape, recorte de espacios en títulos, clicks en indicadores del borde, navegación desde páginas de error, restricciones de selección con flechas en nodos colapsados o bordes, y payloads XSS adicionales).

No se modificó código de producción; todos los tests se ejecutaron con Vitest en [web/](file:///Users/negro/hworkspace/projects/mapa-mental/web) alcanzando un **99.43%** de cobertura de líneas (superando el umbral del 80%).

### Tabla de criterios, tests y resultados

| Criterio | Test | Archivo | Resultado |
| :--- | :--- | :--- | :--- |
| **1. Arranque con web** | `criterio_1: docker compose publica web solo en 127.0.0.1:5173 con proxy hacia la api` | [config.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/config.test.ts) | PASÓ |
| | `criterio_1: Vite escucha en 0.0.0.0:5173 y reenvía /api sin reescribir` | [config.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/config.test.ts) | PASÓ |
| | `criterio_1: se versiona pnpm-lock.yaml y no node_modules` | [config.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/config.test.ts) | PASÓ |
| **2. Cliente de la API** | `criterio_2: la mutación crear va a /api/ con X-CSRF: 1 y misma credencial de origen` | [client.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/api/client.test.ts) | PASÓ |
| | `criterio_2: la mutación editar va a /api/ con X-CSRF: 1 y misma credencial de origen` | [client.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/api/client.test.ts) | PASÓ |
| | `criterio_2: la mutación borrar va a /api/ con X-CSRF: 1 y misma credencial de origen` | [client.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/api/client.test.ts) | PASÓ |
| | `criterio_2: la mutación settings va a /api/ con X-CSRF: 1 y misma credencial de origen` | [client.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/api/client.test.ts) | PASÓ |
| | `criterio_2: la mutación logout va a /api/ con X-CSRF: 1 y misma credencial de origen` | [client.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/api/client.test.ts) | PASÓ |
| | `criterio_2: los GET no mandan X-CSRF` | [client.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/api/client.test.ts) | PASÓ |
| **3. Login** | `criterio_3: sin sesión, / muestra el login que lleva a /api/auth/login` | [session.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/session.test.tsx) | PASÓ |
| | `criterio_3: sin sesión, /n/x muestra el login que lleva a /api/auth/login` | [session.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/session.test.tsx) | PASÓ |
| | `criterio_3: un 401 posterior (sesión vencida) vuelve a la pantalla de login` | [session.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/session.test.tsx) | PASÓ |
| **4. Logout** | `criterio_4: Salir llama al logout con X-CSRF, vacía la caché y muestra el login` | [session.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/session.test.tsx) | PASÓ |
| **5. Foco en la URL** | `criterio_5: /n/X pide la ventana con la profundidad del usuario y dibuja X como foco` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_5: / usa root_node_id de /api/me` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_5: un 404 muestra "No encontrado" con enlace a /` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_5: un 422 (id que no es UUID) también muestra "No encontrado"` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_5: atrás en el historial vuelve al foco anterior desde la caché` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_5: click en "Volver al inicio" desde No encontrado navega a /` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| **6. Disposición horizontal** | `criterio_6: la x crece con el nivel y un mismo nivel comparte x` | [layout.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/map/layout.test.ts) | PASÓ |
| | `criterio_6: A queda encima de B y los subárboles no se superponen` | [layout.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/map/layout.test.ts) | PASÓ |
| | `criterio_6: un padre queda centrado entre sus hijos` | [layout.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/map/layout.test.ts) | PASÓ |
| | `criterio_6: hay una arista por cada par padre-hijo` | [layout.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/map/layout.test.ts) | PASÓ |
| **7. Doble click** | `criterio_7: doble click sobre un nodo que no es el foco navega a /n/<id>` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_7: doble click sobre el foco sube a su padre, o a / si el padre es la raíz` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_7: doble click sobre la raíz real no cambia la URL` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| **8. Miga de pan y teclado** | `criterio_8: la miga de pan muestra ancestros y foco en orden y enfoca al clickear` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_8: Enter enfoca el seleccionado y Retroceso hace lo mismo que el doble click` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| **9. Borde "+k"** | `criterio_9: el borde muestra +k, no dibuja el nivel siguiente y no se expande` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_9: un nodo del borde sin hijos no muestra indicador` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| | `criterio_9: click sobre el indicador +k del borde no lo expande en el lugar` | [navigation.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/navigation.test.tsx) | PASÓ |
| **10. Crear** | `criterio_10: Tab crea al instante un hijo en edición y al confirmar llama a POST` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_10: Enter confirma y crea un hermano con after_sort_key del nodo editado` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_10: un título vacío o con solo espacios no se envía` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_10: un título con espacios en los extremos se envía recortado` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_10: Escape durante la creación cancela el nuevo nodo sin llamar a la API` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| **11. Renombrar** | `criterio_11: F2 y confirmar llaman a PATCH con title y version; toma la nueva versión` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_11: el lápiz entra en edición` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_11: durante la edición Retroceso, Supr, Espacio y flechas actúan sobre el texto` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| **12. Colapsar** | `criterio_12: Espacio oculta los hijos y llama a PATCH; otra vez los muestra` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_12: una ventana con collapsed: true no dibuja esos hijos; expandir los pide` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| **13. Borrar** | `criterio_13: Supr pide confirmación con la cantidad de descendientes` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_13: si hay niveles sin cargar, la confirmación dice "al menos"` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_13: un nodo sin descendientes se borra sin confirmación` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_13: Supr sobre la raíz no hace nada` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| **14. Flechas** | `criterio_14: → primer hijo, ← padre, ↑ y ↓ hermanos; fuera de lo visible no cambia` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_14: flecha derecha sobre un nodo colapsado o del borde no cambia la selección` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| **15. Reversión optimista** | `criterio_15: un renombre con 409 vuelve al título anterior, avisa y vuelve a pedir la ventana` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_15: una creación con 5xx desaparece y avisa` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_15: un colapso con 422 vuelve a mostrar los hijos` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| | `criterio_15: un borrado con 5xx devuelve el nodo` | [editing.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/editing.test.tsx) | PASÓ |
| **16. Preferencia N** | `criterio_16: elegir 5 llama a PATCH /api/me/settings y pide view?depth=5 del foco` | [session.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/session.test.tsx) | PASÓ |
| | `criterio_16: si el PATCH falla vuelve al valor anterior y avisa` | [session.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/session.test.tsx) | PASÓ |
| **17. XSS y CSP** | `criterio_17: el servidor de la SPA manda Content-Security-Policy` | [config.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/config.test.ts) | PASÓ |
| | `criterio_17: un título con HTML se ve como texto en el lienzo y en la miga de pan` | [session.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/session.test.tsx) | PASÓ |
| | `criterio_17: payloads con <script> y <svg> no inyectan elementos en el DOM` | [session.test.tsx](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/session.test.tsx) | PASÓ |
| **18. Cobertura** | `criterio_18: la cobertura de líneas exige al menos 80%` | [config.test.ts](file:///Users/negro/hworkspace/projects/mapa-mental/web/src/config.test.ts) | PASÓ |

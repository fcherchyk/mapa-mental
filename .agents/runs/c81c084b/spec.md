<!-- claude-readonly · claude-opus-5-5 · familia anthropic -->

# Spec: Mapa mental, primer corte (frontend)

## 1. Contexto

El backend del primer corte ya está en `api/`, pero todavía no hay interfaz: hoy solo se puede probar el login entrando a `/api/auth/login` a mano. Esta corrida entrega la SPA en `web/`, para que una persona con cuenta de Google entre, vea su mapa en árbol horizontal y lo navegue y edite enfocando un nodo por vez. Cubre la parte "Interfaz" de la spec `7c6b3566` (criterios 15 a 24) y el arranque completo con `docker compose` (criterio 1).

## 2. Alcance

**Incluye**

- **Proyecto `web/`**: React + TypeScript en modo `strict`, Vite, `pnpm` con `pnpm-lock.yaml` versionado, ESLint y Prettier con su configuración por defecto (ADR 0001).
- **Cliente de la API tipado**, generado del OpenAPI de FastAPI (ADR 0001). Todas las llamadas van a rutas relativas `/api/...` con `credentials: 'same-origin'`. Toda mutación (`POST`, `PATCH`, `DELETE` y logout) manda el header `X-CSRF: 1`.
- **Rutas** con React Router: `/` (foco en la raíz, que sale de `GET /api/me` → `root_node_id`) y `/n/:nodeId` (ADR 0008).
- **Sesión**:
  - Si `GET /api/me` responde `401`, se muestra una pantalla de login con un botón que navega a `/api/auth/login` (navegación completa, no `fetch`).
  - Cualquier `401` posterior vuelve a esa pantalla.
  - Logout con `POST /api/auth/logout`.
- **Lienzo** con React Flow (`@xyflow/react`), con zoom y desplazamiento. La disposición en árbol horizontal se calcula en el cliente a partir de la ventana visible y no se guardan posiciones (ADR 0002 y 0003). `NodeRenderer` elige el componente según `kind`, que hoy es solo `idea`.
- **Ventana**: se pide con `GET /api/nodes/{id}/view?depth=N`. La caché se indexa por `(nodeId, N)` y se invalida cuando hay cambios (ADR 0012).
- **Navegación**:
  - Doble click en un nodo lo enfoca; en el foco, sube un nivel; en la raíz real no hace nada (ADR 0009).
  - Miga de pan.
  - Botones "atrás" y "adelante" del navegador.
  - Enter enfoca el nodo seleccionado y Retroceso sube un nivel.
- **Nodos del borde**: muestran "+k" con `child_count` y no se expanden en el lugar (ADR 0011).
- **Edición**:
  - Crear: Tab crea un hijo; Enter, mientras se edita un título, crea un hermano a continuación.
  - Renombrar con F2 o con el lápiz.
  - Colapsar y expandir con Espacio.
  - Borrar con Supr, con confirmación si el nodo tiene descendientes.
  - Las flechas mueven la selección.
  - Las actualizaciones son optimistas y se revierten si hay error.
- **`SettingsPanel`**: elige N entre 1 y 10 con `PATCH /api/me/settings` (ADR 0010).
- **Seguridad**: los títulos se renderizan siempre como texto, nunca con `dangerouslySetInnerHTML`, y las respuestas de la SPA llevan `Content-Security-Policy`.
- **Servicio `web` en `docker-compose.yml`**: Vite con proxy de `/api` hacia `api:8000`, `server.host` `0.0.0.0` dentro del contenedor y puerto publicado como `127.0.0.1:5173:5173` (ADR 0005).
- **Tests**: Vitest con `@vitest/coverage-v8` y `coverage.thresholds.lines: 80` en la configuración de Vitest. El `test_command` actual de `.agents/project.yaml` ya los corre cuando existe `web/`.
- **Documentación**: actualizar el README (funcionalidades, uso con `web` y estructura) y la wiki del proyecto.

**Queda afuera**

- Cambios al backend, salvo lo indispensable. Por ejemplo, un script para exportar `openapi.json` sin levantar el servidor; ver la pregunta 2.
- Arrastrar o reordenar nodos (corte 2): no hay interfaz para `sort_key`.
- Tipos de nodo distintos de `idea`, Drive, Picker e integraciones (cortes 2 a 4).
- Build de producción servida por otro servidor, PWA y deploy (corte 5).
- Tests end-to-end con navegador real o contra el backend real. Los tests de la SPA simulan la API.

## 3. Criterios de aceptación

Salvo el 1, cada criterio se verifica con Vitest y Testing Library sobre la API simulada. El nombre del test incluye `criterio_N`.

**Entorno**

1. **Arranque con `web`**
   - Dado un `.env` completado a partir de `.env.example`,
   - cuando se ejecuta `docker compose up --build`,
   - entonces `http://localhost:5173` sirve la SPA y `http://localhost:5173/api/me` llega al backend (`401` sin sesión).
   - `docker-compose.yml` publica `web` solo en `127.0.0.1:5173`.
   - El repo versiona `web/pnpm-lock.yaml` y no versiona `node_modules`.
   - Se verifica inspeccionando `docker-compose.yml` y `vite.config.ts` (test de configuración) y con el arranque manual.
2. **Cliente de la API**
   - Dada cualquier mutación del cliente (crear, editar, borrar, settings o logout),
   - cuando se envía,
   - entonces el pedido va a una ruta relativa que empieza con `/api/` y lleva el header `X-CSRF: 1`.
   - Los `GET` no lo necesitan.

**Sesión**

3. **Login**
   - Dado que `GET /api/me` responde `401`,
   - cuando carga la SPA en `/` o en `/n/X`,
   - entonces se muestra la pantalla de login, y su botón lleva a `/api/auth/login`.
   - Dado que una llamada posterior responde `401` (sesión vencida), se vuelve a esa pantalla.
4. **Logout**
   - Dado un usuario con sesión,
   - cuando pulsa "Salir",
   - entonces se llama a `POST /api/auth/logout` con `X-CSRF: 1`, se vacía la caché de ventanas y se muestra la pantalla de login.

**Navegación**

5. **Foco en la URL**
   - Dada la ruta `/n/X`, se pide `GET /api/nodes/X/view?depth=<settings.depth>` y X se dibuja como foco.
   - `/` usa `root_node_id` de `/api/me`.
   - Si la API responde `404` (nodo ajeno o inexistente) o `422` (id que no es UUID), se muestra "No encontrado" con un enlace a `/`.
   - Al navegar hacia atrás en el historial se muestra de nuevo el foco anterior, servido desde la caché sin un segundo `GET`.
6. **Disposición en árbol horizontal**
   - Dada una ventana con foco F, hijos A y B (en ese `sort_key`) y nietos de A,
   - cuando se calcula la disposición,
   - entonces la `x` crece con el nivel, todos los nodos de un mismo nivel comparten `x`, A queda encima de B, los subárboles no se superponen y hay una arista por cada par padre-hijo.
   - Se prueba sobre la función pura de disposición.
7. **Doble click**
   - Doble click sobre un nodo que no es el foco navega a `/n/<id>`.
   - Doble click sobre el foco navega a su padre: el último de `ancestors`, o `/` si el padre es la raíz.
   - Doble click sobre la raíz real no cambia la URL.
8. **Miga de pan y teclado de navegación**
   - Dado un foco a 3 niveles de la raíz, la miga de pan muestra los `ancestors` y el foco, en orden; clickear un ancestro lo enfoca.
   - Fuera de edición, Enter enfoca el nodo seleccionado y Retroceso hace lo mismo que el doble click sobre el foco.
9. **Borde "+k"**
   - Dados N = 2 y un nodo de nivel 2 con `child_count = 4`,
   - cuando se dibuja,
   - entonces ese nodo muestra "+4", no hay nodos de nivel 3 y ni Espacio ni un click lo expanden en el lugar.
   - Un nodo del borde con `child_count = 0` no muestra indicador.

**Edición**

10. **Crear**
    - Dado un nodo seleccionado,
    - cuando se pulsa Tab,
    - entonces aparece al instante un hijo en edición. Al confirmar el título se llama a `POST /api/nodes/{id}/children` con `{title}`.
    - Enter, durante la edición, confirma y crea un hermano con `after_sort_key` igual al `sort_key` del nodo editado.
    - Un título vacío o con solo espacios no se envía.
11. **Renombrar**
    - Dado un nodo con `version = v`,
    - cuando se entra en edición con F2 o con el lápiz y se confirma un título nuevo,
    - entonces se llama a `PATCH /api/nodes/{id}` con `{title, version: v}` y el nodo toma la `version` que devuelve el servidor.
    - Mientras se edita, Retroceso, Supr, Espacio y las flechas actúan sobre el texto y no sobre el mapa.
12. **Colapsar**
    - Dado un nodo seleccionado con hijos dentro de la ventana,
    - cuando se pulsa Espacio,
    - entonces sus hijos dejan de dibujarse y se llama a `PATCH` con `{collapsed: true, version}`.
    - Volver a pulsar Espacio llama con `collapsed: false`.
    - Una ventana que llega con `collapsed: true` no dibuja los hijos de ese nodo.
13. **Borrar**
    - Dado un nodo con 7 descendientes visibles o contados,
    - cuando se pulsa Supr,
    - entonces aparece una confirmación que menciona "7", y solo al aceptar se llama a `DELETE /api/nodes/{id}`.
    - Un nodo sin descendientes se borra sin confirmación.
    - Supr sobre la raíz no hace nada.
14. **Selección con flechas**
    - Dada una ventana dibujada,
    - cuando se pulsan las flechas,
    - entonces → va al primer hijo visible, ← al padre, y ↑ y ↓ al hermano anterior y al siguiente.
    - Fuera de los nodos visibles la selección no cambia.
15. **Optimista con reversión**
    - Dada una creación, un renombre, un colapso o un borrado,
    - cuando la API responde `409`, `422` o `5xx`,
    - entonces la interfaz vuelve al estado anterior, se ve un aviso y la siguiente lectura de esa ventana vuelve a pedirse al servidor.

**Preferencias y seguridad**

16. **Preferencia N**
    - Dado el `SettingsPanel` con N = 3,
    - cuando el usuario elige 5,
    - entonces se llama a `PATCH /api/me/settings` con `{depth: 5}` y se pide `view?depth=5` del foco actual.
    - El selector solo ofrece valores de 1 a 10.
17. **XSS y CSP**
    - Dado un título `<img src=x onerror=alert(1)>`,
    - cuando se dibuja en el lienzo y en la miga de pan,
    - entonces se ve como texto literal y el DOM no contiene ningún `<img>` generado por él.
    - La configuración de Vite define un header `Content-Security-Policy` en las respuestas del servidor de la SPA.
18. **Cobertura**
    - Cuando se corre `pnpm --dir web exec vitest run --coverage`,
    - entonces falla si la cobertura de líneas queda por debajo del 80%.

## 4. Riesgos y preguntas abiertas

1. **CSP contra el servidor de desarrollo de Vite.** El ADR 0005 sirve la SPA con Vite en modo desarrollo. React Refresh inyecta un script en línea y el HMR usa WebSocket, así que una CSP estricta (`script-src 'self'`) rompe el desarrollo. Propuesta: `default-src 'self'`, `connect-src 'self' ws://localhost:5173`, sin `unsafe-eval`, y aceptar `'unsafe-inline'` solo en `script-src` para desarrollo, o bien desactivar React Refresh. Hay que confirmar cuál se acepta.
2. **Generación del cliente desde el OpenAPI (ADR 0001).**
   - Hace falta una herramienta, por ejemplo `openapi-typescript` (solo tipos) más un `fetch` propio, u `openapi-fetch`, y elegirla suma una dependencia.
   - Hay que decidir si `openapi.json` se exporta con un script nuevo en `api/` (cambio "indispensable" del backend) o se baja de `/openapi.json` con la API levantada.
   - También hay que decidir si el cliente generado se versiona y si queda fuera de la cobertura.
3. **Dependencias para la caché y la disposición.** Para la caché por `(nodeId, N)` y las actualizaciones optimistas se puede usar TanStack Query o un store propio. Para el árbol, una disposición propia o `d3-hierarchy`/`dagre`. El estándar prefiere no sumar dependencias, pero un layout propio agrega código para testear. Hay que decidir.
4. **Simulación de la API en los tests.** Se puede usar MSW (otra dependencia) o un `fetch` falso propio. React Flow necesita `ResizeObserver` y medidas del DOM que jsdom no tiene, así que hay que simularlas o probar la disposición y los handlers por separado.
5. **pnpm dentro de Docker.**
   - Los `node_modules` de la Mac (darwin/arm64) no sirven en el contenedor (linux), así que hace falta un volumen propio para `web/node_modules`.
   - pnpm no corre scripts de instalación sin aprobación. Hay que verificar que `esbuild` funciona con su binario opcional sin `postinstall`; si no, aprobarlo explícitamente en `package.json` (`pnpm.onlyBuiltDependencies`).
   - Falta fijar la versión de Node y de pnpm (con `corepack` y `packageManager`).
6. **Proxy y cookie.**
   - El callback de Google vuelve a `http://localhost:5173/api/auth/callback`, que ya es el valor por defecto de `GOOGLE_REDIRECT_URI`, y `POST_LOGIN_REDIRECT=/` deja al usuario en la SPA.
   - El proxy tiene que reenviar los `Set-Cookie` sin reescribir el dominio y no cambiar el `Host` de forma que rompa la cookie firmada del flujo de Authlib. Hay que verificarlo en el arranque manual.
   - El README tiene que indicar que hay que registrar ese redirect URI en Google.
7. **Selección después de borrar o de cambiar el foco** (pregunta 10 de la spec original, sin resolver). Propuesta: después de borrar queda seleccionado el hermano anterior o, si no hay, el padre; al cambiar el foco queda seleccionado el foco.
8. **Espacio sobre un nodo colapsado o del borde** (pregunta 9 de la spec original). Propuesta: un nodo colapsado dentro de la ventana muestra "+k" con un estilo distinto al del borde, y Espacio sobre un nodo del borde no hace nada.
9. **Conflicto `409`** (pregunta 8 de la spec original). Esta spec asume revertir, avisar y volver a pedir la ventana, sin ofrecer reintento. Hay que confirmarlo.
10. **Contador de descendientes para la confirmación de borrado.** La ventana trae `child_count` (solo hijos directos), no el total de descendientes. Para mostrar "7", el cliente solo puede sumar lo visible más el `child_count` de los nodos del borde, que no cuenta los niveles más profundos. Para dar el número exacto hace falta un dato nuevo en la API, como `descendant_count`, que sería un cambio de backend. Hay que decidir si alcanza con el número aproximado ("al menos 7") o si se suma el campo.
11. **Atajos de teclado y el pedido.** El pedido nombra crear, editar, colapsar y borrar, pero no los atajos. Esta spec los incluye porque forman parte del ADR 0009 y de la spec original (criterio 20). Si se prefiere achicar el alcance, los criterios 8 (teclado), 11 (Retroceso, Supr y Espacio durante la edición) y 14 pasan a la corrida siguiente.
12. **Avatar del usuario.** `avatar_url` apunta a `lh3.googleusercontent.com`. Si se muestra, la CSP necesita `img-src` con ese dominio; si no, queda afuera.

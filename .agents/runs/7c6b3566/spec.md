<!-- claude-readonly · claude-opus-5-5 · familia anthropic -->

# Spec: Mapa mental, primer corte

## 1. Contexto

Una persona con cuenta de Google quiere armar su mapa mental de ideas y recorrerlo sin perderse. Así puede crear ideas, organizarlas en árbol y navegarlas enfocando un nodo por vez, sin ver el mapa entero. Este corte entrega la base: login, un único mapa por usuario, nodos "idea" con título, una ventana de N niveles y persistencia. Todo corre en local con `docker compose`, y el modelo y la API quedan preparados para tipos de nodo e integraciones futuras (ADR 0013).

## 2. Alcance

**Incluye**
- **Entorno local** con `docker compose up` y tres servicios: `db` (PostgreSQL 16 con volumen), `api` (FastAPI, Python 3.12) y `web` (Vite con proxy de `/api`, mismo origen `localhost:5173`). Los puertos se publican solo en `127.0.0.1` y el repo trae `.env.example` (ADR 0005).
- **Login con Google** con el patrón BFF: Authorization Code con Authlib, `state` y `nonce`, cookie de sesión `HttpOnly` y `SameSite=Lax`, y `Secure` configurable por variable de entorno. Se piden solo los scopes `openid email profile`. Incluye logout y `GET /me` (ADR 0006 y 0007).
- **Protección CSRF**: toda mutación exige un header propio.
- **Primer login**: crea `users`, `maps` (con `owner_id` único) y el nodo raíz, que lleva el nombre del usuario (ADR 0008).
- **API de nodos**:
  - `GET /nodes/{id}/view?depth=N`
  - `POST /nodes/{id}/children`
  - `PATCH /nodes/{id}`, que cambia `title`, `collapsed` o `sort_key` y exige `version`
  - `DELETE /nodes/{id}`, que borra el subárbol entero
- **Preferencias**: `PATCH /me/settings` con `depth` entre 1 y 10, por defecto 3 (ADR 0010).
- **SPA** con React Flow, disposición automática en árbol horizontal, zoom y desplazamiento (ADR 0002 y 0003).
  - Rutas `/` y `/n/:nodeId` con React Router.
  - Miga de pan.
  - Indicador "+k" en los nodos del borde (ADR 0011).
  - `SettingsPanel` para elegir N.
- **Navegación**: doble click en un nodo lo enfoca y doble click en el foco sube un nivel. También se navega con Enter, Retroceso, la miga de pan y el botón "atrás" del navegador (ADR 0009).
- **Edición**:
  - Tab crea un hijo y Enter, mientras se edita un título, crea un hermano.
  - Las flechas mueven la selección y Espacio colapsa o expande.
  - F2 o el lápiz renombran.
  - Supr borra y pide confirmación si el nodo tiene descendientes.
- **Estado del cliente**: actualizaciones optimistas y una caché de ventanas por `(nodeId, N)` que se invalida cuando hay cambios.
- **Registro de tipos** `node_types` con un solo tipo, `idea`, y validación de `props` por `kind`.
- **Cliente de la API** tipado, generado a partir del OpenAPI.
- **Seguridad**:
  - Todas las consultas filtran por `maps.owner_id`, para evitar IDOR.
  - Hay una CSP.
  - Los títulos se renderizan siempre como texto, nunca como HTML.
- **Tests**: pytest con httpx en el backend y Vitest en el frontend.

**Queda afuera**
- Mover o reordenar nodos arrastrando (corte 2). `sort_key` existe en el modelo, pero no hay interfaz para cambiarlo.
- Acceso a Drive, Google Picker, `oauth_grants`, `external_refs` y `TOKEN_ENCRYPTION_KEY` (corte 2). El login **no** da acceso a Drive, que es la desviación del pedido original aceptada en el ADR 0007.
- Tipos de nodo distintos de `idea` e integraciones con Calendar, Trello o GitHub (cortes 3 y 4).
- Varios mapas por usuario, mapas compartidos y enlaces entre ramas (`edges`).
- Deploy fuera de local, PWA y app móvil (corte 5).

## 3. Criterios de aceptación

**Entorno y login**

1. **Arranque**
   - Dado un `.env` completado a partir de `.env.example`,
   - cuando se ejecuta `docker compose up`,
   - entonces la app responde en `http://localhost:5173`, `/api` llega al backend, los puertos solo escuchan en `127.0.0.1` y no hay secretos en el repositorio.
2. **Primer login**
   - Dado un usuario de Google que nunca entró,
   - cuando completa el login,
   - entonces se crean un `user`, un `map` y un nodo raíz `kind='idea'` con el nombre del usuario como título, y `GET /me` devuelve `root_node_id` y `settings.depth = 3`.
   - Si el mismo usuario vuelve a entrar, no se crea un segundo mapa.
3. **Scopes y `state`**
   - Dado el inicio del login,
   - cuando el backend redirige a Google,
   - entonces la URL pide exactamente los scopes `openid email profile` e incluye `state` y `nonce`.
   - Si el callback llega con un `state` inválido, se rechaza sin crear sesión.
4. **Cookie y tokens**
   - Dado un login exitoso,
   - cuando se inspecciona la respuesta,
   - entonces la cookie de sesión es `HttpOnly` y `SameSite=Lax`, y lleva `Secure` cuando la variable de entorno lo indica.
   - Ninguna respuesta de la API incluye tokens de Google y la base no los guarda.
5. **Sin sesión**
   - Dado un pedido sin cookie válida o con la sesión vencida,
   - cuando se llama a cualquier endpoint salvo los de login,
   - entonces responde `401` y la SPA muestra la pantalla de login.
6. **CSRF**
   - Dado un usuario con sesión,
   - cuando hace un `POST`, `PATCH` o `DELETE` sin el header anti-CSRF,
   - entonces responde `403` y no cambia nada.
7. **Logout**
   - Dado un usuario con sesión,
   - cuando hace logout,
   - entonces la sesión se invalida en `sessions` y reusar esa cookie da `401`.

**API de nodos**

8. **Ventana visible**
   - Dado un árbol de 5 niveles bajo el foco F,
   - cuando se pide `GET /nodes/F/view?depth=2`,
   - entonces la respuesta trae `focus`, los `ancestors` en orden de la raíz a F y los `nodes` de los niveles 1 y 2 ordenados por `sort_key`, cada uno con su `child_count` correcto.
   - Si un nodo está `collapsed` dentro de la ventana, sus hijos no vienen, pero conserva su `child_count`.
9. **Profundidad**
   - Si se pide `GET /nodes/{id}/view` sin `depth`, se usa `settings.depth` del usuario.
   - Si se pide con `depth=0` o `depth=11`, responde `422`.
   - `PATCH /me/settings` con `depth` fuera de 1 a 10 responde `422`.
10. **Aislamiento (IDOR)**
    - Dados un usuario A y un nodo del mapa de un usuario B,
    - cuando A llama a `view`, `children`, `PATCH` o `DELETE` sobre ese nodo,
    - entonces la respuesta es `404` y no cambia nada (ver la pregunta 4).
11. **Crear**
    - Dado un nodo P con hijos H1 y H2,
    - cuando se llama a `POST /nodes/P/children` con `{title, after_sort_key: H1.sort_key}`,
    - entonces el nuevo nodo queda entre H1 y H2 en la siguiente `view`.
    - Sin `after_sort_key`, queda último.
    - Un título vacío o con solo espacios responde `422`.
12. **Editar con versión**
    - Dado un nodo con `version = v`,
    - cuando llega un `PATCH` con `version = v`, el cambio se aplica y devuelve `version = v+1`.
    - Cuando llega un `PATCH` con `version = v-1`, responde `409` y no cambia nada.
13. **Borrar**
    - Dado un nodo con descendientes,
    - cuando se llama a `DELETE`,
    - entonces se borra el subárbol entero.
    - `DELETE` sobre la raíz del mapa responde `422`.
14. **Tipos de nodo**
    - Dado un `POST` o `PATCH` que manda un `kind` distinto de `idea`, o un `props` que no cumple el esquema de `idea`,
    - cuando se procesa,
    - entonces responde `422`.

**Interfaz**

15. **Foco en la URL**
    - Dado el usuario en `/n/X`,
    - cuando recarga la página o usa "atrás" o "adelante",
    - entonces se muestra el foco que indica la URL.
    - `/` muestra la raíz.
    - `/n/<id inexistente o ajeno>` muestra un mensaje de "no encontrado" con un enlace a la raíz.
16. **Doble click**
    - Doble click sobre un nodo que no es el foco navega a `/n/<id>`.
    - Doble click sobre el foco navega a su padre.
    - Doble click sobre la raíz real no cambia la URL.
17. **Miga de pan**
    - Dado un foco a 3 niveles de la raíz,
    - cuando se mira la miga de pan,
    - entonces muestra raíz › … › foco, y clickear un ancestro lo enfoca.
18. **Borde "+k"**
    - Dado N = 2 y un nodo del nivel 2 con 4 hijos,
    - cuando se dibuja la ventana,
    - entonces ese nodo muestra "+4", sus hijos no se dibujan y no se puede expandir en el lugar.
    - Los nodos del borde sin hijos no muestran indicador.
19. **Colapsar**
    - Dado un nodo seleccionado con hijos, dentro de la ventana,
    - cuando se pulsa Espacio,
    - entonces sus hijos se ocultan y `collapsed` queda guardado, así que sigue colapsado después de recargar.
    - Volver a pulsar Espacio lo expande.
20. **Teclado**
    - Tab crea un hijo del nodo seleccionado y entra en edición.
    - Enter, mientras se edita, confirma y crea un hermano a continuación.
    - F2 o el lápiz entran en edición del título.
    - Las flechas mueven la selección entre nodos visibles.
    - Fuera de edición, Enter enfoca el seleccionado y Retroceso sube un nivel.
    - Mientras se edita, Retroceso, Supr y Espacio actúan sobre el texto.
21. **Borrado con confirmación**
    - Dado un nodo con 7 descendientes,
    - cuando se pulsa Supr,
    - entonces aparece una confirmación que menciona "7", y solo al aceptar se llama a `DELETE`.
    - Un nodo sin descendientes se borra sin confirmación.
22. **Preferencia N**
    - Dado el `SettingsPanel`,
    - cuando el usuario cambia N a 5,
    - entonces se llama a `PATCH /me/settings`, la vista pasa a mostrar 5 niveles y el valor se mantiene en una sesión nueva.
23. **Optimista con reversión**
    - Dada una creación, un renombre, un colapso o un borrado,
    - cuando la API responde con error (`409`, `422` o `5xx`),
    - entonces la interfaz vuelve al estado anterior, muestra un aviso y la caché de esa ventana queda invalidada.
24. **XSS**
    - Dado un título `<img src=x onerror=alert(1)>`,
    - cuando se dibuja,
    - entonces se ve como texto literal y no ejecuta nada.
    - Las respuestas de la SPA llevan un header `Content-Security-Policy`.

## 4. Riesgos y preguntas abiertas

1. **Decisión 14 pendiente.** No está resuelto si "auth web con BFF y cookie `HttpOnly`" y "scopes mínimos con autorización incremental" pasan a estándar del workspace. La spec no cambia, pero falta el gate.
2. **Borrar la cuenta.** La arquitectura menciona un endpoint para borrar la cuenta con todos sus datos, pero la lista del primer corte no lo incluye. ¿Entra en este corte? Si entra, se agrega un criterio: después de `DELETE /me` no quedan filas del usuario en `users`, `sessions`, `maps` ni `nodes`.
3. **Script de backup con `pg_dump`.** No está claro si es parte del primer corte o solo una recomendación.
4. **Código para nodos ajenos.** El criterio 10 asume `404` para no revelar que el nodo existe. Hay que confirmar que no se prefiere `403`.
5. **Límites del título.** No hay largo máximo definido. Hay que fijarlo, por ejemplo 200 caracteres, y decidir si se recortan los espacios.
6. **Duración de la sesión.** No están definidos el tiempo de expiración, si es deslizante ni cuánto se guardan las sesiones vencidas.
7. **Nombre del header anti-CSRF.** No está definido, por ejemplo `X-Requested-With` o `X-CSRF: 1`.
8. **Conflicto `409` en la interfaz.** ¿Alcanza con revertir y recargar la ventana, o hay que mostrar la versión del servidor y permitir reintentar? Con un solo usuario es poco probable, pero puede pasar con dos pestañas abiertas.
9. **Espacio sobre un nodo del borde o colapsado.** ¿Qué hace Espacio sobre un nodo "+k"? Propuesta: nada. ¿Un nodo colapsado dentro de la ventana también muestra "+k"? Propuesta: sí, distinguido visualmente.
10. **Selección después de borrar o subir.** No está definido qué nodo queda seleccionado después de un borrado o al cambiar el foco.
11. **Modo *Testing* de Google.** Solo pueden entrar los usuarios de prueba dados de alta en la consola. Hay que documentar ese paso en el README; si no, el criterio 2 falla para cualquier otra cuenta.
12. **Rendimiento de la ventana.** No hay un objetivo de latencia ni un tamaño de árbol de referencia para probar la CTE con `depth = 10`. Propuesta: un test con un árbol sintético de unos 10.000 nodos y un umbral a acordar.

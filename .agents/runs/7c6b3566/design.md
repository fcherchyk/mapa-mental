<!-- claude-readonly · claude-opus-5-5 · familia anthropic -->

## Decisiones abiertas

Queda una sola. Es la 14, que en el mensaje anterior te llegó cortada.

**14. ¿Pasamos a `codigo.md` las decisiones 6A y 7A?** `[candidata a estándar]`
- A) Sí. Se agregan dos reglas: "Auth web: el backend hace el OAuth y el navegador solo recibe una cookie `HttpOnly`" y "OAuth: scopes mínimos y autorización incremental".
- B) No. Quedan solo para este proyecto.
- **Recomiendo A**, porque cualquier proyecto que integre Google, Trello o GitHub va a repetir esta misma discusión.

Si respondés la 14, la arquitectura queda lista para aprobar.

## Resumen

Es una aplicación web para que una persona con cuenta de Google arme su mapa mental, que es uno solo: crea ideas, las organiza en árbol y navega enfocando nodos. El doble click convierte un nodo en la raíz visible y la pantalla muestra como mucho N niveles hacia abajo. N lo elige cada usuario y por defecto es 3. El primer corte solo tiene nodos "idea" con título y corre en local con docker compose. El modelo y la API ya contemplan que un nodo pueda ser más adelante un documento de Drive, una planilla, un evento, una tarea o un repositorio, y que una app móvil use el mismo backend.

## Componentes

```
[SPA React/TS (Vite)] --HTTP local + cookie de sesión--> [API FastAPI] --> [PostgreSQL]
                                                               |
                                                               +--> Google OAuth (login)
                                                               +--> (futuro) Drive / Calendar / Trello / GitHub
```

- **Entorno local (docker compose)**: tres servicios.
  - `db`: PostgreSQL 16 con volumen persistente.
  - `api`: FastAPI con recarga en caliente.
  - `web`: Vite, que redirige `/api` al backend. Todo sale del mismo origen (`localhost:5173`), así que no hace falta CORS.
- **Frontend (SPA)**
  - **Rutas**: `/` muestra la raíz y `/n/:nodeId` muestra un nodo enfocado. Como el foco vive en la URL, funcionan el botón "atrás", los enlaces y la recarga de la página.
  - **`FocusView`**: pide al servidor la ventana del foco actual y la dibuja (decisión 13A).
  - **`MapCanvas`**: React Flow. La disposición en árbol horizontal se calcula en el cliente sobre la ventana visible.
  - **`Breadcrumb`**: muestra raíz › … › foco y cada ancestro se puede clickear.
  - **`NodeRenderer`**: elige el componente según `kind`. En el primer corte solo existe `IdeaNode`. Los nodos del borde muestran "+k", la cantidad de hijos directos ocultos, y no se pueden expandir (12A).
  - **`SettingsPanel`**: un control de N entre 1 y 10 que guarda en `PATCH /me/settings` (11A).
  - **Navegación (10A)**:
    - Doble click en un nodo lo enfoca.
    - Doble click en el nodo que ya es foco sube un nivel. En la raíz real no hace nada.
    - Atajos que no reemplazan al doble click: la miga de pan, el botón "atrás", Enter para enfocar y Retroceso para subir.
  - **Edición**:
    - Tab crea un hijo.
    - Enter, mientras se edita, crea un hermano.
    - Las flechas mueven la selección.
    - Espacio colapsa o expande.
    - F2 o el ícono de lápiz renombra.
    - Supr borra.
  - **Estado**: `useReducer`, actualizaciones optimistas y una caché de ventanas por `(nodeId, N)` que se invalida cuando hay cambios.
  - **Cliente de la API**: tipado, generado a partir del OpenAPI de FastAPI.
- **Backend (FastAPI, Python 3.12)**
  - `auth`: login, callback de OAuth, logout y `/me`.
  - `nodes`: servicio y repositorio del árbol. Incluye la consulta de la ventana, una CTE recursiva con profundidad máxima `depth`.
  - `settings`: preferencias del usuario, validadas con Pydantic (`depth` entre 1 y 10).
  - `node_types`: registro de tipos de nodo, cada uno con su esquema Pydantic para `props`. En el primer corte solo está `idea`.
  - `integrations`: vacío en el primer corte. Va a tener una interfaz `Provider` por servicio externo.
  - Persistencia con SQLAlchemy 2 y migraciones con Alembic.
- **API REST**
  - `GET /me` devuelve el usuario, sus `settings` y el `root_node_id`.
  - `PATCH /me/settings` recibe `{ depth }`.
  - `GET /nodes/{id}/view?depth=N` devuelve `{ focus, ancestors[], nodes[] }`.
    - Cada nodo trae `child_count`.
    - Si no viene `depth`, usa el del usuario.
  - `POST /nodes/{id}/children` recibe `{ title, after_sort_key? }`.
  - `PATCH /nodes/{id}` cambia `title`, `collapsed` o `sort_key` y exige `version`. Si la versión es vieja, responde `409`.
  - `DELETE /nodes/{id}` borra el nodo con todo su subárbol. La raíz no se puede borrar (`422`).

## Modelo de datos

- **users**: `id` (uuid), `google_sub` (único), `email`, `name`, `avatar_url`, `settings` (jsonb, `{"depth": 3}`), `created_at`.
- **sessions**: `id` (hash de un token aleatorio), `user_id`, `expires_at`, `created_at`.
- **maps**: `id`, `owner_id` (**único**), `root_node_id`, `created_at`.
  - Se crea en el primer login, junto con su nodo raíz, que lleva el nombre del usuario y se puede renombrar.
  - La tabla existe aunque cada usuario tenga un solo mapa: pasar a varios mapas o a mapas compartidos es quitar el `unique`, sin migrar datos.
- **nodes**:
  - `id` (uuid), `map_id` y `parent_id` (vacío solo en la raíz).
  - `kind` (texto, hoy `'idea'`) y `title`.
  - `sort_key` (texto con índice fraccionario).
  - `collapsed` (booleano).
  - `props` (jsonb, `{}`).
  - `version`, `created_at` y `updated_at`.
  - Índices: `(map_id)` y `(parent_id, sort_key)`. El segundo lo usan la CTE de la ventana y el cálculo de `child_count`.

**Cómo se combinan colapsar y la profundidad**: `collapsed` se guarda por nodo y se respeta dentro de la ventana. Si un nodo colapsado está dentro de los N niveles, igual oculta sus hijos. Los nodos que quedan en el nivel N muestran "+k" y para ver lo que hay debajo hay que enfocarlos.

**Cómo crece sin migraciones dolorosas**:
- `kind` es texto y no un enum de la base: un tipo nuevo es un valor nuevo más su esquema de validación.
- Los datos propios de cada tipo van en `props` y se validan según `kind`.
- En el corte 2 se suman dos tablas:
  - **external_refs**: `node_id`, `provider`, `external_id`, `url`, `metadata` (jsonb), `synced_at`.
  - **oauth_grants**: `user_id`, `provider`, `scopes`, `refresh_token_enc`, `updated_at`.
- Si más adelante hacen falta enlaces entre ramas, se agrega una tabla `edges` sin tocar `nodes`.

## Integraciones

- **Google OAuth 2.0 (6A)**: flujo Authorization Code del lado del servidor, con Authlib.
  - Redirección a `http://localhost:5173/api/auth/callback`.
  - La app queda en modo *Testing*: hay que dar de alta a los usuarios de prueba y no hace falta verificarla.
  - En modo *Testing* los refresh tokens vencen a los 7 días. Esto recién afecta al corte 2.
- **Scopes (7A)**:
  - En el primer corte se piden solo `openid email profile`.
  - El acceso a Drive (`drive.file`) se pide de forma incremental en el corte 2, cuando el usuario crea su primer nodo documento.
  - Esto se aparta a propósito del pedido original de dar acceso a Drive en el login, como elegiste en la 7.
- **Corte 2**: Google Picker con `drive.file`.
- **Más adelante**: Calendar, Trello y GitHub. Cada uno usa su propio OAuth, pedido al conectar el servicio, y guarda su fila en `oauth_grants`.

## Seguridad y datos

- **Datos**: viven en el PostgreSQL local, en un volumen de docker. De Google solo se guarda la identidad: `sub`, email y nombre.
- **Secretos**: van en un `.env` que está en `.gitignore`. El repo trae un `.env.example`.
  - Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` y `DATABASE_URL`.
  - Desde el corte 2 se suma `TOKEN_ENCRYPTION_KEY`.
- **Tokens**: el primer corte no guarda tokens de Google. Desde el corte 2, los refresh tokens se cifran con Fernet y nunca llegan al navegador.
- **Sesión**:
  - Cookie `HttpOnly` con `SameSite=Lax`. El atributo `Secure` se configura por variable de entorno.
  - Las mutaciones exigen un header propio, como defensa contra CSRF.
  - El flujo OAuth usa `state` y `nonce`.
- **Riesgos**:
  - **IDOR** (acceso a nodos ajenos): toda consulta de nodos hace join con `maps.owner_id = usuario`. Hay tests específicos, incluido `/view` sobre un nodo ajeno.
  - **Consultas caras**: `depth` está limitado entre 1 y 10 y la CTE tiene un tope de profundidad.
  - **XSS**: React escapa los títulos, nunca se renderiza HTML del usuario y hay una CSP.
  - **Pérdida de datos**: un script con `pg_dump` permite hacer backups manuales.
  - **Borrados masivos**: si el nodo tiene descendientes, se pide confirmación indicando cuántos se van a borrar.
  - **Exposición**: los puertos se publican solo en `127.0.0.1`.
- **Privacidad**: hay un endpoint para borrar la cuenta con todos sus datos.

## Cortes de entrega

1. **Primer corte** (corre con `docker compose up`):
   - login con Google y un mapa único con su raíz;
   - crear, renombrar y borrar ideas, y colapsarlas o expandirlas;
   - navegación por foco: doble click, miga de pan, URL y teclado;
   - ventana de N niveles con el indicador "+k" y N configurable por usuario;
   - zoom y desplazamiento;
   - persistencia en PostgreSQL.
2. Mover y reordenar nodos arrastrando, y nodo "documento de Drive" con Picker y `drive.file` pedido de forma incremental.
3. Nodos planilla y evento de calendario, con vista previa y metadatos en caché.
4. Nodos tarea y proyecto, con integraciones a Trello y GitHub.
5. Deploy fuera de local y app móvil sobre la misma API, empezando por una PWA.

## Decisiones tomadas

- **1A. FastAPI con una SPA en React/TypeScript (Vite)** (tu respuesta). Pasa a estándar por la 9A.
- **2A. Lienzo con React Flow** (tu respuesta).
- **3A. Disposición automática en árbol horizontal** (tu respuesta). Se calcula sobre la ventana visible.
- **4A. PostgreSQL** (tu respuesta). Pasa a estándar por la 9A.
- **5C. Todo en local con docker compose** (tu respuesta). Los secretos van en `.env`.
- **6A. El backend hace el OAuth (patrón BFF) y el navegador recibe una cookie `HttpOnly`** (tu respuesta). Los tokens quedan fuera del alcance de un XSS y la app móvil puede reutilizar el mismo backend.
- **7A. Scopes mínimos y Drive con autorización incremental en el corte 2** (tu respuesta).
- **8. Un solo mapa por usuario, con navegación por foco y como mucho N niveles visibles** (tu respuesta). A los niveles más profundos solo se llega navegando.
- **9A. Pasar a `codigo.md` dos estándares: "Web: API Python (FastAPI) + SPA TypeScript/React (Vite)" y "Base de datos por defecto: PostgreSQL"** (tu respuesta). Todavía falta aplicarlo en `codigo.md`, porque mi rol no modifica archivos.
- **10A. Doble click en un nodo lo enfoca; doble click en el foco sube un nivel; en la raíz no hace nada** (tu respuesta). Se suman la miga de pan, el botón "atrás" y atajos de teclado. Renombrar pasa a F2 o al lápiz.
- **11A. N es una preferencia de cada usuario, guardada en `users.settings`** (tu respuesta). Va de 1 a 10 y por defecto es 3.
- **12A. Los nodos del borde muestran "+k" con la cantidad de hijos directos ocultos y no se pueden expandir** (tu respuesta).
- **13A. El servidor manda solo la ventana visible: foco, N niveles hacia abajo, ancestros y `child_count`** (tu respuesta). El cliente guarda en caché las ventanas que ya visitó.
- **Backend en Python 3.12+** (estándar).
- **Código y nombres en inglés; comentarios y documentación en español** (estándar).
- **Tests en cada cambio de comportamiento** (estándar): pytest con httpx en el backend y Vitest en el frontend.
- **Secretos solo en variables de entorno** (estándar).
- **Dependencias justificadas** (estándar):
  - FastAPI, SQLAlchemy/Alembic y Authlib en el backend.
  - React Flow y React Router en el frontend. React Router hace falta para que el foco viva en la URL.
  - `cryptography` desde el corte 2, para cifrar los refresh tokens.
- **Web primero, con la API separada del frontend** (pedido).
- **Login con Google** (pedido).
- **Nodos con `kind` y `props`, y referencias externas en una tabla aparte** (pedido).

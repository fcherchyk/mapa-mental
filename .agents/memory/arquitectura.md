# Arquitectura inicial: mapa mental

## Decisiones abiertas

Tu respuesta sobre la decisión 8 (un mapa por usuario, con navegación por foco y N niveles visibles) abrió las preguntas 10 a 13. La 14 viene de que aprobaste la 6 y la 7.

**10. ¿Qué hace exactamente el doble click?**
- A) Doble click en cualquier nodo lo convierte en la raíz visible (el foco). Doble click en el nodo que ya es foco sube un nivel; en la raíz real no hace nada. Al ser predecible, renombrar pasa a F2 o al ícono de lápiz.
- B) Doble click en un nodo lo enfoca y doble click en el fondo del lienzo sube un nivel. No tiene conflicto con el nodo, pero el fondo es un blanco poco visible, sobre todo en el celular.
- **Recomiendo A**, y sumar tres atajos que no reemplazan al doble click: una miga de pan (raíz › … › foco) para saltar varios niveles de una vez, el botón "atrás" del navegador (cada foco tiene su propia URL, `/n/{id}`) y el teclado (Enter enfoca, Retroceso sube).

**11. ¿Dónde se configura N, la cantidad de niveles visibles?**
- A) Cada usuario lo elige en una preferencia de la interfaz y se guarda en `users.settings`. Valor por defecto: 3.
- B) Un valor global en una variable de entorno, igual para todos. Es lo más simple, pero para cambiarlo hay que reiniciar.
- C) Las dos cosas: la variable de entorno da el valor por defecto y cada usuario lo puede cambiar. Es la más flexible y la que tiene más piezas.
- **Recomiendo A.** Es una preferencia de lectura, no de infraestructura. Le pongo límites de 1 a 10 para que una consulta no traiga el árbol entero.

**12. ¿Cómo se marca que hay niveles más abajo?**
- A) Un distintivo en el nodo del borde con la cantidad de hijos directos ocultos ("+4"). No se puede expandir; hay que enfocar con doble click. Es barato de calcular (`child_count`).
- B) La cantidad total de descendientes ocultos ("+37"). Informa más, pero hace falta una consulta recursiva por cada nodo del borde.
- C) Solo una marca ("⋯") sin número. Es lo más simple, pero no dice cuánto hay.
- **Recomiendo A.** Que no se pueda expandir es justo lo que pediste: a los niveles más profundos solo se llega navegando.

**13. ¿El servidor manda solo la ventana visible o el árbol completo?**
- A) Solo la ventana: el foco, N niveles hacia abajo, la cadena de ancestros (para la miga de pan) y `child_count` en los nodos del borde. Sale de una consulta recursiva (CTE) con tope de profundidad.
- B) El árbol completo de una vez, y el cliente recorta. Navegar es instantáneo, pero con un solo mapa por usuario todo vive en ese árbol y la carga crece sin límite, lo que perjudica sobre todo al celular.
- **Recomiendo A.** Va a tono con la interfaz y con la app futura. Para que navegar se sienta inmediato, el cliente guarda en caché las ventanas que ya visitó.

**14. ¿También pasamos a `codigo.md` las decisiones 6A y 7A?** `[candidata a estándar]`
- A) Sí: "Auth web: el backend hace el OAuth y el navegador solo recibe una cookie de sesión `HttpOnly`" y "OAuth: scopes mínimos + autorización incremental".
- B) No, quedan solo para este proyecto.
- **Recomiendo A.** Cualquier proyecto que integre Google, Trello o GitHub va a repetir la misma discusión.

## Resumen

Es una aplicación web para que una persona con cuenta de Google arme su mapa mental, que es único: crea ideas, las organiza en árbol y navega enfocando nodos. Cada nodo enfocado pasa a ser la raíz visible, y la pantalla muestra como mucho N niveles hacia abajo. El primer corte solo tiene nodos "idea" con título y corre en local con docker compose. El modelo y la API ya contemplan que un nodo sea después un documento de Drive, una planilla, un evento, una tarea o un repositorio, y que una app móvil use el mismo backend.

## Componentes

```
[SPA React/TS (Vite)] --HTTP local + cookie de sesión--> [API FastAPI] --> [PostgreSQL]
                                                               |
                                                               +--> Google OAuth (login)
                                                               +--> (futuro) Drive / Calendar / Trello / GitHub
```

- **Entorno local (docker compose)**: tres servicios, `db` (PostgreSQL 16 con volumen persistente), `api` (FastAPI con recarga en caliente) y `web` (Vite). Vite redirige `/api` al backend, así que todo sale del mismo origen (`localhost:5173`) y no hace falta CORS.
- **Frontend (SPA)**
  - Rutas: `/` muestra la raíz y `/n/:nodeId` muestra un nodo enfocado. El foco vive en la URL, así que funcionan el botón "atrás", los enlaces y recargar la página.
  - `FocusView`: pide la ventana del foco actual y la dibuja.
  - `MapCanvas`: React Flow, con disposición automática en árbol horizontal calculada en el cliente sobre la ventana visible.
  - `Breadcrumb`: la cadena de ancestros, donde cada uno se puede clickear.
  - `NodeRenderer`: elige el componente según `kind` (en el primer corte, solo `IdeaNode`), con el distintivo "+k" en los nodos del borde.
  - Interacción: doble click según la decisión 10; Tab crea un hijo, Enter (editando) crea un hermano, las flechas mueven la selección, Espacio colapsa o expande, F2 renombra y Supr borra.
  - Estado: `useReducer`, actualizaciones optimistas y una caché de ventanas por `(nodeId, N)` que se invalida cuando hay cambios.
  - Cliente de la API tipado a partir del OpenAPI de FastAPI.
- **Backend (FastAPI, Python 3.12)**
  - `auth`: login, callback de OAuth, logout y `/me`.
  - `nodes`: servicio y repositorio del árbol, incluida la consulta de ventana (CTE recursiva con profundidad máxima).
  - `settings`: preferencias del usuario (N).
  - `node_types`: registro de tipos de nodo, cada uno con su esquema Pydantic para `props`. En el primer corte solo está `idea`.
  - `integrations` (vacío en el primer corte): una interfaz `Provider` por servicio externo.
  - SQLAlchemy 2 + Alembic.
- **API REST**
  - `GET /me` devuelve el usuario, sus `settings` y el `root_node_id`. `PATCH /me/settings` cambia `{ depth }`.
  - `GET /nodes/{id}/view?depth=N` devuelve `{ focus, ancestors[], nodes[] }`, y cada nodo trae `child_count`.
  - `POST /nodes/{id}/children` crea un hijo con `{ title, after_sort_key? }`.
  - `PATCH /nodes/{id}` cambia `title`, `collapsed` o `sort_key`, con `version` (si la versión es vieja, responde `409`).
  - `DELETE /nodes/{id}` borra el nodo y todo su subárbol. La raíz no se puede borrar (`422`).

## Modelo de datos

- **users**: `id` (uuid), `google_sub` (único), `email`, `name`, `avatar_url`, `settings` (jsonb, `{"depth": 3}`), `created_at`.
- **sessions**: `id` (hash de un token aleatorio), `user_id`, `expires_at`, `created_at`.
- **maps**: `id`, `owner_id` (**único**), `root_node_id`, `created_at`.
  - Se crea en el primer login, junto con su nodo raíz titulado con el nombre del usuario (se puede renombrar).
  - Hoy hay un mapa por usuario. La tabla existe para que pasar a varios mapas o compartirlos sea quitar una restricción `unique` y no una migración de datos.
- **nodes**:
  - `id` (uuid), `map_id`, `parent_id` (vacío solo en la raíz);
  - `kind` (texto, `'idea'`) y `title`;
  - `sort_key` (texto, índice fraccionario);
  - `collapsed` (booleano);
  - `props` (jsonb, `{}`);
  - `version`, `created_at`, `updated_at`.
  - Índices: `(map_id)` y `(parent_id, sort_key)`. Este último sirve tanto para la CTE de la ventana como para `child_count`.

**Cómo se combinan colapsar y la profundidad:** `collapsed` se guarda por nodo y se respeta dentro de la ventana. Si un nodo está colapsado, sus hijos no se muestran aunque entren en los N niveles. Los nodos que quedan en el nivel N muestran "+k" y no se pueden expandir.

**Cómo crece sin migraciones dolorosas:**
- `kind` es texto y no un enum de la base: un tipo nuevo es un valor nuevo más su esquema.
- Los datos propios de cada tipo van en `props`, validados según `kind`.
- Corte 2: **external_refs** (`node_id`, `provider`, `external_id`, `url`, `metadata` jsonb, `synced_at`).
- Corte 2: **oauth_grants** (`user_id`, `provider`, `scopes`, `refresh_token_enc`, `updated_at`).
- Si hacen falta enlaces entre ramas, se suma una tabla `edges` sin tocar `nodes`.

## Integraciones

- **Google OAuth 2.0 (6A)**: Authorization Code del lado del servidor, con Authlib.
  - URI de redirección: `http://localhost:5173/api/auth/callback`.
  - La app de OAuth queda en modo *Testing*: hay que dar de alta a los usuarios de prueba y no hace falta verificarla.
  - En modo *Testing*, los refresh tokens vencen a los 7 días. Afecta recién al corte 2.
- **Scopes (7A)**: en el primer corte, solo `openid email profile`. El acceso a Drive (`drive.file`) se pide de forma incremental en el corte 2, cuando el usuario crea su primer nodo documento. Esto se aparta a propósito de "dar acceso a Drive en el login", como elegiste.
- **Corte 2**: Google Picker + `drive.file`.
- **Más adelante**: Calendar, Trello y GitHub, cada uno con su OAuth y su fila en `oauth_grants`, pedido al conectar ese servicio.

## Seguridad y datos

- **Datos**: en el PostgreSQL local (volumen de docker). De Google solo se guarda identidad: `sub`, email y nombre.
- **Secretos**: un `.env` que está en `.gitignore`; el repo trae un `.env.example`.
  - Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `DATABASE_URL`.
  - Desde el corte 2 se suma `TOKEN_ENCRYPTION_KEY`.
- **Tokens**: el primer corte no guarda tokens de Google. Desde el corte 2, los refresh tokens se cifran con Fernet y nunca llegan al navegador.
- **Sesión**:
  - Cookie `HttpOnly` y `SameSite=Lax`. `Secure` se configura por variable de entorno.
  - Header propio obligatorio en las mutaciones, como defensa contra CSRF.
  - `state` y `nonce` en el flujo OAuth.
- **Riesgos**:
  - *IDOR*: todo acceso a un nodo hace join con `maps.owner_id = usuario`. Hay tests específicos, incluido `/view` sobre un nodo ajeno.
  - *Consultas caras*: `depth` está limitado entre 1 y 10 y la CTE tiene tope de profundidad.
  - *XSS*: React escapa los títulos, nunca se renderiza HTML del usuario y hay CSP.
  - *Pérdida de datos*: hay un script `pg_dump` para backups manuales.
  - *Borrados masivos*: borrar un nodo con descendientes pide confirmación indicando cuántos se borran.
  - *Exposición*: los puertos se publican solo en `127.0.0.1`.
- **Privacidad**: endpoint para borrar la cuenta con todos sus datos.

## Cortes de entrega

1. **Primer corte**: login con Google, mapa único con su raíz, crear, renombrar y borrar ideas, colapsar y expandir, navegación por foco (doble click, miga de pan, URL, teclado), N niveles con el indicador "+k", N configurable, zoom y desplazamiento, y persistencia en PostgreSQL. Corre con `docker compose up`.
2. Mover y reordenar nodos (arrastrando), y nodo "documento de Drive" con Picker + `drive.file` incremental.
3. Planilla y evento de calendario, con vista previa y metadatos en caché.
4. Nodos "tarea" y "proyecto", e integraciones con Trello y GitHub.
5. Deploy fuera de local y app móvil (PWA primero) sobre la misma API.

## Decisiones tomadas

- **1A. FastAPI + SPA React/TypeScript (Vite)** (tu respuesta). Pasa a estándar por la 9A.
- **2A. Lienzo con React Flow** (tu respuesta).
- **3A. Disposición automática en árbol horizontal** (tu respuesta). Ahora se calcula sobre la ventana visible.
- **4A. PostgreSQL** (tu respuesta). Pasa a estándar por la 9A.
- **5C. Todo en local con docker compose** (tu respuesta). Los secretos van en `.env`.
- **6A. El backend hace el OAuth (patrón BFF) con cookie `HttpOnly`** (tu respuesta). Así los tokens no quedan expuestos a XSS y la app móvil puede usar el mismo backend. Si pasa a estándar se decide en la 14.
- **7A. Scopes mínimos (`openid email profile`) y Drive con autorización incremental en el corte 2** (tu respuesta). Si pasa a estándar se decide en la 14.
- **8. Un solo mapa por usuario, con navegación por foco** (tu respuesta). El doble click enfoca un nodo como raíz visible y otro doble click sube un nivel, salvo en el nivel cero. Se muestran como mucho N niveles (N configurable), con un indicador de que hay más abajo. A los niveles profundos solo se llega navegando. Los detalles quedan en las decisiones 10 a 13.
- **9A. Pasar a `codigo.md` "Web: API Python (FastAPI) + SPA TypeScript/React (Vite)" y "Base de datos por defecto: PostgreSQL"** (tu respuesta). Falta aplicarlo en `codigo.md`; mi rol no modifica archivos.
- **Backend en Python 3.12+** (estándar).
- **Código y nombres en inglés; comentarios y documentación en español** (estándar).
- **Tests en cada cambio de comportamiento** (estándar): pytest + httpx en el backend y Vitest en el frontend.
- **Secretos solo en variables de entorno** (estándar).
- **Dependencias justificadas** (estándar): FastAPI, SQLAlchemy/Alembic, Authlib, React Flow y React Router (para que el foco viva en la URL), y desde el corte 2, `cryptography`.
- **Web primero, con la API separada del frontend** (pedido).
- **Login con Google** (pedido).
- **Nodos con `kind` + `props` y referencias externas en una tabla aparte** (pedido).

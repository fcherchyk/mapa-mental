<!-- claude-readonly · claude-opus-5-5 · familia anthropic -->

# Arquitectura inicial: mapa mental

## Decisiones abiertas

Las 6, 7 y 8 no te llegaron porque se cortó el mensaje. Mantengo la numeración para que no se mezclen con las que ya respondiste.

**6. ¿Cómo manejamos la sesión y los tokens de Google?** `[candidata a estándar]`
- A) El backend hace de intermediario (patrón BFF): corre el flujo OAuth, guarda los tokens en el servidor y al navegador solo le da una cookie de sesión `HttpOnly`.
- B) Los tokens viven en el navegador (Google Identity Services) y el backend solo valida el ID token. Es más simple, pero un ataque XSS puede robar los tokens de Drive y no se puede trabajar en segundo plano.
- **Recomiendo A.** Una futura app móvil puede usar el mismo backend con OAuth + PKCE.

**7. ¿Qué permisos de Google pedimos en el primer corte?** `[candidata a estándar]`
- A) Solo `openid email profile`. `drive.file` se pide con autorización incremental recién cuando llegue el nodo tipo documento. Es el mínimo, pero no cumple al pie de la letra el pedido de dar acceso a Drive en el login.
- B) `drive.file` desde el login. No es un scope sensible y solo da acceso a los archivos que el usuario elija o que cree la app, pero el primer corte no lo usa.
- C) `drive.readonly`. Ve todo el Drive, pero es un scope restringido: Google exige una auditoría de seguridad (CASA), cara y lenta.
- **Recomiendo A.** Pedirlo ahora no aporta nada y pedirlo después no cuesta nada. Si querés que el permiso de Drive ya aparezca en el login, elegí B. Como estándar quedaría: "scopes mínimos + autorización incremental".

**8. ¿Cuántos mapas tiene un usuario y se van a compartir?**
- A) Varios mapas por usuario, cada uno con un único dueño y sin compartir por ahora. Es simple; pasar a "miembros" después es una migración chica.
- B) Un solo mapa por usuario, organizado en ramas desde la raíz. Es lo más simple, pero limita.
- C) Varios mapas con tabla de miembros y roles desde el inicio. Habilita compartir, pero suma complejidad que hoy nadie pidió.
- **Recomiendo A.**

**9. ¿Pasamos ya a `codigo.md` los estándares que aprobaste (1 y 4)?** `[candidata a estándar]`
- A) Sí, ahora: "Web: API Python (FastAPI) + SPA TypeScript/React (Vite)" y "Base de datos por defecto: PostgreSQL". El próximo proyecto ya arranca con eso.
- B) Esperar a un segundo proyecto web que lo confirme. Es más prudente, pero el siguiente proyecto vuelve a discutir lo mismo.
- **Recomiendo A.** React Flow (2) y la disposición automática (3) quedan solo para este proyecto. Correr en local (5) también, porque es una decisión de esta etapa y no del workspace.

## Resumen

Una aplicación web para que una persona con cuenta de Google arme mapas mentales: crea ideas, las organiza en árbol, expande y colapsa ramas y navega el mapa con mouse, tacto o teclado. El primer corte solo tiene nodos "idea" con título y corre en local con docker compose. El modelo y la API ya contemplan que un nodo sea después un documento de Drive, una planilla, un evento, una tarea o un repositorio, y que una app móvil use el mismo backend.

## Componentes

```
[SPA React/TS (Vite)] --HTTP local + cookie de sesión--> [API FastAPI] --> [PostgreSQL]
                                                               |
                                                               +--> Google OAuth (login)
                                                               +--> (futuro) Drive / Calendar / Trello / GitHub
```

- **Entorno local (docker compose)**
  - Tres servicios: `db` (PostgreSQL 16 con volumen persistente), `api` (FastAPI con recarga en caliente) y `web` (servidor de desarrollo de Vite).
  - Vite redirige `/api` al backend, así que todo sale del mismo origen (`http://localhost:5173`) y no hace falta CORS.
- **Frontend (SPA)**
  - `MapCanvas`: React Flow, con la disposición automática (árbol horizontal) calculada en el cliente.
  - `NodeRenderer`: elige el componente según `kind`; en el primer corte solo existe `IdeaNode`.
  - Teclado: Tab crea un hijo, Enter crea un hermano, las flechas navegan, Espacio colapsa o expande, F2 renombra y Supr borra.
  - Estado con `useReducer` y actualizaciones optimistas: la interfaz cambia antes de que confirme el servidor y vuelve atrás si falla.
  - Cliente de la API tipado a partir del OpenAPI de FastAPI.
- **Backend (FastAPI, Python 3.12)**
  - `auth`: login, callback de OAuth, logout y `/me`.
  - `maps`: servicio y repositorio de mapas y nodos.
  - `node_types`: registro de tipos de nodo, cada uno con su esquema Pydantic para `props`; en el primer corte solo está `idea`.
  - `integrations` (vacío en el primer corte): una interfaz `Provider` por servicio externo.
  - SQLAlchemy 2 + Alembic para los modelos y las migraciones.
- **API REST**
  - `GET/POST /maps` y `GET/PATCH/DELETE /maps/{id}`. El `GET` devuelve el árbol completo.
  - `POST /maps/{id}/nodes`.
  - `PATCH /nodes/{id}`: `title`, `collapsed`, `parent_id`, `sort_key`.
  - `DELETE /nodes/{id}`: borra el nodo y todo su subárbol.
  - Concurrencia optimista con `version`: si el cliente manda una versión vieja, el servidor responde `409`.

## Modelo de datos

- **users**: `id` (uuid), `google_sub` (único), `email`, `name`, `avatar_url`, `created_at`.
- **sessions**: `id` (hash de un token aleatorio), `user_id`, `expires_at`, `created_at`.
- **maps**: `id`, `owner_id`, `title`, `created_at`, `updated_at`.
- **nodes**:
  - `id` (uuid), `map_id`, `parent_id` (vacío solo en la raíz);
  - `kind` (texto, `'idea'`) y `title`;
  - `sort_key` (texto, índice fraccionario para reordenar sin renumerar a los hermanos);
  - `collapsed` (booleano);
  - `props` (jsonb, `{}` por defecto);
  - `version`, `created_at`, `updated_at`.
  - Índices: `(map_id)` y `(parent_id, sort_key)`.

**Cómo crece sin migraciones dolorosas:**
- `kind` es texto y no un enum de la base: un tipo nuevo es un valor nuevo más un esquema Pydantic.
- Los datos propios de cada tipo (fecha, estado de una tarea, posición fijada) van en `props`, validados según `kind`.
- Corte 2: **external_refs** (`node_id`, `provider`, `external_id`, `url`, `metadata` jsonb, `synced_at`).
- Corte 2: **oauth_grants** (`user_id`, `provider`, `scopes`, `refresh_token_enc`, `updated_at`).
- Si hacen falta enlaces entre ramas (un grafo y no solo un árbol), se suma una tabla `edges` sin tocar `nodes`.

## Integraciones

- **Google OAuth 2.0**: Authorization Code del lado del servidor, con Authlib. La dependencia se justifica porque hacer OIDC a mano con la biblioteca estándar es riesgoso.
  - URI de redirección: `http://localhost:5173/api/auth/callback`. Google acepta `localhost` sin HTTPS.
  - La app de OAuth queda en modo *Testing*: hay que dar de alta a los usuarios de prueba (tu cuenta) y no hace falta verificar la app.
  - Ojo: en modo *Testing* los refresh tokens vencen a los 7 días. No afecta al primer corte, pero sí al corte 2 (Drive).
  - Scopes según la decisión 7.
- **Corte 2**: Google Picker + `drive.file`, pedido de forma incremental al crear el primer nodo documento.
- **Más adelante**: Calendar, Trello y GitHub, cada uno con su propio OAuth y su fila en `oauth_grants`, pedido solo cuando el usuario conecta ese servicio.

## Seguridad y datos

- **Datos**: en el PostgreSQL local (un volumen de docker). De Google solo se guarda identidad: `sub`, email y nombre.
- **Secretos**: variables de entorno cargadas desde un `.env` que está en `.gitignore`; el repo trae un `.env.example`.
  - Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `DATABASE_URL`.
  - Desde el corte 2 se suma `TOKEN_ENCRYPTION_KEY`.
- **Tokens de Google**: con 7A, el primer corte no guarda ninguno. Desde el corte 2, los refresh tokens se cifran con Fernet (`cryptography`) y nunca llegan al navegador.
- **Sesión**:
  - Cookie `HttpOnly` y `SameSite=Lax`. `Secure` se configura por variable de entorno: apagado en `localhost` y obligatorio si algún día se expone.
  - Header propio obligatorio en las mutaciones, como defensa contra CSRF.
  - `state` y `nonce` en el flujo OAuth.
- **Riesgos**:
  - *Acceso a datos ajenos (IDOR)*: cada consulta filtra por `owner_id`, con tests específicos.
  - *XSS*: React escapa los títulos, nunca se renderiza HTML del usuario y hay CSP.
  - *Pérdida de datos*: con todo en local, el riesgo es perder el volumen. Hay un script `pg_dump` para backups manuales.
  - *Exposición accidental*: los puertos de docker se publican solo en `127.0.0.1`.
- **Privacidad**: endpoint para borrar la cuenta con todos sus datos (Google lo exige si la app se publica).

## Cortes de entrega

1. **Primer corte**: login con Google, lista de mapas, crear/renombrar/borrar nodos "idea", expandir y colapsar, navegación con teclado, zoom y desplazamiento, y persistencia en PostgreSQL. Corre con `docker compose up`.
2. Reordenar y mover nodos de rama (arrastrando), y nodo "documento de Drive" con Picker + `drive.file` incremental.
3. Planilla y evento de calendario, con vista previa y metadatos en caché.
4. Nodos "tarea" y "proyecto", e integraciones con Trello y GitHub.
5. Deploy fuera de local (se decide entonces: VPS, Cloud Run, etc.) y app móvil (PWA primero) sobre la misma API.

## Decisiones tomadas

- **1A. Stack: FastAPI + SPA React/TypeScript (Vite)** (tu respuesta). Respeta el estándar Python en el backend; TS se justifica porque la interacción del lienzo corre en el navegador. Propuesta de estándar en la decisión 9.
- **2A. Lienzo con React Flow** (tu respuesta). Es la opción que mejor soporta tipos de nodo distintos.
- **3A. Disposición automática en árbol horizontal** (tu respuesta). Fijar posiciones se puede sumar después en `props`, sin migrar.
- **4A. PostgreSQL** (tu respuesta). Propuesta de estándar en la decisión 9.
- **5C. Por ahora todo en local con docker compose** (tu respuesta). No hay hosting ni costo; el deploy se decide en un corte posterior. Por eso no se usa Secret Manager y los secretos van en `.env`.
- **Backend en Python 3.12+** (estándar).
- **Código y nombres en inglés; comentarios y documentación en español** (estándar).
- **Tests en cada cambio de comportamiento** (estándar): pytest + httpx en el backend y Vitest en el frontend.
- **Secretos solo en variables de entorno** (estándar).
- **Dependencias justificadas** (estándar): FastAPI, SQLAlchemy/Alembic, Authlib, React Flow y, desde el corte 2, `cryptography`.
- **Web primero, con la API separada del frontend** (pedido), para que la app futura no obligue a rehacer el backend.
- **Login con Google** (pedido).
- **Nodos con `kind` + `props` y referencias externas en una tabla aparte** (pedido), para sumar tipos e integraciones sin migraciones pesadas.

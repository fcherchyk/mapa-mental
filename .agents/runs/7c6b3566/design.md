<!-- claude-readonly · claude-opus-5-5 · familia anthropic -->

# Arquitectura inicial: mapa mental

## Decisiones abiertas

**1. ¿Qué stack web usamos (backend + frontend)?** `[candidata a estándar]`
- A) Backend FastAPI (Python) que expone una API JSON, y frontend SPA en TypeScript + React (Vite). Respeta el estándar Python y una futura app puede usar la misma API; el costo es manejar dos lenguajes.
- B) Django + HTMX. Todo queda en Python, pero un lienzo interactivo de mapa mental igual exige mucho JS, y el HTML que arma el servidor no le sirve a una app móvil.
- C) Todo en TypeScript (Next.js). Un solo lenguaje, pero rompe el estándar Python.
- **Recomiendo A.** El estándar de Python sigue valiendo para el backend, y el frontend en TS se justifica porque la interacción del lienzo tiene que correr en el navegador. Si lo aprobás, propongo agregar a `codigo.md`: "Web: API Python (FastAPI) + SPA TypeScript/React".

**2. ¿Con qué dibujamos el mapa en pantalla?**
- A) React Flow (xyflow, MIT). Ya trae zoom, desplazamiento y nodos a medida por tipo. Es una dependencia, pero madura.
- B) SVG propio + `d3-hierarchy` para calcular la disposición. Control total, pero bastante más trabajo (zoom, selección, edición).
- C) Una biblioteca de mapas mentales lista (Mind Elixir, jsMind). Es lo más rápido, pero cuesta meterle nodos de tipo documento, tarea, etc.
- **Recomiendo A.** Es la que mejor soporta tipos de nodo distintos más adelante.

**3. ¿Dónde se ubican los nodos en el lienzo?**
- A) Disposición automática: árbol horizontal desde la raíz y el usuario solo ordena los hijos. Es simple, siempre prolijo y anda bien en celular.
- B) Posición libre: el usuario arrastra cada nodo. Más flexible, pero hay que guardar coordenadas y el mapa se desordena.
- C) Automática, con la opción de "fijar" la posición de algunos nodos. Lo mejor de las dos, con más complejidad.
- **Recomiendo A en el primer corte.** C se puede sumar después sin migrar: la posición iría en `props`.

**4. ¿Dónde guardamos los mapas?** `[candidata a estándar]`
- A) PostgreSQL propio. Permite consultas, control de concurrencia y cruzar datos con las integraciones; a cambio, los datos del usuario quedan en nuestra base.
- B) Un archivo JSON en el Drive del usuario (`appDataFolder`). Los datos quedan del lado del usuario, pero no hay consultas, la latencia es alta y hay conflictos si edita en dos pestañas.
- C) SQLite. Lo más simple, pero se complica con hosting de varias instancias.
- **Recomiendo A.** Si lo aprobás, la base por defecto del workspace sería PostgreSQL.

**5. ¿Dónde lo alojamos?** `[candidata a estándar]`
- A) Google Cloud Run + Cloud SQL + Secret Manager. Es el mismo proyecto de GCP que ya necesitamos para OAuth y escala a cero, pero Cloud SQL cuesta unos USD 10/mes como mínimo.
- B) Render o Fly.io con Postgres administrado. Es lo más simple de operar y barato, pero suma un proveedor más.
- C) Un VPS propio con docker compose. Lo más barato, pero el mantenimiento queda de tu lado.
- **Recomiendo A.** Ya vamos a tener un proyecto de Google sí o sí, así que no se suma ningún proveedor.

**6. ¿Cómo manejamos la sesión y los tokens de Google?** `[candidata a estándar]`
- A) El backend hace de intermediario (patrón BFF): ejecuta el flujo OAuth, guarda los tokens del lado del servidor y al navegador solo le da una cookie de sesión `HttpOnly`.
- B) Los tokens viven en el navegador (Google Identity Services) y el backend solo valida el ID token. Es más simple, pero un ataque XSS puede robar los tokens de Drive y no se puede trabajar en segundo plano.
- **Recomiendo A.** La futura app móvil puede usar el mismo backend con OAuth + PKCE.

**7. ¿Qué permisos de Google pedimos en el primer corte?** `[candidata a estándar]`
- A) Solo `openid email profile`. `drive.file` se pide con autorización incremental recién cuando llegue el nodo tipo documento. Es el mínimo, pero no cumple al pie de la letra el pedido de dar acceso a Drive en el login.
- B) `drive.file` desde el login. No es un scope sensible y solo da acceso a los archivos que el usuario elija o que cree la app, pero el primer corte no lo usa.
- C) `drive.readonly`. Ve todo el Drive, pero es un scope *restringido*: Google exige una auditoría de seguridad (CASA) que es cara y lenta.
- **Recomiendo A.** Pedir el permiso en el primer corte no aporta nada, y la autorización incremental no cuesta nada después. Si querés que el permiso ya aparezca en el login, B. Como estándar: "scopes mínimos + autorización incremental".

**8. ¿Cuántos mapas tiene un usuario y se van a compartir?**
- A) Varios mapas por usuario, cada uno con un único dueño, sin compartir por ahora. Es simple; pasar a "miembros" después es una migración chica.
- B) Un solo mapa por usuario; se organiza con ramas desde la raíz. Lo más simple, pero limita.
- C) Varios mapas con tabla de miembros y roles desde el inicio. Habilita compartir, pero suma complejidad que hoy nadie pidió.
- **Recomiendo A.**

## Resumen

Una aplicación web para que una persona con cuenta de Google arme mapas mentales: cree ideas, las organice en árbol, expanda y colapse ramas y navegue el mapa con mouse, tacto o teclado. El primer corte solo tiene nodos "idea" con título. El modelo y el backend ya están pensados para que un nodo pueda ser después un documento de Drive, una planilla, un evento, una tarea o un repositorio, y para que una app móvil use la misma API.

## Componentes

```
[SPA React/TS] --HTTPS + cookie de sesión--> [API FastAPI] --> [PostgreSQL]
                                                   |
                                                   +--> Google OAuth (login)
                                                   +--> (futuro) Drive / Calendar / Trello / GitHub
```

- **Frontend (SPA)**
  - `MapCanvas`: React Flow con la disposición automática calculada en el cliente.
  - `NodeRenderer`: elige el componente según el tipo de nodo (`kind`); en el primer corte solo existe `IdeaNode`.
  - Atajos de teclado: Tab crea un hijo, Enter crea un hermano, las flechas navegan, Espacio colapsa o expande, F2 renombra y Supr borra.
  - Estado local con `useReducer` y actualizaciones optimistas: la interfaz cambia antes de que confirme el servidor y vuelve atrás si falla.
  - Cliente de la API tipado a partir del OpenAPI de FastAPI.
- **Backend (FastAPI, Python 3.12)**
  - `auth`: login, callback de OAuth, logout y `/me`, con sesiones en la base.
  - `maps`: servicio y repositorio de mapas y nodos.
  - `node_types`: registro de tipos de nodo, cada uno con su esquema Pydantic para `props`; el primer corte solo trae `idea`.
  - `integrations` (vacío en el primer corte): una interfaz `Provider` por servicio externo (resolver referencias, refrescar metadatos).
  - SQLAlchemy 2 + Alembic para los modelos y las migraciones.
- **API REST**
  - `GET/POST /maps`, `GET/PATCH/DELETE /maps/{id}`. El `GET` devuelve el árbol completo, que alcanza para mapas de hasta miles de nodos.
  - `POST /maps/{id}/nodes`.
  - `PATCH /nodes/{id}`: título, `collapsed`, `parent_id`, `sort_key`.
  - `DELETE /nodes/{id}`: borra el nodo con todo su subárbol.
  - Concurrencia optimista: el cliente manda la `version` que conoce y, si cambió, el servidor responde `409`.

## Modelo de datos

- **users**: `id` (uuid), `google_sub` (único), `email`, `name`, `avatar_url`, `created_at`.
- **sessions**: `id` (token aleatorio, guardado como hash), `user_id`, `expires_at`, `created_at`. Están en la base para poder revocarlas.
- **maps**: `id`, `owner_id`, `title`, `created_at`, `updated_at`.
- **nodes**:
  - `id` (uuid), `map_id`, `parent_id` (vacío solo en la raíz);
  - `kind` (texto, `'idea'`);
  - `title`;
  - `sort_key` (texto, con índices fraccionarios para reordenar sin renumerar a los hermanos);
  - `collapsed` (booleano);
  - `props` (jsonb, `{}` por defecto);
  - `version` (entero), `created_at`, `updated_at`.
  - Índices: `(map_id)` y `(parent_id, sort_key)`.

**Cómo crece sin migraciones dolorosas:**
- `kind` es texto, no un enum de la base. Un tipo nuevo es un valor nuevo más un esquema Pydantic para `props`, sin tocar la base.
- Los datos propios de cada tipo (fecha del evento, estado de la tarea, posición fijada) van en `props`, y se validan en el backend según `kind`.
- Las referencias a sistemas externos van en una tabla aparte, que se crea en el corte 2:
  - **external_refs**: `node_id`, `provider` (`google_drive`, `trello`, `github`…), `external_id`, `url`, `metadata` (jsonb, caché), `synced_at`.
- Los permisos por proveedor también van en una tabla aparte, que se crea en el corte 2:
  - **oauth_grants**: `user_id`, `provider`, `scopes`, `refresh_token_enc`, `updated_at`.
- Si más adelante hacen falta enlaces entre ramas (grafo, no solo árbol), se suma una tabla `edges` sin tocar `nodes`.

## Integraciones

- **Google OAuth 2.0** (Authorization Code, del lado del servidor, con Authlib). La dependencia se justifica porque implementar OAuth/OIDC a mano con la biblioteca estándar es propenso a errores de seguridad.
  - Primer corte, según la decisión 7: `openid email profile`.
  - La pantalla de consentimiento necesita nombre de la app, dominio y política de privacidad. Con scopes básicos o `drive.file` no hace falta la verificación de scopes sensibles.
- **Corte 2**: Google Picker + `drive.file`, pedido de forma incremental y solo en el momento de crear un nodo tipo documento.
- **Más adelante**: Calendar (`calendar.events.readonly` o el que alcance), Trello y GitHub. Cada uno tiene su propio flujo OAuth y su fila en `oauth_grants`, y se pide solo cuando el usuario conecta ese servicio.

## Seguridad y datos

- **Datos**: los mapas viven en PostgreSQL. Del lado de Google, el primer corte solo guarda identidad (`sub`, email, nombre).
- **Secretos**: solo por variables de entorno (en producción, cargadas desde Secret Manager): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `DATABASE_URL`. A partir del corte 2 se suma `TOKEN_ENCRYPTION_KEY`.
- **Tokens de Google**: con la opción 7A, el primer corte no guarda ninguno. Desde el corte 2, los refresh tokens se guardan cifrados (Fernet, con la biblioteca `cryptography`) y nunca llegan al navegador.
- **Sesión**:
  - Cookie `HttpOnly`, `Secure`, `SameSite=Lax`, con vencimiento por inactividad.
  - Defensa contra CSRF: además de SameSite, la API exige un header propio en las mutaciones.
  - `state` y `nonce` en el flujo OAuth.
- **Riesgos**:
  - *Acceso a datos ajenos (IDOR)*: cada consulta filtra por `owner_id`, con tests específicos.
  - *XSS*: React escapa los títulos, nunca se renderiza HTML del usuario y se configura una CSP estricta.
  - *Abuso*: límites de largo del título, cantidad de nodos por mapa y frecuencia de pedidos.
  - *Pérdida de datos*: backups automáticos de la base.
- **Privacidad**: la app permite borrar la cuenta con todos sus datos, porque las políticas de Google lo exigen.

## Cortes de entrega

1. **Primer corte**:
   - login con Google;
   - lista de mapas;
   - crear, renombrar y borrar nodos "idea";
   - expandir y colapsar;
   - navegar con teclado, zoom y desplazamiento;
   - persistencia y deploy.
2. Reordenar y mover nodos de rama (arrastrar), y nodo "documento de Drive" con Picker + `drive.file` incremental.
3. Más tipos de Google: planilla y evento de calendario, con vista previa y metadatos en caché.
4. Nodos "tarea" y "proyecto", e integraciones con Trello y GitHub vía `oauth_grants` y `external_refs`.
5. App móvil (PWA primero; Capacitor o React Native si hace falta) usando la misma API.

## Decisiones tomadas

- **Backend en Python 3.12+** (estándar `codigo.md`).
- **Código y nombres en inglés; comentarios y documentación en español** (estándar).
- **Tests en cada cambio de comportamiento** (estándar): pytest + httpx en el backend, Vitest en el frontend.
- **Secretos solo en variables de entorno** (estándar).
- **Dependencias justificadas** (estándar: preferir la biblioteca estándar). FastAPI, SQLAlchemy/Alembic, Authlib, React Flow y, desde el corte 2, `cryptography`. Cada una reemplaza algo que sería caro o riesgoso escribir a mano.
- **Web primero, con API separada del frontend** (pedido): así la futura app no requiere rehacer el backend.
- **Login con Google** (pedido).
- **Nodo con `kind` + `props` extensibles y referencias externas en tabla aparte** (pedido): así se pueden sumar tipos de nodo e integraciones sin migraciones pesadas.

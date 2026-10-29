# mapa-mental

App web para que una persona con cuenta de Google arme un único mapa mental de ideas y lo recorra enfocando un nodo por vez, viendo como mucho N niveles hacia abajo. Este repositorio tiene por ahora el backend del primer corte: una API FastAPI sobre PostgreSQL con login de Google, un mapa por usuario y la API de nodos. La SPA (React + Vite) llega en la corrida siguiente.

## Funcionalidades

- Login con Google del lado del servidor (Authorization Code con `state` y `nonce`, scopes `openid email profile`); el navegador solo recibe una cookie `HttpOnly`.
- Primer login: crea el usuario, su mapa y el nodo raíz con su nombre.
- `GET /api/me` con el usuario, sus preferencias y `root_node_id`; logout.
- Preferencia `depth` (1 a 10, por defecto 3) con `PATCH /api/me/settings`.
- Ventana visible `GET /api/nodes/{id}/view?depth=N`: foco, ancestros y hasta N niveles con `child_count`, respetando `collapsed`.
- Crear hijos (`POST /api/nodes/{id}/children`, con `after_sort_key` opcional), editar con control de versión (`PATCH /api/nodes/{id}`) y borrar subárboles (`DELETE /api/nodes/{id}`).
- Aislamiento por usuario: un nodo ajeno responde `404`.
- Protección CSRF: toda mutación exige el header `X-CSRF: 1`.

## Instalación

Requisitos: Docker (OrbStack en la Mac) y `uv`.

1. Crear credenciales OAuth en Google Cloud (tipo "Aplicación web", pantalla de consentimiento en modo *Testing*) y dar de alta como usuarios de prueba las cuentas que van a entrar.
2. Registrar el redirect URI. Con el frontend es `http://localhost:5173/api/auth/callback`; mientras no exista, `http://localhost:8000/api/auth/callback`.
3. `cp .env.example .env` y completar `POSTGRES_PASSWORD`, `DATABASE_URL` (con la misma contraseña), `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y, si corresponde, `GOOGLE_REDIRECT_URI`.
4. Para desarrollar fuera de Docker: `uv sync --directory api`.

## Uso

```sh
docker compose up --build
```

- `db`: PostgreSQL 16 con el volumen `db-data`.
- `api`: aplica las migraciones y levanta FastAPI con recarga en `http://127.0.0.1:8000`. La documentación OpenAPI queda en `http://127.0.0.1:8000/docs`.

Login manual sin frontend: con `GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback` y `POST_LOGIN_REDIRECT=/api/me`, abrir `http://localhost:8000/api/auth/login`; al volver de Google se ve el `/api/me` del usuario.

Todas las rutas llevan el prefijo `/api`, así el proxy de Vite las reenvía sin reescribirlas. Las mutaciones (`POST`, `PATCH`, `DELETE`, logout) necesitan el header `X-CSRF: 1`.

## Tests

Con Docker abierto:

```sh
uv run --directory api pytest -q --cov=app --cov-report=term-missing --cov-fail-under=80
```

Los tests levantan un PostgreSQL 16 efímero con `testcontainers`, lo migran con Alembic y simulan a Google con un OIDC falso (metadata, token y JWKS propios), así que no salen a la red ni usan la base de desarrollo. Cada criterio de la spec tiene tests con `criterio_N` en el nombre.

## Estructura

```
docker-compose.yml        servicios db y api (puertos solo en 127.0.0.1)
.env.example              variables de entorno, sin valores reales
api/
  pyproject.toml, uv.lock entorno uv (pytest, pytest-cov, testcontainers en dev)
  Dockerfile
  alembic.ini, migrations/ migraciones (0001: users, sessions, maps, nodes)
  app/
    main.py               create_app: middleware, routers con prefijo /api
    config.py             variables de entorno
    db.py, models.py      SQLAlchemy 2
    auth/                 OAuth con Google, sesiones, CSRF, /me
    settings/             preferencias del usuario (depth)
    nodes/                ventana (CTE recursiva), crear, editar, borrar, sort_keys
    node_types/           registro de tipos (idea) y validación de props
    integrations/         vacío en el primer corte
  tests/                  pytest + httpx contra PostgreSQL de testcontainers
```

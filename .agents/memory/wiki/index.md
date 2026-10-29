# Wiki del proyecto

**Propósito**: app web para que una persona con cuenta de Google arme un único mapa mental de ideas (nodos con título): crear, renombrar, borrar, colapsar y navegar por foco. Más adelante, nodos de otros tipos (Drive, planilla, evento, tarea, repo).

**Estado**: el primer corte tiene solo el backend. La SPA (`web`) llega en la corrida siguiente.

**Componentes**
- `api` (implementado): FastAPI (Python 3.12) en `api/app/` con módulos `auth`, `nodes`, `settings`, `node_types` e `integrations` (vacío). SQLAlchemy 2 + Alembic. Rutas bajo `/api`: `auth` (login, callback, logout), `me`, `me/settings`, `nodes/{id}/view`, `nodes/{id}/children`, `nodes/{id}`.
- `db` (implementado): PostgreSQL 16 con volumen `db-data`. Tablas `users`, `sessions`, `maps`, `nodes` (`kind` + `props`).
- `web` (pendiente): SPA React/TypeScript (Vite) con React Flow y React Router. El foco vivirá en la URL (`/n/:nodeId`); doble click enfoca y muestra N niveles (1–10, por defecto 3, por usuario).
- Login: el backend hace el OAuth con Google y el navegador recibe cookie `HttpOnly`. Scopes `openid email profile`. Las mutaciones exigen el header `X-CSRF: 1`.

**Cómo se corre**: copiar `.env.example` a `.env` (`POSTGRES_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) y `docker compose up --build`. La API queda en `http://127.0.0.1:8000` (docs en `/docs`). Tests: `uv run --directory api pytest -q --cov=app --cov-fail-under=80`, con Docker abierto.

**Estructura y comandos**: backend en `api/` (paquete `api/app/`, tests en `api/tests/`, entorno con `uv`). Los tests usan PostgreSQL efímero con `testcontainers`, así que Docker (OrbStack) tiene que estar abierto. `setup_command` y `test_command` de `.agents/project.yaml` ya saltean `web/` mientras no exista; el de `web/` (`pnpm`, Vitest) se activa solo al crearlo.

Detalle en `memory/arquitectura.md` y `memory/adr/`.

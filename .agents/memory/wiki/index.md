# Wiki del proyecto

**Propósito**: app web para que una persona con cuenta de Google arme un único mapa mental de ideas (nodos con título): crear, editar, borrar, colapsar y navegar por foco. Más adelante, nodos de otros tipos (Drive, planilla, evento, tarea, repo).

**Estado**: el primer corte tiene backend y SPA. Falta el corte 2 (arrastrar y reordenar con `sort_key`, Drive).

**Componentes**
- `api` (implementado): FastAPI (Python 3.12) en `api/app/` con módulos `auth`, `nodes`, `settings`, `node_types` e `integrations` (vacío). SQLAlchemy 2 + Alembic. Rutas bajo `/api`: `auth` (login, callback, logout), `me`, `me/settings`, `nodes/{id}/view`, `nodes/{id}/children`, `nodes/{id}`.
- `db` (implementado): PostgreSQL 16 con volumen `db-data`. Tablas `users`, `sessions`, `maps`, `nodes` (`kind` + `props`).
- `web` (implementado): SPA React + TypeScript con Vite en `web/src/`. React Router para `/` y `/n/:nodeId`; React Flow con disposición en árbol horizontal calculada en el cliente (`map/layout.ts`); cliente de la API en `api/client.ts` con `X-CSRF: 1` en las mutaciones. Doble click enfoca, Tab/Enter/F2/Espacio/Supr/flechas editan y navegan. Tipos de la API en `api/schema.ts`, regenerables con `pnpm --dir web gen:api`.
- Login: el backend hace el OAuth con Google y el navegador recibe cookie `HttpOnly`. Scopes `openid email profile`. Las mutaciones exigen el header `X-CSRF: 1`. La SPA muestra la pantalla de login ante un `401`.

**Cómo se corre**: copiar `.env.example` a `.env` (`POSTGRES_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) y `docker compose up --build`. La SPA queda en `http://localhost:5173` (proxy de `/api` a `api:8000`) y la API en `http://127.0.0.1:8000` (docs en `/docs`). Fuera de Docker: `pnpm --dir web dev`. Tests: `uv run --directory api pytest -q --cov=app --cov-fail-under=80` (con Docker abierto) y `pnpm --dir web exec vitest run --coverage`.

**Estructura y comandos**: backend en `api/` (paquete `api/app/`, tests en `api/tests/`, entorno con `uv`). Frontend en `web/` (`src/`, tests junto al código y API simulada en `src/test/fakeApi.ts`, `pnpm`). Los tests del backend usan PostgreSQL efímero con `testcontainers`, así que Docker (OrbStack) tiene que estar abierto. `setup_command` y `test_command` de `.agents/project.yaml` ya incluyen `web/` porque el directorio existe. El umbral de cobertura del frontend es 80% de líneas en `web/vite.config.ts`.

Detalle en `memory/arquitectura.md` y `memory/adr/`.

# Wiki del proyecto

**Propósito**: app web para que una persona con cuenta de Google arme un único mapa mental de ideas (nodos con título): crear, renombrar, borrar, colapsar y navegar por foco. Más adelante, nodos de otros tipos (Drive, planilla, evento, tarea, repo).

**Componentes**
- `web`: SPA React/TypeScript (Vite) con React Flow y React Router. El foco vive en la URL (`/n/:nodeId`); doble click enfoca y muestra N niveles (1–10, por defecto 3, por usuario).
- `api`: FastAPI (Python 3.12) con módulos `auth`, `nodes`, `settings`, `node_types`, `integrations` (vacío). SQLAlchemy 2 + Alembic.
- `db`: PostgreSQL 16. Tablas `users`, `sessions`, `maps`, `nodes` (`kind` + `props`).
- Login: el backend hace el OAuth con Google y el navegador recibe cookie `HttpOnly`. Scopes `openid email profile`.

**Cómo se corre**: copiar `.env.example` a `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `DATABASE_URL`) y `docker compose up`; la app queda en `http://localhost:5173`. Tests: pytest (backend) y Vitest (frontend).

Detalle en `memory/arquitectura.md` y `memory/adr/`.

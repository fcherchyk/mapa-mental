<!-- claude · claude-opus-5-5 · familia anthropic -->

El backend del primer corte está escrito, pero **no corrí los tests**. El entorno no me dio permiso para ejecutar `pytest`, `ruff` ni `docker`. Sí pude correr `uv lock` y `uv sync`: el `uv.lock` quedó generado y las dependencias se instalan bien con Python 3.12. No hice commit.

## Archivos tocados

- **Entorno:** `docker-compose.yml` (solo `db` y `api`, puertos en 127.0.0.1, volumen `db-data`), `.env.example`, `api/Dockerfile`, `api/.dockerignore`.
- **Proyecto:** `api/pyproject.toml`, `api/uv.lock`, `api/.python-version` (3.12).
- **Migraciones:** `api/alembic.ini` y `api/migrations/`, con la migración `0001_initial.py` que crea `users`, `sessions`, `maps` y `nodes`, el `unique` sobre `owner_id` y los dos índices de `nodes`.
- **Código en `api/app/`:**
  - `main.py` arma la app; se levanta con `uvicorn --factory app.main:create_app`.
  - `config.py`, `db.py` y `models.py`.
  - `auth/`: login con Google, sesiones, CSRF, logout y `/me`.
  - `settings/`: la preferencia `depth`.
  - `nodes/`: la ventana con CTE recursiva, crear, editar con versión, borrar y el orden de hermanos (`sort_keys.py`).
  - `node_types/` con el tipo `idea`, e `integrations/` vacío.
- **Tests en `api/tests/`:**
  - `conftest.py` levanta PostgreSQL 16 con testcontainers y lo migra con Alembic.
  - `fake_google.py` simula a Google con metadata, token y claves propias, así Authlib valida de verdad la firma, `iss`, `aud` y `nonce`.
  - Hay tests para entorno, auth, settings, nodos y `sort_keys`. Cada criterio tiene tests con `criterio_N` en el nombre.
- **Otros:** `README.md` con las secciones del estándar, `.agents/progress.md` y `.agents/project.yaml`.

## Decisiones sobre las preguntas abiertas de la spec

1. **`project.yaml`:** los pasos de `web/` se saltean si la carpeta no existe. Toca la configuración del workspace, así que conviene que lo confirmes. Sin este cambio, el setup y los tests fallan aunque el backend esté bien.
2. **Rutas y redirect:** todas las rutas llevan el prefijo `/api`. El redirect URI sale de `GOOGLE_REDIRECT_URI` y el destino después del login de `POST_LOGIN_REDIRECT`.
3. **`DELETE /me` y backup con `pg_dump`:** quedan afuera.
4. **Nodo ajeno o inexistente:** responde `404`.
5. **Header anti-CSRF:** `X-CSRF: 1`, también en logout.
6. **Título:** se recortan los espacios y debe tener de 1 a 200 caracteres. La raíz usa el nombre de Google normalizado y, si queda vacío, "Mi mapa".
7. **Sesión:** dura 30 días fijos, no se renueva con el uso, y la base guarda el hash del token, no el token.
8. **`sort_key` en `PATCH`:** solo se valida el formato.
9. **Decisiones extra:**
   - `collapsed` también se respeta en el nodo en foco.
   - `sort_key` usa collation `"C"` para que PostgreSQL ordene igual que Python.
   - El `state` y el `nonce` del login viajan en una cookie firmada `oauth_flow` que dura 10 minutos.

**Posibles ADRs:** el header `X-CSRF: 1`, el prefijo `/api` en FastAPI y el formato de `sort_key`.

## Cómo probarlo

```sh
uv run --directory api pytest -q --cov=app --cov-report=term-missing --cov-fail-under=80   # con OrbStack abierto
uv run --directory api ruff format && uv run --directory api ruff check
cp .env.example .env    # completar los valores
docker compose up --build
```

La API queda en `127.0.0.1:8000/docs`. Para probar el login a mano sin frontend: poner `GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback` y `POST_LOGIN_REDIRECT=/api/me`, y abrir `/api/auth/login`.

Hay un punto que revisé en el código instalado pero no ejecuté: Authlib 1.9 valida el `id_token` con `joserfc`, así que el callback captura también esos errores y devuelve 400. Si al correr la suite el test del `nonce` distinto da 500, el problema está ahí.

# Progreso · corrida 9a7eb41c (backend del primer corte)

## Hecho

- [x] Proyecto `api/` con uv: `pyproject.toml` (deps + grupo dev con pytest, pytest-cov, testcontainers, ruff)
- [x] `docker-compose.yml` (`db`, `api`), `api/Dockerfile`, `api/.dockerignore`, `.env.example`
- [x] Modelo SQLAlchemy (`app/models.py`) y migración `migrations/versions/0001_initial.py`
- [x] Auth: login, callback, logout, `/me`, sesiones con hash, cookie HttpOnly/Lax/Secure opcional, CSRF
- [x] Preferencias `PATCH /me/settings`
- [x] Nodos: view (CTE recursiva), crear (índice fraccionario), editar con versión, borrar subárbol
- [x] `node_types` con `idea`
- [x] Tests: `tests/conftest.py` (testcontainers + Alembic), `tests/fake_google.py` (OIDC falso con JWKS propio),
      un archivo por área con `criterio_N` en los nombres
- [x] README; `project.yaml` saltea `web/` mientras no exista

## Falta

- [x] `api/uv.lock` generado (Python 3.12, `api/.python-version`); `uv sync` instala bien.
- [ ] **Correr los tests** (`test_command`) y la cobertura: el entorno no me dio permiso para ejecutar
      `pytest`, `ruff` ni `docker`. Puntos a mirar si algo falla:
  - El callback captura `AuthlibBaseError` y `joserfc.errors.JoseError` (Authlib 1.9 valida el `id_token` con joserfc).
  - El Google falso parchea `httpx.AsyncHTTPTransport.handle_async_request`.
- [ ] `ruff format` / `ruff check` sobre `api/`.
- [ ] Wiki: la actualiza el paso `docs` (mencionar prefijo `/api`, `X-CSRF: 1`, `GOOGLE_REDIRECT_URI`).

## Decisiones sobre preguntas abiertas de la spec

1. `project.yaml`: setup y tests de `web/` se saltean si la carpeta no existe (cambio mínimo, sigue igual cuando llegue el frontend).
2. Rutas con prefijo `/api` en FastAPI (el proxy de Vite no reescribe). Redirect URI por `GOOGLE_REDIRECT_URI`
   (por defecto `http://localhost:5173/api/auth/callback`) y destino post-login por `POST_LOGIN_REDIRECT`.
3. y 4. `DELETE /me` y backup con `pg_dump`: fuera de esta corrida.
5. Nodo ajeno o inexistente: `404`.
6. Header anti-CSRF: `X-CSRF: 1` (también en logout).
7. Título: se recortan espacios, 1 a 200 caracteres. La raíz normaliza el nombre de Google, lo corta a 200 y usa "Mi mapa" si queda vacío.
8. Sesión: 30 días fijos (`SESSION_TTL_DAYS`), no deslizante; logout borra la fila. Sin limpieza de vencidas.
9. `sort_key` en PATCH: solo se valida formato (`[0-9A-Za-z]*[1-9A-Za-z]`, máx. 128).
10. Google simulado con un OIDC falso (metadata, token y JWKS con clave RSA propia): Authlib valida firma, `iss`, `aud` y `nonce`.
- Extra: `collapsed` se respeta también en el foco (nivel 0), igual que en el resto de la ventana.
- Extra: `sort_key` con collation `"C"` para que PostgreSQL ordene igual que Python.
- Extra: el estado OAuth (`state`, `nonce`) vive en la cookie firmada `oauth_flow` (SessionMiddleware, 10 min).

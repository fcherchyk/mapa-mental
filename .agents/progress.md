# Progreso · corrida actual: traducir el repo vivo del español al inglés

Spec: paso anterior (traducción sin cambios de comportamiento).

## Hecho

- [x] Backend `api/app`, `api/scripts`, `api/migrations`, `alembic.ini`: docstrings, comentarios y `detail` en inglés.
      Revisión 0001 intacta (solo cambia la primera línea del docstring).
- [x] Tests backend: `test_entorno.py` → `test_environment.py`; `test_criterio_*` → `test_criterion_*`;
      `test_ca*` → `test_ac*`. Se agregan asserts de `detail` en 401/403/404/409 (sin tests nuevos).
- [x] Frontend `web/src`: textos de UI, `aria-label`, diálogos, ayuda de atajos, avisos, login, comentarios.
- [x] Tests frontend: `describe`/`it` en inglés, `CA` → `AC`, aserciones con los textos nuevos.
- [x] Config: `.env.example`, `docker-compose.yml`, ambos Dockerfiles, `vite.config.ts`, `pyproject.toml`,
      `index.html` (`lang="en"`, `<title>Mind Map</title>`). `package.json` no tiene `description`.
- [x] `web/src/api/schema.ts`: las 3 descripciones cambiadas a mano (ver rechazados).
- [x] `README.md`: textos de UI citados, convención de nombres de tests.

## Verificado

- [x] `pytest -q --cov=app --cov-fail-under=80`: 117 passed, 98,39%. Mismas 89 funciones de test que `main`
      (`git grep -c '^def test_' main -- api/tests`); 117 es la cuenta de `main` (la de 116 era anterior).
- [x] `vitest run --coverage`: 118 passed (9 archivos), 99,4% líneas. Igual que la línea base.
- [x] `tsc --noEmit` y `eslint .`: sin errores.
- [x] `ruff check`: solo el E501 de `migrations/versions/0001_initial.py`, que ya estaba en `main`.
      `ruff format --check` marca ese mismo archivo (también preexistente; se dejó sin tocar).
- [x] Grep de acentos: solo queda "Ana Pérez" (nombre propio en fixtures de tests de backend).
- [x] Grep de palabras: quedan `mapa-mental` (nombre de repo/paquetes y título del OpenAPI) y `mapa` como
      usuario/base por defecto de PostgreSQL en `.env.example`/`docker-compose.yml` (cambiarlo rompe volúmenes
      `db-data` existentes, es un valor de config, no texto).

## Decisiones

- Título visible: "Mind Map" (login y `<title>`); repo, `name` de paquetes y título de FastAPI quedan igual.
- Raíz por defecto: `DEFAULT_ROOT_TITLE = "My map"` (es texto visible).
- Teclas en la ayuda: Space, Delete, Backspace, Arrows, Double click. `event.key` no cambia.
- En la UI se dice "idea"; en el código, "node". "Salir" → "Sign out"; "Miga de pan" → "Breadcrumb".

## Rechazados / pendientes

- Rechazado: comandos con bucle `for` en bash, heredoc de python con llaves, `python3 <script en scratchpad>`,
  `git mv`, `sed -i`, `pnpm --dir web gen:api`, `uv run ... scripts/export_openapi.py`,
  `pnpm --dir web exec prettier --check src` y comandos compuestos con `;`/`&&` (pnpm install + gen:api).
  Se usaron Edit/Write; el archivo se renombró con Write + `rm`.
- Pendiente: correr `pnpm --dir web gen:api` y verificar que `git diff web/src/api/schema.ts` quede vacío (criterio 5).
- Pendiente: `prettier --check` (no se pudo correr) y la validación manual en el navegador (criterio 9).
- `setup_command`/`test_command` con llaves no se probaron tal cual (rechazados en corridas previas); se corrieron
  sus partes por separado con los mismos argumentos.
- No se hace commit.

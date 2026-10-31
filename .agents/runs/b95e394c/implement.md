<!-- claude · claude-opus-5-5 · familia anthropic -->

Everything in `api/`, `web/` and the repo config is now in English, and both test suites pass at their thresholds. I couldn't run three checks (`gen:api`, Prettier, the browser test), listed below.

**Results**
- **Backend:** 117 passed, 98.39% coverage. That's the same count as `main`: the number of test functions is the same (89), and the 116 in the old progress notes came from before a later commit.
- **Frontend:** 118 passed, 99.4% line coverage, same as before.
- **Static checks:** `tsc --noEmit` and ESLint are clean. `ruff check` reports only the long line in `0001_initial.py`, which is also on `main`.
- **Accent grep:** the only hit is "Ana Pérez", a person's name used in backend test fixtures.
- **Spanish-word grep:** what's left is `mapa-mental` (the repo, package names and FastAPI title) and `mapa` as the default PostgreSQL user and database name. Changing `mapa` would break existing `db-data` volumes, so I left it.

**Not done — these were refused here, so please run them**
- `pnpm --dir web gen:api`: I updated the three descriptions in `web/src/api/schema.ts` by hand to match the backend. Running it and confirming `git diff web/src/api/schema.ts` is empty is still open (spec criterion 5).
- `pnpm --dir web exec prettier --check src`.
- The `setup_command` and `test_command` exactly as written: the shell blocks the `{ … }` groups, so I ran their parts separately with the same arguments.
- The manual check in the browser (spec criterion 9).

**Files changed**
- **Backend:** docstrings, comments, error messages (`detail`) and the `Field` descriptions throughout `api/app/`, plus `api/scripts/export_openapi.py`, `migrations/env.py`, `alembic.ini` and the first docstring line of `0001_initial.py`. Revision ids are untouched.
- **Backend tests:** `test_entorno.py` is now `test_environment.py`, `test_criterio_*` is now `test_criterion_*`, and `test_ca*` is now `test_ac*`. I added `detail` assertions for 401, 403, 404 and 409 inside existing tests, without adding new tests.
- **Frontend:** all UI text and `aria-label`s, `DeleteDialog`, `ShortcutsHelp`, the notices, `LoginScreen`, `NotFound` and comments. The test helpers (`fakeApi.ts`, `renderApp.tsx`, `setup.ts`) and every `*.test.ts(x)` were updated to the new text.
- **Config and docs:** `.env.example`, `docker-compose.yml`, both Dockerfiles, `vite.config.ts`, the `pyproject.toml` description, `index.html` and `README.md`. `web/package.json` has no description to translate.

**Decisions**
- **App name:** the visible name is "Mind Map". The repo and package names stay `mapa-mental`.
- **Default root title:** a new user's root is now "My map" (was "Mi mapa").
- **Key names in the shortcuts panel:** Space, Delete, Backspace, Arrows, Double click. The keys the app actually handles don't change.
- **Wording:** the UI says "idea" and the code says "node". "Salir" became "Sign out" and the breadcrumb label became "Breadcrumb".

No ADR needed. Nothing is committed, and `.agents/progress.md` has the details, including each refused command.

**To check it yourself**
```sh
uv run --directory api pytest -q --cov=app --cov-report=term-missing --cov-fail-under=80
pnpm --dir web exec vitest run --coverage
pnpm --dir web gen:api && git diff --exit-code web/src/api/schema.ts
rg -n '[áéíóúüñÁÉÍÓÚÜÑ¿¡]' api web/src web/index.html .env.example docker-compose.yml --glob '!.venv'
docker compose up --build   # then test login, create, rename, collapse, focus, both delete modes and the "?" panel
```

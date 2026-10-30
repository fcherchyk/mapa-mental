"""Tests de la limpieza del repo (LICENSE, README en inglés, guía de OAuth, Roadmap).

Cada test nombra el criterio de aceptación de la spec que cubre (`criterio N`).
"""

import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
README = (ROOT / "README.md").read_text(encoding="utf-8")
SECRET_CMD = 'python -c "import secrets; print(secrets.token_urlsafe(32))"'
REDIRECT = "http://localhost:5173/api/auth/callback"


def git(*args: str) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        pytest.skip(f"git {' '.join(args)} no disponible: {result.stderr.strip()}")
    return result.stdout


def section(text: str, heading: str) -> str:
    """Cuerpo de una sección `## heading` hasta la siguiente `## `."""
    match = re.search(rf"^## {re.escape(heading)}\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    assert match, f"falta la sección ## {heading}"
    return match.group(1)


def bullets(body: str) -> list[str]:
    return re.findall(r"^- .*", body, re.M)


def numbered_steps() -> list[str]:
    return re.split(r"^\d+\. ", section(README, "Installation"), flags=re.M)[1:]


def roadmap_items() -> list[str]:
    return bullets(section(README, "Roadmap"))


# --- criterio 1 ---


def test_criterio_1_license_mit_con_copyright_exacto():
    text = (ROOT / "LICENSE").read_text(encoding="utf-8")
    assert text.startswith("MIT License")
    assert "\nCopyright (c) 2026 Federico Cherchyk\n" in text


def test_criterio_1_license_tiene_el_texto_mit_completo():
    text = (ROOT / "LICENSE").read_text(encoding="utf-8")
    for fragment in (
        "Permission is hereby granted, free of charge, to any person obtaining a copy",
        "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
        "The above copyright notice and this permission notice shall be included in all",
        'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
        "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
    ):
        assert fragment in text


# --- criterio 2 ---


def test_criterio_2_encabezados_h2_en_orden():
    headings = re.findall(r"^## (.+)$", README, re.M)
    assert headings == [
        "Features",
        "Installation",
        "Usage",
        "Tests",
        "Structure",
        "Roadmap",
        "License",
    ]


def test_criterio_2_features_mantiene_la_cantidad_de_vinetas():
    old = git("show", "main:README.md")
    if "## Funcionalidades" not in old:
        pytest.skip("main ya tiene el README traducido")
    new_count = len(bullets(section(README, "Features")))
    assert new_count == len(bullets(section(old, "Funcionalidades")))


def test_criterio_2_conserva_comandos_rutas_y_endpoints():
    for expected in (
        "docker compose up --build",
        "uv run --directory api pytest -q --cov=app --cov-report=term-missing --cov-fail-under=80",
        "pnpm --dir web exec vitest run --coverage",
        "pnpm --dir web gen:api",
        "pnpm --dir web dev",
        "uv sync --directory api",
        "pnpm --dir web install --frozen-lockfile",
        "/api/nodes/{id}/view?depth=N",
        "GET /api/me",
        "PATCH /api/me/settings",
        "POST /api/nodes/{id}/children",
        "PATCH /api/nodes/{id}",
        "DELETE /api/nodes/{id}",
        "?children=cascade",
        "?children=reparent",
        "`422`",
        "`404`",
        "X-CSRF: 1",
        "api/scripts/export_openapi.py",
        "web/src/test/fakeApi.ts",
        "api/tests/test_delete_modes.py",
        "web/src/deleteModes.test.tsx",
        "web/src/actions.test.tsx",
        "http://127.0.0.1:8000/docs",
    ):
        assert expected in README, expected


def test_criterio_2_no_queda_prosa_en_espanol():
    # Se quitan bloques de código, código en línea y textos entre comillas (UI citada).
    prose = re.sub(r"```.*?```", "", README, flags=re.S)
    prose = re.sub(r"`[^`]*`", "", prose)
    prose = re.sub(r'"[^"\n]*"', "", prose)
    spanish = re.compile(
        r"\b(el|la|los|las|con|para|que|una|del|por|sin|como|cuando|desde|también|hacia|según)\b"
        r"|ción\b",
        re.I,
    )
    hits = [
        line
        for line in prose.splitlines()
        if spanish.search(line) and not line.lstrip().startswith("#")
    ]
    assert not hits, hits


def test_criterio_2_seccion_license_referencia_el_archivo():
    assert section(README, "License").strip() == "MIT, see LICENSE"


# --- criterio 3 ---


def test_criterio_3_guia_tiene_seis_pasos_numerados():
    body = section(README, "Installation")
    assert re.findall(r"^(\d+)\. ", body, re.M) == ["1", "2", "3", "4", "5", "6"]


def test_criterio_3_paso_1_proyecto_de_google_cloud():
    step = numbered_steps()[0]
    assert "Google Cloud" in step and re.search(r"project", step, re.I)


def test_criterio_3_paso_2_consentimiento_testing_y_usuarios_de_prueba():
    step = numbered_steps()[1]
    assert "consent screen" in step.lower()
    assert "Testing" in step
    assert re.search(r"test users", step, re.I)


def test_criterio_3_paso_3_cliente_web_con_redirect_exacto():
    step = numbered_steps()[2]
    assert "Web application" in step
    assert f"`{REDIRECT}`" in step


def test_criterio_3_paso_4_env_credenciales_y_advertencia():
    step = numbered_steps()[3]
    assert "cp .env.example .env" in step
    assert "GOOGLE_CLIENT_ID" in step and "GOOGLE_CLIENT_SECRET" in step
    assert re.search(r"never commit", step, re.I)


def test_criterio_3_paso_5_secretos_y_database_url():
    step = numbered_steps()[4]
    assert SECRET_CMD in step
    assert "SESSION_SECRET" in step and "POSTGRES_PASSWORD" in step
    assert "DATABASE_URL" in step


def test_criterio_3_paso_6_docker_compose_y_project_directory():
    step = numbered_steps()[5]
    assert "docker compose up --build" in step
    assert "docker compose --project-directory <path> up --build" in step


def test_criterio_3_volumen_db_data_y_down_v():
    body = section(README, "Installation")
    assert "`db-data`" in body
    assert "docker compose down -v" in body


# --- criterio 4 ---


def test_criterio_4_variables_de_la_guia_existen_en_env_example():
    env = (ROOT / ".env.example").read_text(encoding="utf-8")
    names = set(re.findall(r"`([A-Z][A-Z_]+_[A-Z_]+)`", section(README, "Installation")))
    assert {"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET"} <= names
    for name in names:
        assert re.search(rf"^{name}=", env, re.M), name


def test_criterio_4_comando_de_secreto_coincide_con_env_example():
    assert SECRET_CMD in (ROOT / ".env.example").read_text(encoding="utf-8")


def test_criterio_4_volumen_db_data_en_compose():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert re.search(r"^volumes:\n(?:.*\n)*?  db-data:", compose, re.M)


def test_criterio_4_redirect_uri_coincide_con_env_example():
    assert REDIRECT in (ROOT / ".env.example").read_text(encoding="utf-8")


def test_criterio_4_env_esta_en_gitignore():
    assert ".env" in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()


def test_criterio_4_database_url_de_la_guia_coincide_con_env_example():
    env = (ROOT / ".env.example").read_text(encoding="utf-8")
    assert "postgresql+psycopg://mapa:<password>@db:5432/mapa" in section(README, "Installation")
    assert "postgresql+psycopg://mapa:<POSTGRES_PASSWORD>@db:5432/mapa" in env


# --- criterio 5 ---


def test_criterio_5_todos_los_items_son_checkbox():
    items = roadmap_items()
    assert items
    assert all(re.match(r"- \[[ x]\] ", i) for i in items)


def test_criterio_5_items_hechos_son_los_del_mvp():
    done = [i for i in roadmap_items() if i.startswith("- [x]")]
    text = "\n".join(done).lower()
    assert len(done) == 5
    for keyword in ("google login", "focus", "create, edit, collapse", "discoverable", "delete"):
        assert keyword in text, keyword


def test_criterio_5_pendientes_cubren_lo_planificado():
    todo = "\n".join(i for i in roadmap_items() if i.startswith("- [ ]")).lower()
    for keyword in (
        "drive",
        "spreadsheets",
        "calendar events",
        "tasks",
        "repositories",
        "google calendar",
        "trello",
        "github",
        "mobile app",
        "pwa",
        "deployment",
    ):
        assert keyword in todo, keyword


def test_criterio_5_lo_hecho_tiene_respaldo_en_el_repo():
    for path in (
        "api/app/auth",
        "api/app/nodes",
        "web/src/components/ShortcutsHelp.tsx",
        "web/src/components/DeleteDialog.tsx",
        "web/src/deleteModes.test.tsx",
        "web/src/actions.test.tsx",
        "api/tests/test_delete_modes.py",
    ):
        assert (ROOT / path).exists(), path
    structure = section(README, "Structure")
    for module in ("auth/", "nodes/", "ShortcutsHelp", "DeleteDialog"):
        assert module in structure, module


def test_criterio_5_nada_de_los_cortes_futuros_figura_como_hecho():
    done = "\n".join(i for i in roadmap_items() if i.startswith("- [x]")).lower()
    for future in ("drag", "reorder", "drive", "trello", "github", "calendar", "mobile", "deploy"):
        assert future not in done, future


# --- criterio 6 ---


def test_criterio_6_solo_cambian_license_y_readme():
    files = set(git("diff", "--name-only", "main...HEAD").split())
    # Se ignoran la bitácora del orquestador (.agents/) y este archivo de verificación.
    files = {f for f in files if not f.startswith(".agents/")}
    files -= {"api/tests/test_repo_docs.py"}
    assert files <= {"LICENSE", "README.md"}, files

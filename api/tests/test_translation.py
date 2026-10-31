"""Acceptance tests of the Spanish -> English translation (criteria 1, 2, 5 and 7)."""

import re
import subprocess
from pathlib import Path

from app.config import Config
from app.main import create_app

REPO = Path(__file__).resolve().parents[2]
SKIPPED_DIRS = {".venv", "node_modules", "__pycache__", ".pytest_cache", ".ruff_cache", "coverage"}
LIVE_ROOTS = ["api", "web/src"]
LIVE_FILES = [
    "web/index.html",
    "web/vite.config.ts",
    "web/package.json",
    "api/pyproject.toml",
    ".env.example",
    "docker-compose.yml",
    "api/Dockerfile",
    "web/Dockerfile",
]
TEXT_SUFFIXES = {".py", ".ts", ".tsx", ".css", ".html", ".json", ".toml", ".ini", ".md", ""}
ACCENTS = re.compile("[áéíóúüñÁÉÍÓÚÜÑ¿¡]")
PROPER_NAMES = ("Pérez",)
# Unambiguous Spanish words (no English homographs), matched case-insensitively.
SPANISH_WORDS = re.compile(
    r"\b(nodos?|borrar|hijos?|padre|raiz|criterio|sesion|cancelar|atajos|editar|enfocar|"
    r"niveles|devuelve|vencida|inexistente|ideas? nueva|volvé|tocá)\b",
    re.IGNORECASE,
)


def live_files() -> list[Path]:
    files = [REPO / name for name in LIVE_FILES]
    for root in LIVE_ROOTS:
        for path in (REPO / root).rglob("*"):
            if (
                path.is_file()
                and path.suffix in TEXT_SUFFIXES
                and not SKIPPED_DIRS & set(path.parts)
                and path.name not in {"uv.lock", "pnpm-lock.yaml"}
            ):
                files.append(path)
    return [f for f in dict.fromkeys(files) if f.exists()]


def matches(pattern: re.Pattern[str], strip_names: bool = False) -> list[str]:
    found = []
    for path in live_files():
        if path == Path(__file__):
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue  # binary file
        for number, line in enumerate(lines, 1):
            for name in PROPER_NAMES if strip_names else ():
                line = line.replace(name, "")
            if pattern.search(line):
                found.append(f"{path.relative_to(REPO)}:{number}: {line.strip()}")
    return found


def test_criterion_1_no_accented_spanish_characters_in_live_files() -> None:
    assert matches(ACCENTS, strip_names=True) == []


def test_criterion_2_no_common_spanish_words_in_live_files() -> None:
    assert matches(SPANISH_WORDS) == []


def test_criterion_5_schema_ts_carries_the_english_openapi_descriptions() -> None:
    config = Config(
        database_url="postgresql+psycopg://x:x@localhost:5432/x",
        session_secret="x",
        google_client_id="",
        google_client_secret="",
    )
    schema_ts = (REPO / "web/src/api/schema.ts").read_text(encoding="utf-8")
    descriptions = {
        value["description"]
        for value in create_app(config).openapi()["components"]["schemas"].values()
        for value in value.get("properties", {}).values()
        if "description" in value
    }
    assert descriptions
    for description in descriptions:
        assert description in schema_ts


def test_criterion_7_migration_revision_ids_are_unchanged() -> None:
    source = (REPO / "api/migrations/versions/0001_initial.py").read_text(encoding="utf-8")
    assert 'revision: str = "0001"' in source
    assert "down_revision: str | None = None" in source
    assert len(list((REPO / "api/migrations/versions").glob("*.py"))) == 1


def test_criterion_7_history_directories_are_untouched() -> None:
    result = subprocess.run(
        [
            "git",
            "diff",
            "--name-only",
            "--diff-filter=MDR",
            "main",
            "--",
            ".agents/memory/specs",
            ".agents/memory/adr",
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return  # no `main` ref available in this checkout
    assert result.stdout.strip() == ""

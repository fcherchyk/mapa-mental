"""Writes the API's OpenAPI to a file, without starting the server or connecting to the database.

Usage: uv run --directory api python scripts/export_openapi.py ../web/openapi.json
"""

import json
import sys
from pathlib import Path

from app.config import Config
from app.main import create_app

# The schema does not depend on the configuration; create_app opens no connections when built.
PLACEHOLDER_CONFIG = Config(
    database_url="postgresql+psycopg://openapi:openapi@localhost:5432/openapi",
    session_secret="openapi",
    google_client_id="",
    google_client_secret="",
)


def export_openapi(target: Path) -> None:
    schema = create_app(PLACEHOLDER_CONFIG).openapi()
    target.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    export_openapi(Path(sys.argv[1]))

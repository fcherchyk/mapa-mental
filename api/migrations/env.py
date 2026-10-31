"""Alembic environment: migrates against `sqlalchemy.url` or, if unset, `DATABASE_URL`."""

import os

from alembic import context
from sqlalchemy import create_engine

from app import models  # noqa: F401  (registers the tables in the metadata)
from app.db import Base


def database_url() -> str:
    return context.config.get_main_option("sqlalchemy.url") or os.environ["DATABASE_URL"]


def run_migrations_offline() -> None:
    context.configure(url=database_url(), target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(database_url())
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

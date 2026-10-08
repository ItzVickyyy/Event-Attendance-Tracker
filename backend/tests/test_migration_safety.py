import pytest
from sqlalchemy import Connection, create_engine, text

from app.alembic.migration_safety import (
    NORMALIZED_TABLES,
    guard_populated_legacy_schema,
    guard_populated_normalized_schema_before_downgrade,
)

LEGACY_TABLES = ("student", "event", "attendance")
LEGACY_REVISION = "bdb851e7e407"


def create_legacy_tables(connection: Connection) -> None:
    for table in LEGACY_TABLES:
        connection.execute(text(f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY)'))


def test_legacy_migration_guard_allows_empty_tables() -> None:
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_legacy_tables(connection)
        guard_populated_legacy_schema(connection, LEGACY_REVISION)


@pytest.mark.parametrize("table", LEGACY_TABLES)
def test_legacy_migration_guard_refuses_populated_tables(table: str) -> None:
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_legacy_tables(connection)
        connection.execute(text(f'INSERT INTO "{table}" (id) VALUES (1)'))

        with pytest.raises(RuntimeError, match=f"{table}=1"):
            guard_populated_legacy_schema(connection, LEGACY_REVISION)


def test_legacy_migration_guard_does_not_block_other_revisions() -> None:
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_legacy_tables(connection)
        connection.execute(text('INSERT INTO "student" (id) VALUES (1)'))
        guard_populated_legacy_schema(connection, "1197a9a57c90")

def create_normalized_tables(connection: Connection) -> None:
    for table in NORMALIZED_TABLES:
        connection.execute(text(f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY)'))


def test_normalized_schema_downgrade_guard_allows_empty_tables() -> None:
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_normalized_tables(connection)
        guard_populated_normalized_schema_before_downgrade(connection)


@pytest.mark.parametrize("table", NORMALIZED_TABLES)
def test_normalized_schema_downgrade_guard_refuses_populated_tables(
    table: str,
) -> None:
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        create_normalized_tables(connection)
        connection.execute(text(f'INSERT INTO "{table}" (id) VALUES (1)'))

        with pytest.raises(RuntimeError, match=f"{table}=1"):
            guard_populated_normalized_schema_before_downgrade(connection)


"""Preflight guards for migrations that replace legacy database tables."""

from sqlalchemy import Connection, inspect, text

LEGACY_SCHEMA_REVISION = "bdb851e7e407"


def guard_populated_legacy_schema(
    connection: Connection, current_revision: str | None
) -> None:
    """Stop before 3NF migration if it would silently discard existing records."""
    if current_revision != LEGACY_SCHEMA_REVISION:
        return

    inspector = inspect(connection)
    counts: dict[str, int] = {}
    for table in ("student", "event", "attendance"):
        if inspector.has_table(table):
            count = connection.execute(
                text(f'SELECT COUNT(*) FROM "{table}"')
            ).scalar_one()
            if count:
                counts[table] = int(count)

    if counts:
        summary = ", ".join(f"{table}={count}" for table, count in counts.items())
        raise RuntimeError(
            "Refusing to apply migration 1197a9a57c90_normalize_schema_3nf because "
            f"legacy tables contain records ({summary}). The migration drops the "
            "legacy student/event tables and replaces attendance event/student keys "
            "without a data backfill. Back up and migrate these records explicitly "
            "before retrying. No migrations were applied by this preflight check."
        )

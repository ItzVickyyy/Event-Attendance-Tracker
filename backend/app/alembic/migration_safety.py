"""Preflight guards for migrations that replace legacy database tables."""

from collections.abc import Sequence

from sqlalchemy import Connection, inspect, text

LEGACY_SCHEMA_REVISION = "bdb851e7e407"


def guard_populated_legacy_schema(
    connection: Connection, current_revisions: str | Sequence[str] | None
) -> None:
    """Stop before 3NF migration if it would silently discard existing records."""
    if current_revisions is None:
        return
    if isinstance(current_revisions, str):
        includes_legacy_revision = current_revisions == LEGACY_SCHEMA_REVISION
    else:
        includes_legacy_revision = LEGACY_SCHEMA_REVISION in current_revisions
    if not includes_legacy_revision:
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

NORMALIZED_TABLES = (
    "academic_programs",
    "organizations",
    "people",
    "academic_sections",
    "attendees",
    "events",
    "attendee_credentials",
    "event_registrations",
    "students",
    "attendee_relationships",
    "attendance",
    "attendance_corrections",
)


def guard_populated_normalized_schema_before_downgrade(
    connection: Connection,
) -> None:
    """Refuse the legacy-schema downgrade if normalized records would be discarded."""
    inspector = inspect(connection)
    counts: dict[str, int] = {}
    for table in NORMALIZED_TABLES:
        if inspector.has_table(table):
            count = connection.execute(
                text(f'SELECT COUNT(*) FROM "{table}"')
            ).scalar_one()
            if count:
                counts[table] = int(count)

    if counts:
        summary = ", ".join(f"{table}={count}" for table, count in counts.items())
        raise RuntimeError(
            "Refusing to downgrade migration 1197a9a57c90_normalize_schema_3nf "
            "because normalized tables contain records that the downgrade would "
            f"discard ({summary}). Export and migrate the data explicitly before "
            "retrying. No downgrade operations were applied by this preflight check."
        )

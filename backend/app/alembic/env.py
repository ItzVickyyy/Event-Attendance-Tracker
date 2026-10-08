from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, inspect, pool, text

config = context.config

assert config.config_file_name is not None
fileConfig(config.config_file_name)

from app.models import SQLModel  # noqa: E402
from app.core.config import settings  # noqa: E402
from app import academic_catalog  # noqa: F401,E402

target_metadata = SQLModel.metadata


def get_url():
    return str(settings.DATABASE_URL)


def run_migrations_offline():
    url = get_url()
    context.configure(
        url=url, target_metadata=target_metadata, literal_binds=True, compare_type=True
    )

    with context.begin_transaction():
        context.run_migrations()


def _guard_populated_legacy_schema(connection):
    """Refuse the 3NF migration when it would discard legacy records."""
    migration_context = context.get_context()
    if migration_context.get_current_revision() != "bdb851e7e407":
        return

    inspector = inspect(connection)
    counts = {}
    for table in ("student", "event", "attendance"):
        if inspector.has_table(table):
            count = connection.execute(
                text(f'SELECT COUNT(*) FROM "{table}"')
            ).scalar_one()
            if count:
                counts[table] = count

    if counts:
        summary = ", ".join(f"{table}={count}" for table, count in counts.items())
        raise RuntimeError(
            "Refusing to apply migration 1197a9a57c90_normalize_schema_3nf because "
            f"legacy tables contain records ({summary}). The migration drops the "
            "legacy student/event tables and replaces attendance event/student keys "
            "without a data backfill. Back up and migrate these records explicitly "
            "before retrying. No migrations were applied by this preflight check."
        )


def run_migrations_online():
    configuration = config.get_section(config.config_ini_section)
    assert configuration is not None
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, compare_type=True
        )
        _guard_populated_legacy_schema(connection)

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
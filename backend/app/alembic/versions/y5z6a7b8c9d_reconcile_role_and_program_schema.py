"""Reconcile application role and academic program schema drift.

This repairs databases where the earlier academic-program width migration was
recorded but the physical columns remain too narrow. It also migrates legacy
Developer-role accounts to the normal Student application role while preserving
their separate technical capability and removing accidental superuser override.
"""

from alembic import op
import sqlalchemy as sa

revision = "y5z6a7b8c9d"
down_revision = "x4y5z6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("academic_programs"):
        columns = {
            column["name"]: column
            for column in inspector.get_columns("academic_programs")
        }
        for name, length in (("program_name", 255), ("program_code", 50)):
            column = columns.get(name)
            if column is not None and getattr(column["type"], "length", None) != length:
                op.alter_column(
                    "academic_programs",
                    name,
                    existing_type=column["type"],
                    type_=sa.String(length=length),
                    existing_nullable=column["nullable"],
                )

    if inspector.has_table("user"):
        user_columns = {
            column["name"] for column in inspector.get_columns("user")
        }
        if "role" in user_columns:
            if "is_developer" in user_columns:
                bind.execute(
                    sa.text(
                        "UPDATE \"user\" SET is_developer = TRUE "
                        "WHERE role = 'developer'"
                    )
                )
            if "is_superuser" in user_columns:
                bind.execute(
                    sa.text(
                        "UPDATE \"user\" SET is_superuser = FALSE "
                        "WHERE role = 'developer'"
                    )
                )
            bind.execute(
                sa.text(
                    "UPDATE \"user\" SET role = 'student' "
                    "WHERE role = 'developer'"
                )
            )


def downgrade() -> None:
    # Intentionally irreversible: restoring the legacy role would reintroduce
    # technical access as an application role and could restore unsafe privilege
    # combinations. Expanded column widths are also retained to avoid truncation.
    pass

"""Enforce academic program column widths after all schema repairs.

Revision ID: a1b2c3d4e5f6
Revises: z6a7b8c9d0e1
"""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "z6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("academic_programs"):
        return

    columns = {
        column["name"]: column
        for column in inspector.get_columns("academic_programs")
    }
    for name, length in (("program_name", 255), ("program_code", 50)):
        column = columns.get(name)
        if column is None:
            continue
        if getattr(column["type"], "length", None) != length:
            op.alter_column(
                "academic_programs",
                name,
                existing_type=column["type"],
                type_=sa.String(length=length),
                existing_nullable=column["nullable"],
            )


def downgrade() -> None:
    # Keeping the wider columns avoids truncating valid catalog values.
    pass

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

    # Use explicit PostgreSQL DDL instead of relying on reflected type lengths.
    # The preceding reconciliation migration can be recorded as applied while
    # a deployed database still retains the legacy VARCHAR(20) columns.
    op.execute(
        "ALTER TABLE academic_programs "
        "ALTER COLUMN program_name TYPE VARCHAR(255), "
        "ALTER COLUMN program_code TYPE VARCHAR(50)"
    )

    refreshed = sa.inspect(bind)
    columns = {
        column["name"]: column
        for column in refreshed.get_columns("academic_programs")
    }
    if "reference_code" in columns:
        reference_code = columns["reference_code"]
        op.alter_column(
            "academic_programs",
            "reference_code",
            existing_type=reference_code["type"],
            existing_nullable=reference_code["nullable"],
            server_default=sa.text(
                "'PRG-' || "
                "LPAD(nextval('academic_program_reference_code_seq'::regclass)::text, 6, '0')"
            ),
        )

    refreshed = sa.inspect(bind)
    widths = {
        column["name"]: getattr(column["type"], "length", None)
        for column in refreshed.get_columns("academic_programs")
    }
    if widths.get("program_name") != 255 or widths.get("program_code") != 50:
        raise RuntimeError(
            "Academic program column widths were not repaired: "
            f"program_name={widths.get('program_name')}, "
            f"program_code={widths.get('program_code')}"
        )

def downgrade() -> None:
    # Keeping the wider columns avoids truncating valid catalog values.
    pass

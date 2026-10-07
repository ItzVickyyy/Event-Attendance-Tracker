"""Repair academic program widths and reference code defaults.

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

    # Repair every reference-code default. The original migration passed
    # expression strings without sa.text(), which can leave the whole SQL
    # expression stored as a literal default and overflow VARCHAR(20).
    reference_code_defaults = (
        ("user", "USR", "user_reference_code_seq"),
        ("organizations", "ORG", "organization_reference_code_seq"),
        ("academic_programs", "PRG", "academic_program_reference_code_seq"),
        ("academic_sections", "SEC", "academic_section_reference_code_seq"),
        ("students", "STU", "student_reference_code_seq"),
        ("events", "EVT", "event_reference_code_seq"),
        ("attendance_sessions", "SES", "attendance_session_reference_code_seq"),
    )
    for table, prefix, sequence in reference_code_defaults:
        refreshed = sa.inspect(bind)
        if not refreshed.has_table(table):
            continue
        table_columns = {
            column["name"]: column for column in refreshed.get_columns(table)
        }
        reference_code = table_columns.get("reference_code")
        if reference_code is None:
            continue
        op.alter_column(
            table,
            "reference_code",
            existing_type=reference_code["type"],
            existing_nullable=reference_code["nullable"],
            server_default=sa.text(
                f"'{prefix}-' || "
                f"LPAD(nextval('{sequence}'::regclass)::text, 6, '0')"
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

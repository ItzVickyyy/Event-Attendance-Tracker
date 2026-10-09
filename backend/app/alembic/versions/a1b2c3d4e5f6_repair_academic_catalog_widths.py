"""Repair academic catalog widths and reference-code defaults.

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
    if inspector.has_table("academic_programs"):
        op.execute(
            "ALTER TABLE academic_programs "
            "ALTER COLUMN program_name TYPE VARCHAR(255), "
            "ALTER COLUMN program_code TYPE VARCHAR(50)"
        )
        op.execute(
            "ALTER TABLE academic_programs ALTER COLUMN reference_code "
            "SET DEFAULT ('PRG-' || LPAD(nextval('academic_program_reference_code_seq'::regclass)::text, 6, '0'))"
        )

    if inspector.has_table("academic_sections"):
        op.execute(
            "ALTER TABLE academic_sections ALTER COLUMN section_code TYPE VARCHAR(50)"
        )
        op.execute(
            "ALTER TABLE academic_sections ALTER COLUMN reference_code "
            "SET DEFAULT ('SEC-' || LPAD(nextval('academic_section_reference_code_seq'::regclass)::text, 6, '0'))"
        )

    reference_defaults = (
        ('"user"', "USR", "user_reference_code_seq"),
        ("organizations", "ORG", "organization_reference_code_seq"),
        ("students", "STU", "student_reference_code_seq"),
        ("events", "EVT", "event_reference_code_seq"),
        ("attendance_sessions", "SES", "attendance_session_reference_code_seq"),
    )
    for table, prefix, sequence in reference_defaults:
        if inspector.has_table(table):
            columns = {column["name"] for column in sa.inspect(bind).get_columns(table)}
            if "reference_code" in columns:
                op.execute(
                    f"ALTER TABLE {table} ALTER COLUMN reference_code "
                    f"SET DEFAULT ('{prefix}-' || LPAD(nextval('{sequence}'::regclass)::text, 6, '0'))"
                )

    refreshed = sa.inspect(bind)
    if refreshed.has_table("academic_programs"):
        widths = {
            column["name"]: getattr(column["type"], "length", None)
            for column in refreshed.get_columns("academic_programs")
        }
        if widths.get("program_name") != 255 or widths.get("program_code") != 50:
            raise RuntimeError(f"Academic program widths remain incorrect: {widths}")


def downgrade() -> None:
    # Do not narrow catalog columns or restore malformed defaults.
    pass

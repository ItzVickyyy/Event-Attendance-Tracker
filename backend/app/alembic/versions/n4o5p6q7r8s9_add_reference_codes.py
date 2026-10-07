"""add human-readable sequential reference codes

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
"""

from alembic import op
import sqlalchemy as sa

revision = "n4o5p6q7r8s9"
down_revision = "m3n4o5p6q7r8"
branch_labels = None
depends_on = None

TABLES = (
    ("user", "USR", "user_reference_code_seq"),
    ("organizations", "ORG", "organization_reference_code_seq"),
    ("academic_programs", "PRG", "academic_program_reference_code_seq"),
    ("academic_sections", "SEC", "academic_section_reference_code_seq"),
    ("students", "STU", "student_reference_code_seq"),
    ("events", "EVT", "event_reference_code_seq"),
    ("attendance_sessions", "SES", "attendance_session_reference_code_seq"),
)


def upgrade() -> None:
    for table, prefix, sequence in TABLES:
        quoted = '"user"' if table == "user" else table

        op.execute(f'CREATE SEQUENCE IF NOT EXISTS "{sequence}"')

        op.add_column(
            table,
            sa.Column("reference_code", sa.String(20), nullable=True),
        )

        op.execute(
            f"""
            WITH numbered AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (ORDER BY created_at NULLS FIRST, id) AS n
                FROM {quoted}
            )
            UPDATE {quoted} AS t
            SET reference_code = '{prefix}-' || LPAD(numbered.n::text, 6, '0')
            FROM numbered
            WHERE t.id = numbered.id
            """
        )

        op.execute(
            f"""
            SELECT setval(
                '"{sequence}"',
                COALESCE(
                    (
                        SELECT MAX(
                            CAST(
                                SUBSTRING(reference_code FROM '[0-9]+$')
                                AS BIGINT
                            )
                        )
                        FROM {quoted}
                    ),
                    1
                ),
                (SELECT COUNT(*) > 0 FROM {quoted})
            )
            """
        )

        op.alter_column(
            table,
            "reference_code",
            nullable=False,
            server_default=(
                f"'{prefix}-' || "
                f"LPAD(nextval('{sequence}'::regclass)::text, 6, '0')"
            ),
        )

        constraint = f"uq_{table.replace('user', 'usr')}_reference_code"
        op.create_unique_constraint(constraint, table, ["reference_code"])


def downgrade() -> None:
    for table, _prefix, sequence in reversed(TABLES):
        constraint = f"uq_{table.replace('user', 'usr')}_reference_code"
        op.drop_constraint(constraint, table, type_="unique")
        op.drop_column(table, "reference_code")
        op.execute(f'DROP SEQUENCE IF EXISTS "{sequence}"')

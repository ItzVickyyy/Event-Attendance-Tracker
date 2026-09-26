"""finalize academic-year scoped student model

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "academic_years",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=20), nullable=False),
        sa.Column("start_year", sa.Integer(), nullable=False),
        sa.Column("end_year", sa.Integer(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("label", name="uq_academic_year_label"),
    )
    op.create_index("ix_academic_years_label", "academic_years", ["label"], unique=True)

    op.add_column("academic_sections", sa.Column("academic_year_id", sa.Uuid(), nullable=True))
    op.add_column("academic_sections", sa.Column("section_code", sa.String(length=20), nullable=True))
    op.create_foreign_key(
        "fk_academic_sections_academic_year_id",
        "academic_sections",
        "academic_years",
        ["academic_year_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_academic_sections_academic_year_id", "academic_sections", ["academic_year_id"])
    op.create_index("ix_academic_sections_section_code", "academic_sections", ["section_code"])

    op.add_column("students", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_students_archived_at", "students", ["archived_at"])

    op.create_table(
        "student_enrollments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False),
        sa.Column("section_id", sa.Uuid(), nullable=False),
        sa.Column("student_status", sa.String(length=50), nullable=False, server_default="regular"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["academic_year_id"], ["academic_years.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["section_id"], ["academic_sections.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "academic_year_id", name="uq_student_enrollment_student_year"),
    )
    op.create_index("ix_student_enrollments_student_id", "student_enrollments", ["student_id"])
    op.create_index("ix_student_enrollments_academic_year_id", "student_enrollments", ["academic_year_id"])
    op.create_index("ix_student_enrollments_section_id", "student_enrollments", ["section_id"])

    conn = op.get_bind()

    # Preserve every legacy academic year represented by existing sections.
    # The previous implementation only created 2026-2027, which left older
    # sections without an academic_year_id and caused the NOT NULL transition
    # below to fail on databases containing historical section data.
    conn.execute(text("""
        INSERT INTO academic_years
            (id, label, start_year, end_year, is_current, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            ay.label,
            split_part(ay.label, '-', 1)::integer,
            split_part(ay.label, '-', 2)::integer,
            ay.label = '2026-2027',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM (
            SELECT DISTINCT trim(academic_year) AS label
            FROM academic_sections
            WHERE academic_year IS NOT NULL
              AND trim(academic_year) <> ''
              AND trim(academic_year) ~ '^[0-9]{4}-[0-9]{4}$'
        ) ay
        ON CONFLICT (label) DO UPDATE
        SET is_current = EXCLUDED.is_current
    """))

    # Ensure the current academic year exists even when there are no legacy
    # sections carrying that label yet.
    conn.execute(text("""
        INSERT INTO academic_years
            (id, label, start_year, end_year, is_current, created_at, updated_at)
        VALUES
            ('00000000-0000-0000-0000-000000002026', '2026-2027', 2026, 2027, true,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (label) DO UPDATE
        SET is_current = true
    """))

    # Map legacy section rows to the normalized academic_year records.
    conn.execute(text("""
        UPDATE academic_sections
        SET academic_year_id = ay.id
        FROM academic_years ay
        WHERE ay.label = trim(academic_sections.academic_year)
          AND academic_sections.academic_year_id IS NULL
    """))

    # Every existing section must be mapped before academic_year_id becomes
    # mandatory. Fail explicitly instead of silently assigning the wrong year
    # if legacy data contains an invalid or unsupported academic-year label.
    conn.execute(text("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM academic_sections
                WHERE academic_year_id IS NULL
            ) THEN
                RAISE EXCEPTION
                    'Cannot finalize academic_sections: one or more rows could not be mapped to academic_years';
            END IF;
        END $$;
    """))

    conn.execute(text("""
        UPDATE academic_sections
        SET section_code = trim(regexp_replace(section_name, '^(AMG|SMP|WMAD|IS)[[:space:]]+', ''))
        WHERE section_code IS NULL
    """))
    conn.execute(text("""
        UPDATE academic_sections
        SET section_code = section_name
        WHERE section_code IS NULL
    """))

    conn.execute(text("""
        INSERT INTO student_enrollments
            (id, student_id, academic_year_id, section_id, student_status, created_at, updated_at)
        SELECT md5(s.id::text || sec.id::text || sec.academic_year_id::text)::uuid,
               s.id, sec.academic_year_id, sec.id,
               COALESCE(CAST(s.academic_status AS TEXT), 'regular'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM students s
        JOIN academic_sections sec ON sec.id = s.section_id
        WHERE sec.academic_year_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM student_enrollments se
              WHERE se.student_id = s.id AND se.academic_year_id = sec.academic_year_id
          )
    """))

    op.alter_column("academic_sections", "academic_year_id", nullable=False)
    op.alter_column("academic_sections", "section_code", nullable=False)


def downgrade() -> None:
    op.drop_table("student_enrollments")
    op.drop_index("ix_students_archived_at", table_name="students")
    op.drop_column("students", "archived_at")
    op.drop_index("ix_academic_sections_section_code", table_name="academic_sections")
    op.drop_index("ix_academic_sections_academic_year_id", table_name="academic_sections")
    op.drop_constraint("fk_academic_sections_academic_year_id", "academic_sections", type_="foreignkey")
    op.drop_column("academic_sections", "section_code")
    op.drop_column("academic_sections", "academic_year_id")
    op.drop_index("ix_academic_years_label", table_name="academic_years")
    op.drop_table("academic_years")

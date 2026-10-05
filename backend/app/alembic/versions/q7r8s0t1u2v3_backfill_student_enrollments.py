"""backfill student enrollments from section assignments

Revision ID: q7r8s0t1u2v3
Revises: p6q7r8s0t1u2
"""

from alembic import op


revision = "q7r8s0t1u2v3"
down_revision = "p6q7r8s0t1u2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO student_enrollments (
            id,
            student_id,
            academic_year_id,
            section_id,
            student_status,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            s.id,
            sec.academic_year_id,
            sec.id,
            COALESCE(s.academic_status::text, 'regular'),
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM students s
        JOIN academic_sections sec ON sec.id = s.section_id
        WHERE s.section_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM student_enrollments se
              WHERE se.student_id = s.id
                AND se.academic_year_id = sec.academic_year_id
          )
        """
    )


def downgrade() -> None:
    # Enrollment records created by this migration are indistinguishable from
    # legitimate enrollment records after the migration runs, so they are not
    # deleted during downgrade.
    pass

"""scope events and attendance to academic years

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("academic_year_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_events_academic_year_id", "events", "academic_years", ["academic_year_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_events_academic_year_id", "events", ["academic_year_id"])
    op.add_column("attendance", sa.Column("academic_year_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_attendance_academic_year_id", "attendance", "academic_years", ["academic_year_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_attendance_academic_year_id", "attendance", ["academic_year_id"])
    conn = op.get_bind()
    conn.execute(text("""
        UPDATE events
        SET academic_year_id = (SELECT id FROM academic_years WHERE is_current = true ORDER BY start_year DESC LIMIT 1)
        WHERE academic_year_id IS NULL
    """))
    conn.execute(text("""
        UPDATE attendance a
        SET academic_year_id = e.academic_year_id
        FROM event_registrations er
        JOIN events e ON e.id = er.event_id
        WHERE a.registration_id = er.id AND a.academic_year_id IS NULL
    """))


def downgrade() -> None:
    op.drop_index("ix_attendance_academic_year_id", table_name="attendance")
    op.drop_constraint("fk_attendance_academic_year_id", "attendance", type_="foreignkey")
    op.drop_column("attendance", "academic_year_id")
    op.drop_index("ix_events_academic_year_id", table_name="events")
    op.drop_constraint("fk_events_academic_year_id", "events", type_="foreignkey")
    op.drop_column("events", "academic_year_id")

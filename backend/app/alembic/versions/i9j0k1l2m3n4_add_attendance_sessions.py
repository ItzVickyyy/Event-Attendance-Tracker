"""add event attendance sessions and session-scoped attendance

Revision ID: i9j0k1l2m3n4
Revises: h8c9d0e1f2a3
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision = "i9j0k1l2m3n4"
down_revision = "h8c9d0e1f2a3"
branch_labels = None
depends_on = None

session_type_enum = postgresql.ENUM("TIME_IN", "TIME_OUT", "CUSTOM", name="attendancesessiontype", create_type=False)
session_status_enum = postgresql.ENUM("SCHEDULED", "OPEN", "CLOSED", "CANCELLED", name="attendancesessionstatus", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    session_type_enum.create(bind, checkfirst=True)
    session_status_enum.create(bind, checkfirst=True)

    op.create_table(
        "attendance_sessions",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("session_date", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("session_type", session_type_enum, nullable=False),
        sa.Column("start_time", sa.String(length=10), nullable=True),
        sa.Column("end_time", sa.String(length=10), nullable=True),
        sa.Column("late_cutoff", sa.String(length=10), nullable=True),
        sa.Column("status", session_status_enum, nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attendance_sessions_event_id", "attendance_sessions", ["event_id"], unique=False)
    op.create_index("uq_attendance_sessions_active_event", "attendance_sessions", ["event_id"], unique=True, postgresql_where=text("is_active = true"))

    op.add_column("attendance", sa.Column("attendance_session_id", sa.Uuid(), nullable=True))
    op.add_column("attendance", sa.Column("is_late", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_attendance_attendance_session_id", "attendance", ["attendance_session_id"], unique=False)
    op.create_foreign_key("attendance_attendance_session_id_fkey", "attendance", "attendance_sessions", ["attendance_session_id"], ["id"], ondelete="CASCADE")

    # Backfill one default session per existing event and attach existing attendance to it.
    bind.execute(text("""
        INSERT INTO attendance_sessions (id, event_id, session_date, name, session_type, start_time, end_time, status, display_order, is_active, created_at, updated_at)
        SELECT md5('attendance-session:' || e.id::text)::uuid, e.id, e.event_date, 'Default Attendance', 'TIME_IN', e.start_time, e.end_time,
               CASE e.status::text WHEN 'open' THEN 'OPEN' ELSE CASE e.status::text WHEN 'closed' THEN 'CLOSED' ELSE 'SCHEDULED' END END::attendancesessionstatus,
               0, (e.status::text = 'open'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM events e
        WHERE NOT EXISTS (SELECT 1 FROM attendance_sessions s WHERE s.event_id = e.id)
    """))
    bind.execute(text("""
        UPDATE attendance a
        SET attendance_session_id = s.id
        FROM event_registrations er
        JOIN attendance_sessions s ON s.event_id = er.event_id AND s.display_order = 0
        WHERE a.registration_id = er.id AND a.attendance_session_id IS NULL
    """))
    op.alter_column("attendance", "attendance_session_id", nullable=False)
    op.alter_column("attendance", "is_late", server_default=None)
    op.drop_index("ix_attendance_registration_id", table_name="attendance")
    op.create_unique_constraint("uq_attendance_registration_session", "attendance", ["registration_id", "attendance_session_id"])


def downgrade() -> None:
    op.drop_constraint("uq_attendance_registration_session", "attendance", type_="unique")
    op.create_index("ix_attendance_registration_id", "attendance", ["registration_id"], unique=True)
    op.drop_constraint("attendance_attendance_session_id_fkey", "attendance", type_="foreignkey")
    op.drop_index("ix_attendance_attendance_session_id", table_name="attendance")
    op.drop_column("attendance", "is_late")
    op.drop_column("attendance", "attendance_session_id")
    op.drop_index("uq_attendance_sessions_active_event", table_name="attendance_sessions")
    op.drop_index("ix_attendance_sessions_event_id", table_name="attendance_sessions")
    op.drop_table("attendance_sessions")
    session_status_enum.drop(op.get_bind(), checkfirst=True)
    session_type_enum.drop(op.get_bind(), checkfirst=True)

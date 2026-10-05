"""repair attendance session schema for databases stamped past i9j0k1l2m3n4

Revision ID: l2m3n4o5p6
Revises: k1l2m3n4o5p6
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text
from sqlalchemy.dialects import postgresql


revision = "l2m3n4o5p6"
down_revision = "k1l2m3n4o5p6"
branch_labels = None
depends_on = None


session_type_enum = postgresql.ENUM(
    "TIME_IN",
    "TIME_OUT",
    "CUSTOM",
    name="attendancesessiontype",
    create_type=False,
)
session_status_enum = postgresql.ENUM(
    "SCHEDULED",
    "OPEN",
    "CLOSED",
    "CANCELLED",
    name="attendancesessionstatus",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    table_names = inspector.get_table_names()

    session_type_enum.create(bind, checkfirst=True)
    session_status_enum.create(bind, checkfirst=True)

    if "attendance_sessions" not in table_names:
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
        op.create_index(
            "ix_attendance_sessions_event_id",
            "attendance_sessions",
            ["event_id"],
            unique=False,
        )
        op.create_index(
            "uq_attendance_sessions_active_event",
            "attendance_sessions",
            ["event_id"],
            unique=True,
            postgresql_where=text("is_active = true"),
        )

    attendance_columns = {
        column["name"] for column in inspect(bind).get_columns("attendance")
    }

    if "attendance_session_id" not in attendance_columns:
        op.add_column(
            "attendance",
            sa.Column("attendance_session_id", sa.Uuid(), nullable=True),
        )

    if "is_late" not in attendance_columns:
        op.add_column(
            "attendance",
            sa.Column(
                "is_late",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )

    index_names = {
        index["name"] for index in inspect(bind).get_indexes("attendance")
    }
    if "ix_attendance_attendance_session_id" not in index_names:
        op.create_index(
            "ix_attendance_attendance_session_id",
            "attendance",
            ["attendance_session_id"],
            unique=False,
        )

    foreign_keys = {
        fk["name"]
        for fk in inspect(bind).get_foreign_keys("attendance")
        if fk["name"]
    }
    if "attendance_attendance_session_id_fkey" not in foreign_keys:
        op.create_foreign_key(
            "attendance_attendance_session_id_fkey",
            "attendance",
            "attendance_sessions",
            ["attendance_session_id"],
            ["id"],
            ondelete="CASCADE",
        )

    bind.execute(text("""
        INSERT INTO attendance_sessions (
            id,
            event_id,
            session_date,
            name,
            session_type,
            start_time,
            end_time,
            status,
            display_order,
            is_active,
            created_at,
            updated_at
        )
        SELECT
            md5('attendance-session:' || e.id::text)::uuid,
            e.id,
            e.event_date,
            'Default Attendance',
            'TIME_IN',
            e.start_time,
            e.end_time,
            CASE
                WHEN e.status::text = 'open' THEN 'OPEN'
                WHEN e.status::text = 'closed' THEN 'CLOSED'
                ELSE 'SCHEDULED'
            END::attendancesessionstatus,
            0,
            (e.status::text = 'open'),
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM events e
        WHERE NOT EXISTS (
            SELECT 1
            FROM attendance_sessions s
            WHERE s.event_id = e.id
        )
    """))

    bind.execute(text("""
        UPDATE attendance a
        SET attendance_session_id = s.id
        FROM event_registrations er
        JOIN attendance_sessions s
          ON s.event_id = er.event_id
         AND s.display_order = 0
        WHERE a.registration_id = er.id
          AND a.attendance_session_id IS NULL
    """))

    remaining = bind.execute(
        text("SELECT count(*) FROM attendance WHERE attendance_session_id IS NULL")
    ).scalar_one()
    if remaining:
        raise RuntimeError(
            f"Cannot repair attendance session references: {remaining} attendance rows remain unassigned."
        )

    op.alter_column("attendance", "attendance_session_id", nullable=False)

    if "ix_attendance_registration_id" in {
        index["name"] for index in inspect(bind).get_indexes("attendance")
    }:
        op.drop_index("ix_attendance_registration_id", table_name="attendance")

    constraints = {
        constraint["name"]
        for constraint in inspect(bind).get_unique_constraints("attendance")
    }
    if "uq_attendance_registration_session" not in constraints:
        op.create_unique_constraint(
            "uq_attendance_registration_session",
            "attendance",
            ["registration_id", "attendance_session_id"],
        )

    if "is_late" in attendance_columns:
        op.alter_column("attendance", "is_late", server_default=None)


def downgrade() -> None:
    raise RuntimeError(
        "This repair migration is intentionally non-reversible because it repairs "
        "a schema that may already contain attendance session data."
    )

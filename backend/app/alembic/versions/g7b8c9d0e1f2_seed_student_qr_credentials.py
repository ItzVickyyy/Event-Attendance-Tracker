"""seed opaque QR credentials for student attendees

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
"""
from alembic import op
from sqlalchemy import text

revision = "g7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("""
        INSERT INTO attendees (id, person_id, attendee_type, created_at, updated_at)
        SELECT md5('student-attendee:' || s.id::text)::uuid, s.person_id, 'student', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM students s
        WHERE NOT EXISTS (SELECT 1 FROM attendees a WHERE a.person_id = s.person_id)
    """))
    conn.execute(text("""
        INSERT INTO attendee_credentials (id, attendee_id, credential_type, credential_value, is_active, created_at, updated_at)
        SELECT md5('student-qr:' || a.id::text)::uuid,
               a.id,
               'qr',
               'qr_' || replace(a.id::text, '-', ''),
               true,
               CURRENT_TIMESTAMP,
               CURRENT_TIMESTAMP
        FROM attendees a
        JOIN students s ON s.person_id = a.person_id
        WHERE NOT EXISTS (
            SELECT 1 FROM attendee_credentials c
            WHERE c.attendee_id = a.id AND CAST(c.credential_type AS TEXT) = 'qr'
        )
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("""
        DELETE FROM attendee_credentials
        WHERE credential_value LIKE 'qr_%'
    """))

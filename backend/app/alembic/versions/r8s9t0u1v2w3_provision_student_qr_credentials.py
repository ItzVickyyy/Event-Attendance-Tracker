"""Provision QR credentials for existing students.

New students are provisioned through the application service. This migration
backfills the same attendee and QR credential records for students that
already exist.
"""

from alembic import op


revision = "r8s9t0u1v2w3"
down_revision = "q7r8s0t1u2v3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO attendees (
            id,
            person_id,
            attendee_type,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            s.person_id,
            'student',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM students s
        WHERE NOT EXISTS (
            SELECT 1
            FROM attendees a
            WHERE a.person_id = s.person_id
        )
        """
    )

    op.execute(
        """
        INSERT INTO attendee_credentials (
            id,
            attendee_id,
            credential_type,
            credential_value,
            is_active,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            a.id,
            'qr',
            'QR-' || UPPER(encode(gen_random_bytes(12), 'hex')),
            true,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM attendees a
        WHERE a.attendee_type = 'student'
          AND NOT EXISTS (
              SELECT 1
              FROM attendee_credentials c
              WHERE c.attendee_id = a.id
                AND CAST(c.credential_type AS TEXT) = 'qr'
          )
        """
    )


def downgrade() -> None:
    # Existing student credentials are operational data and may have been
    # used after deployment, so they are intentionally preserved on downgrade.
    pass

"""Persist eligible section selections for each event."""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f7"
down_revision = "z6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column(
            "eligible_section_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    # Preserve the best available historical selection from existing registered
    # students. New selections are stored explicitly by the registration page.
    op.execute(
        """
        UPDATE events AS e
        SET eligible_section_ids = COALESCE(
            (
                SELECT json_agg(DISTINCT s.section_id::text)
                FROM event_registrations AS er
                JOIN attendees AS a ON a.id = er.attendee_id
                JOIN students AS s ON s.person_id = a.person_id
                WHERE er.event_id = e.id
                  AND er.registration_status = 'registered'
                  AND s.section_id IS NOT NULL
            ),
            '[]'::json
        )
        """
    )


def downgrade() -> None:
    op.drop_column("events", "eligible_section_ids")

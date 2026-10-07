"""Separate technical Developer access from application roles.

Revision ID: t0u1v2w3x4
Revises: s9t0u1v2w3x4
"""

from alembic import op
import sqlalchemy as sa

revision = "t0u1v2w3x4"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "is_developer",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Existing Developer accounts become technical-only by default. Their
    # prior superuser flag would otherwise continue granting admin permissions.
    op.execute(
        sa.text(
            'UPDATE "user" SET is_developer = TRUE, is_superuser = FALSE, can_scan = FALSE '
            "WHERE role = 'developer'"
        )
    )
    op.alter_column("user", "is_developer", server_default=None)


def downgrade() -> None:
    op.drop_column("user", "is_developer")

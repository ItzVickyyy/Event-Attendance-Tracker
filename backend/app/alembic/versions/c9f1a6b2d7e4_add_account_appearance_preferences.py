"""Add account-scoped appearance preferences.

Revision ID: c9f1a6b2d7e4
Revises: k1l2m3n4o5p6
Create Date: 2026-10-14
"""

from alembic import op
import sqlalchemy as sa

revision = "c9f1a6b2d7e4"
down_revision = "k1l2m3n4o5p6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "appearance_preferences",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user", "appearance_preferences")

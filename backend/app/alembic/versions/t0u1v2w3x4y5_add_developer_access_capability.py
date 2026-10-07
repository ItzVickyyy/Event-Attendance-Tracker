"""Add independent developer access capability.

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
"""

from alembic import op
import sqlalchemy as sa

revision = "t0u1v2w3x4y5"
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
    # Preserve technical access for existing Developer-role accounts while
    # removing the accidental superuser privilege previously assigned by UI.
    op.execute(
        'UPDATE "user" SET is_developer = TRUE, is_superuser = FALSE '
        "WHERE role = 'developer'"
    )
    op.alter_column("user", "is_developer", server_default=None)


def downgrade() -> None:
    op.drop_column("user", "is_developer")

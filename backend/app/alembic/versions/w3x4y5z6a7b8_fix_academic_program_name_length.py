"""Align academic program name storage with the model.

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
"""

from alembic import op
import sqlalchemy as sa

revision = "w3x4y5z6a7b8"
down_revision = "v2w3x4y5z6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE academic_programs "
        "ALTER COLUMN program_name TYPE VARCHAR(255), "
        "ALTER COLUMN program_code TYPE VARCHAR(50)"
    )

def downgrade() -> None:
    op.execute(
        "ALTER TABLE academic_programs "
        "ALTER COLUMN program_name TYPE VARCHAR(20), "
        "ALTER COLUMN program_code TYPE VARCHAR(20)"
    )

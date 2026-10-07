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
    op.alter_column(
        "academic_programs",
        "program_name",
        existing_type=sa.String(length=20),
        type_=sa.String(length=255),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "academic_programs",
        "program_name",
        existing_type=sa.String(length=255),
        type_=sa.String(length=20),
        existing_nullable=False,
    )

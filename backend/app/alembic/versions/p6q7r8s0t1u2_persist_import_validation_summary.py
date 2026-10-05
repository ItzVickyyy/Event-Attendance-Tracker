"""persist import validation summary

Revision ID: p6q7r8s0t1u2
Revises: o5p6q7r8s0t1
"""

from alembic import op
import sqlalchemy as sa


revision = "p6q7r8s0t1u2"
down_revision = "o5p6q7r8s0t1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "import_batches",
        sa.Column("validation_summary", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("import_batches", "validation_summary")

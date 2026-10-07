"""add student archived_at

Revision ID: j0k1l2m3n4
Revises: i9j0k1l2m3n4
"""
import sqlalchemy as sa
from alembic import op

revision = "j0k1l2m3n4"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("students")}
    if "archived_at" not in columns:
        op.add_column(
            "students",
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("students", "archived_at")

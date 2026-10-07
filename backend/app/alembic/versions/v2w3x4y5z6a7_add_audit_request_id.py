"""Add request correlation IDs to audit logs.

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
"""

from alembic import op
import sqlalchemy as sa

revision = "v2w3x4y5z6a7"
down_revision = "u1v2w3x4y5z6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "audit_logs",
        sa.Column("request_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_audit_logs_request_id", "audit_logs", ["request_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_request_id", table_name="audit_logs")
    op.drop_column("audit_logs", "request_id")

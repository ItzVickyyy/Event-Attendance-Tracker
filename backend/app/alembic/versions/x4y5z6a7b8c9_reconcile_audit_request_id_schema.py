"""Reconcile audit request ID schema drift.

Some databases may have recorded the original request-ID migration as applied
without retaining the column or index. This migration safely repairs that
specific drift while remaining a no-op on correctly migrated databases.
"""

from alembic import op
import sqlalchemy as sa

revision = "x4y5z6a7b8c9"
down_revision = "w3x4y5z6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {column["name"] for column in inspector.get_columns("audit_logs")}
    if "request_id" not in columns:
        op.add_column(
            "audit_logs",
            sa.Column("request_id", sa.String(length=64), nullable=True),
        )

    inspector = sa.inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("audit_logs")}
    if "ix_audit_logs_request_id" not in indexes:
        op.create_index(
            "ix_audit_logs_request_id",
            "audit_logs",
            ["request_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    indexes = {index["name"] for index in inspector.get_indexes("audit_logs")}
    if "ix_audit_logs_request_id" in indexes:
        op.drop_index("ix_audit_logs_request_id", table_name="audit_logs")

    columns = {column["name"] for column in inspector.get_columns("audit_logs")}
    if "request_id" in columns:
        op.drop_column("audit_logs", "request_id")

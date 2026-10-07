"""Legacy no-op: archived_at is already created by the academic student migration.

Revision ID: j0k1l2m3n4
Revises: i9j0k1l2m3n4
"""

revision = "j0k1l2m3n4"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # e5f6a7b8c9d0_finalize_academic_student_model already adds archived_at.
    # Keep this revision as a no-op so fresh databases can upgrade cleanly.
    pass


def downgrade() -> None:
    # The column belongs to the earlier academic student migration.
    pass

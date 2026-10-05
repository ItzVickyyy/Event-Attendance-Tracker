"""add class representative assignments and password change flag

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4
"""
from alembic import op
import sqlalchemy as sa


revision = "k1l2m3n4o5p6"
down_revision = "j0k1l2m3n4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "class_representative_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), nullable=False),
        sa.Column("section_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["academic_year_id"], ["academic_years.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["section_id"], ["academic_sections.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_class_representative_assignments_user_id", "class_representative_assignments", ["user_id"])
    op.create_index("ix_class_representative_assignments_academic_year_id", "class_representative_assignments", ["academic_year_id"])
    op.create_index("ix_class_representative_assignments_section_id", "class_representative_assignments", ["section_id"])
    op.create_unique_constraint(
        "uq_class_rep_assignment_user_year",
        "class_representative_assignments",
        ["user_id", "academic_year_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_class_rep_assignment_user_year", "class_representative_assignments", type_="unique")
    op.drop_index("ix_class_representative_assignments_section_id", table_name="class_representative_assignments")
    op.drop_index("ix_class_representative_assignments_academic_year_id", table_name="class_representative_assignments")
    op.drop_index("ix_class_representative_assignments_user_id", table_name="class_representative_assignments")
    op.drop_table("class_representative_assignments")
    op.drop_column("user", "must_change_password")

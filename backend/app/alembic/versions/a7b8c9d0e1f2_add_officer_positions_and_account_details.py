"""Add Student Council officer positions and account academic details.

Revision ID: a7b8c9d0e1f2
Revises: z6a7b8c9d0e1
"""

from alembic import op
import sqlalchemy as sa


revision = "a7b8c9d0e1f2"
down_revision = "z6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "officer_positions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_officer_positions_name"),
    )
    op.create_index(
        "ix_officer_positions_name", "officer_positions", ["name"], unique=True
    )
    op.add_column("user", sa.Column("student_number", sa.String(length=50), nullable=True))
    op.add_column("user", sa.Column("organization", sa.String(length=255), nullable=True))
    op.add_column("user", sa.Column("position_id", sa.Uuid(), nullable=True))
    op.add_column("user", sa.Column("academic_year_id", sa.Uuid(), nullable=True))
    op.add_column("user", sa.Column("section_id", sa.Uuid(), nullable=True))
    op.create_unique_constraint(
        "uq_user_student_number", "user", ["student_number"]
    )
    op.create_foreign_key(
        "fk_user_position_id_officer_positions",
        "user",
        "officer_positions",
        ["position_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_user_academic_year_id_academic_years",
        "user",
        "academic_years",
        ["academic_year_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_user_section_id_academic_sections",
        "user",
        "academic_sections",
        ["section_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_user_position_id", "user", ["position_id"], unique=False)
    op.create_index("ix_user_academic_year_id", "user", ["academic_year_id"], unique=False)
    op.create_index("ix_user_section_id", "user", ["section_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_section_id", table_name="user")
    op.drop_index("ix_user_academic_year_id", table_name="user")
    op.drop_index("ix_user_position_id", table_name="user")
    op.drop_constraint("fk_user_section_id_academic_sections", "user", type_="foreignkey")
    op.drop_constraint("fk_user_academic_year_id_academic_years", "user", type_="foreignkey")
    op.drop_constraint("fk_user_position_id_officer_positions", "user", type_="foreignkey")
    op.drop_constraint("uq_user_student_number", "user", type_="unique")
    op.drop_column("user", "section_id")
    op.drop_column("user", "academic_year_id")
    op.drop_column("user", "position_id")
    op.drop_column("user", "organization")
    op.drop_column("user", "student_number")
    op.drop_index("ix_officer_positions_name", table_name="officer_positions")
    op.drop_table("officer_positions")

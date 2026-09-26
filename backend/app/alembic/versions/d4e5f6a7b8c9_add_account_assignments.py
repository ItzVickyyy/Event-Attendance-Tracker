"""add organization and section account assignments

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-26 20:15:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None

assignmentstatus_enum = postgresql.ENUM(
    "active", "inactive", name="assignmentstatus", create_type=False
)


def upgrade() -> None:
    assignmentstatus_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "organization_memberships",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year", sa.String(length=50), nullable=False),
        sa.Column("position", sa.String(length=255), nullable=False),
        sa.Column("status", assignmentstatus_enum, nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "organization_id", "academic_year", "position",
            name="uq_org_membership_user_org_year_position",
        ),
    )
    op.create_index(
        "ix_organization_memberships_user_id", "organization_memberships", ["user_id"]
    )
    op.create_index(
        "ix_organization_memberships_organization_id",
        "organization_memberships",
        ["organization_id"],
    )

    op.create_table(
        "user_section_assignments",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("section_id", sa.Uuid(), nullable=False),
        sa.Column("academic_year", sa.String(length=50), nullable=False),
        sa.Column("status", assignmentstatus_enum, nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["section_id"], ["academic_sections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "section_id", "academic_year",
            name="uq_user_section_assignment_user_section_year",
        ),
    )
    op.create_index(
        "ix_user_section_assignments_user_id", "user_section_assignments", ["user_id"]
    )
    op.create_index(
        "ix_user_section_assignments_section_id", "user_section_assignments", ["section_id"]
    )


def downgrade() -> None:
    op.drop_table("user_section_assignments")
    op.drop_table("organization_memberships")
    assignmentstatus_enum.drop(op.get_bind(), checkfirst=True)

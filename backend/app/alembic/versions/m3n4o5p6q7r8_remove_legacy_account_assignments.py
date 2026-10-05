"""remove legacy account assignment tables

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6
"""

from alembic import op


revision = "m3n4o5p6q7r8"
down_revision = "l2m3n4o5p6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_section_assignments")
    op.execute("DROP TABLE IF EXISTS organization_memberships")
    op.execute("DROP TYPE IF EXISTS assignmentstatus")


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE assignmentstatus AS ENUM ('active', 'inactive');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS organization_memberships (
            user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            academic_year VARCHAR(50) NOT NULL,
            position VARCHAR(255) NOT NULL,
            status assignmentstatus NOT NULL,
            id UUID NOT NULL PRIMARY KEY,
            created_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ,
            CONSTRAINT uq_org_membership_user_org_year_position
                UNIQUE (user_id, organization_id, academic_year, position)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_section_assignments (
            user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            section_id UUID NOT NULL REFERENCES academic_sections(id) ON DELETE CASCADE,
            academic_year VARCHAR(50) NOT NULL,
            status assignmentstatus NOT NULL,
            id UUID NOT NULL PRIMARY KEY,
            created_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ,
            CONSTRAINT uq_user_section_assignment_user_section_year
                UNIQUE (user_id, section_id, academic_year)
        )
        """
    )

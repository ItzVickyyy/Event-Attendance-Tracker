"""Add structured personal name fields to users.

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
"""

from alembic import op
import sqlalchemy as sa

revision = "s9t0u1v2w3x4"
down_revision = "r8s9t0u1v2w3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("first_name", sa.String(length=255), nullable=True))
    op.add_column("user", sa.Column("middle_name", sa.String(length=255), nullable=True))
    op.add_column("user", sa.Column("last_name", sa.String(length=255), nullable=True))
    op.add_column("user", sa.Column("name_extension", sa.String(length=50), nullable=True))

    op.execute(
        """
        UPDATE "user"
        SET first_name = CASE
                WHEN full_name IS NULL OR btrim(full_name) = '' THEN NULL
                ELSE split_part(btrim(full_name), ' ', 1)
            END,
            last_name = CASE
                WHEN full_name IS NULL OR btrim(full_name) = '' THEN NULL
                WHEN array_length(regexp_split_to_array(btrim(full_name), '\\s+'), 1) = 1
                    THEN split_part(btrim(full_name), ' ', 1)
                ELSE (regexp_split_to_array(btrim(full_name), '\\s+'))[
                    array_length(regexp_split_to_array(btrim(full_name), '\\s+'), 1)
                ]
            END
        """
    )


def downgrade() -> None:
    op.drop_column("user", "name_extension")
    op.drop_column("user", "last_name")
    op.drop_column("user", "middle_name")
    op.drop_column("user", "first_name")

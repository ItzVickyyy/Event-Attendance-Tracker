"""Repair legacy Developer-role rows created after the capability migration.

Some local databases still contain role='developer' even though Developer access
is now represented by the independent is_developer capability. Reconcile these
rows before SQLAlchemy attempts to deserialize them using the current UserRole.
"""

from alembic import op
import sqlalchemy as sa

revision = "z6a7b8c9d0e1"
down_revision = "y5z6a7b8c9d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("user"):
        return

    columns = {column["name"] for column in inspector.get_columns("user")}
    if "role" not in columns:
        return

    # Keep technical Developer access while moving the account back into the
    # supported application-role set. Do not grant application superuser access.
    if "is_developer" in columns:
        bind.execute(
            sa.text(
                'UPDATE "user" SET is_developer = TRUE WHERE role = :legacy_role'
            ),
            {"legacy_role": "developer"},
        )

    if "is_superuser" in columns:
        bind.execute(
            sa.text(
                'UPDATE "user" SET is_superuser = FALSE WHERE role = :legacy_role'
            ),
            {"legacy_role": "developer"},
        )

    bind.execute(
        sa.text('UPDATE "user" SET role = :new_role WHERE role = :legacy_role'),
        {"new_role": "student", "legacy_role": "developer"},
    )


def downgrade() -> None:
    # Intentionally irreversible. Reintroducing the removed application role
    # would make these accounts unreadable to the current UserRole enum again.
    pass

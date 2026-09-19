"""remove template items demo table

Revision ID: aedc0175e305
Revises: 3b8e71fa8912
Create Date: 2026-09-19 11:12:54.835082

Removes the Full Stack FastAPI Template's demo `item` table. The table was
introduced by the initial template migration `e2412789c190` and is not part
of the Event Attendance Tracker domain. Removing the model first means
Alembic autogenerate produced an empty revision; this hand-written migration
drops the table. The historical migrations that created/altered `item` are
deliberately left untouched so that existing databases can migrate forward.

Downgrade recreates the legacy `item` table (UUID PK, CASCADE owner FK) as
it existed after migration `1a31ce608336`/`fe56fa70289e`, minus the max-length
constraints, so `alembic downgrade` remains structurally coherent.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "aedc0175e305"
down_revision = "3b8e71fa8912"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table("item")


def downgrade():
    op.create_table(
        "item",
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["user.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

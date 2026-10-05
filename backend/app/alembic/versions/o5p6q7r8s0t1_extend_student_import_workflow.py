"""extend student import staging for canonical CSV/XLSX workflow

Revision ID: o5p6q7r8s0t1
Revises: n4o5p6q7r8s9
"""

from alembic import op
import sqlalchemy as sa


revision = "o5p6q7r8s0t1"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "import_batches",
        sa.Column(
            "default_section_id",
            sa.UUID(),
            sa.ForeignKey("academic_sections.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "student_import_records",
        sa.Column("raw_name_extension", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "student_import_records",
        sa.Column("raw_section", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("student_import_records", "raw_section")
    op.drop_column("student_import_records", "raw_name_extension")
    op.drop_column("import_batches", "default_section_id")

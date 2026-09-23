"""add promotion tracking to student_import_records

Revision ID: da02e2b15aa8
Revises: 8d8a21228242
Create Date: 2026-09-22 01:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'da02e2b15aa8'
down_revision = '8d8a21228242'
branch_labels = None
depends_on = None


def upgrade():
    # Additive, nullable promotion-tracking columns on student_import_records.
    # promoted_student_id references the operational Student created/updated
    # by promotion; promoted_at records when promotion happened. Both are
    # nullable so existing (pre-promotion) rows remain valid without
    # backfilling, and staging rows for invalid/conflicting/unpromoted
    # students simply keep these as NULL.
    op.add_column(
        'student_import_records',
        sa.Column('promoted_student_id', sa.Uuid(), nullable=True),
    )
    op.add_column(
        'student_import_records',
        sa.Column('promoted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        'student_import_records_promoted_student_id_fkey',
        'student_import_records',
        'students',
        ['promoted_student_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint(
        'student_import_records_promoted_student_id_fkey',
        'student_import_records',
        type_='foreignkey',
    )
    op.drop_column('student_import_records', 'promoted_at')
    op.drop_column('student_import_records', 'promoted_student_id')

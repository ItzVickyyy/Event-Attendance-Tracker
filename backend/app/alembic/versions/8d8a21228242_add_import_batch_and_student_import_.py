"""add import_batch and student_import_record tables

Revision ID: 8d8a21228242
Revises: b0e1d2c3f4a5
Create Date: 2026-09-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '8d8a21228242'
down_revision = 'b0e1d2c3f4a5'
branch_labels = None
depends_on = None

# New enum types introduced by this migration (create_type=False so that
# create_table does not attempt to re-create them; creation is handled
# explicitly in upgrade()).
importbatchstatus_enum = postgresql.ENUM(
    'pending', 'validated', 'promoted', 'cancelled',
    name='importbatchstatus', create_type=False,
)
importvalidationstatus_enum = postgresql.ENUM(
    'pending', 'valid', 'invalid', 'conflict_cross_program', 'resolved',
    name='importvalidationstatus', create_type=False,
)

# Existing enum type (created by revision b0e1d2c3f4a5 for students.academic_status).
# Reused here as-is: create_type=False and never created/dropped by this migration.
academicstatus_enum = postgresql.ENUM(
    'regular', 'irregular',
    name='academicstatus', create_type=False,
)


def upgrade():
    # Explicitly create the new enum types in PostgreSQL if they do not exist.
    postgresql.ENUM(
        'pending', 'validated', 'promoted', 'cancelled', name='importbatchstatus'
    ).create(op.get_bind(), checkfirst=True)
    postgresql.ENUM(
        'pending', 'valid', 'invalid', 'conflict_cross_program', 'resolved',
        name='importvalidationstatus',
    ).create(op.get_bind(), checkfirst=True)

    # 1. import_batches
    op.create_table(
        'import_batches',
        sa.Column('source_filename', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('academic_year', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('semester', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('imported_by', sa.Uuid(), nullable=True),
        sa.Column('status', importbatchstatus_enum, nullable=False),
        sa.Column('notes', sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('imported_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['imported_by'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    # 2. student_import_records
    op.create_table(
        'student_import_records',
        sa.Column('import_batch_id', sa.Uuid(), nullable=False),
        sa.Column('source_sheet', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('source_row', sa.Integer(), nullable=False),
        sa.Column('source_no', sa.Integer(), nullable=True),
        sa.Column('raw_student_number', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('raw_last_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('raw_first_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('raw_middle_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('raw_mobile_number', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('raw_email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('raw_subjects_enrolled', sqlmodel.sql.sqltypes.AutoString(length=4000), nullable=True),
        sa.Column('raw_status', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('academic_status', academicstatus_enum, nullable=True),
        sa.Column('validation_status', importvalidationstatus_enum, nullable=False),
        sa.Column('validation_errors', sa.JSON(), nullable=True),
        sa.Column('conflict_key', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['import_batch_id'], ['import_batches.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'import_batch_id', 'source_sheet', 'source_row',
            name='uq_student_import_batch_sheet_row',
        ),
    )
    op.create_index(
        op.f('ix_student_import_records_raw_student_number'),
        'student_import_records', ['raw_student_number'], unique=False,
    )
    op.create_index(
        op.f('ix_student_import_records_conflict_key'),
        'student_import_records', ['conflict_key'], unique=False,
    )


def downgrade():
    op.drop_index(op.f('ix_student_import_records_conflict_key'), table_name='student_import_records')
    op.drop_index(op.f('ix_student_import_records_raw_student_number'), table_name='student_import_records')
    op.drop_table('student_import_records')
    op.drop_table('import_batches')

    # Drop only the enum types created by this migration. `academicstatus`
    # already existed before this migration (created by b0e1d2c3f4a5 for
    # students.academic_status) and remains in use there, so it is
    # intentionally left untouched.
    postgresql.ENUM(name='importvalidationstatus').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='importbatchstatus').drop(op.get_bind(), checkfirst=True)

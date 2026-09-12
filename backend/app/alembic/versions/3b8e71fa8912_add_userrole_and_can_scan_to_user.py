"""add_userrole_and_can_scan_to_user

Revision ID: 3b8e71fa8912
Revises: 1197a9a57c90
Create Date: 2026-09-12 18:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '3b8e71fa8912'
down_revision = '1197a9a57c90'
branch_labels = None
depends_on = None

userrole_enum = postgresql.ENUM(
    'developer',
    'super_admin',
    'admin',
    'class_representative',
    'student',
    name='userrole',
    create_type=False,
)


def upgrade():
    # 1. Create userrole enum type
    postgresql.ENUM(
        'developer',
        'super_admin',
        'admin',
        'class_representative',
        'student',
        name='userrole',
    ).create(op.get_bind(), checkfirst=True)

    # 2. Add role column with default 'student'
    op.add_column(
        'user',
        sa.Column(
            'role',
            userrole_enum,
            server_default='student',
            nullable=False,
        ),
    )

    # 3. Add can_scan column with default False
    op.add_column(
        'user',
        sa.Column(
            'can_scan',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
    )

    # 4. Migrate existing is_superuser=True users to super_admin and can_scan=True
    op.execute(
        "UPDATE \"user\" SET role = 'super_admin', can_scan = true WHERE is_superuser = true"
    )


def downgrade():
    # 1. Drop columns from user table
    op.drop_column('user', 'can_scan')
    op.drop_column('user', 'role')

    # 2. Drop userrole enum
    postgresql.ENUM(name='userrole').drop(op.get_bind(), checkfirst=True)

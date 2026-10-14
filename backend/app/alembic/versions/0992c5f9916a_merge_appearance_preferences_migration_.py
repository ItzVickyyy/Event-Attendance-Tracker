"""merge appearance preferences migration branch

Revision ID: 0992c5f9916a
Revises: b1c2d3e4f5a6, c9f1a6b2d7e4
Create Date: 2026-10-14 13:19:50.888189

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '0992c5f9916a'
down_revision = ('b1c2d3e4f5a6', 'c9f1a6b2d7e4')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass

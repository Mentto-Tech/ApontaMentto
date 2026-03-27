"""add lunch column

Revision ID: add_lunch_column
Revises: 8a2b3c4d5e6f
Create Date: 2026-03-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_lunch_column'
down_revision = '8a2b3c4d5e6f'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('daily_records', sa.Column('lunch', sa.String(), nullable=True))

def downgrade():
    op.drop_column('daily_records', 'lunch')
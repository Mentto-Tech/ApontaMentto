"""merge heads

Revision ID: merge_heads
Revises: add_lunch_column, 8a2b3c4d5e6f
Create Date: 2026-03-27 12:30:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'merge_heads'
down_revision = ('add_lunch_column', '8a2b3c4d5e6f')
branch_labels = None
depends_on = None

def upgrade():
    pass

def downgrade():
    pass
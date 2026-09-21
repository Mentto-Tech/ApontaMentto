"""add user project favorites

Revision ID: p2q3r4s5t6u7
Revises: m9n0o1p2q3r4
Create Date: 2026-09-21 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'p2q3r4s5t6u7'
down_revision = 'm9n0o1p2q3r4'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'user_project_favorites',
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'project_id'),
        sa.UniqueConstraint('user_id', 'project_id', name='uq_user_project_favorite'),
    )

def downgrade():
    op.drop_table('user_project_favorites')

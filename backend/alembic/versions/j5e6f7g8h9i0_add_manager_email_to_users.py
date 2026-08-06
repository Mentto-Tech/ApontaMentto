"""add manager_email to users

Revision ID: j5e6f7g8h9i0
Revises: i4d5e6f7g8h9
Branch Labels: None
Depends On: None
"""
from alembic import op
import sqlalchemy as sa

revision = "j5e6f7g8h9i0"
down_revision = "i4d5e6f7g8h9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("manager_email", sa.String(), nullable=True))


def downgrade():
    op.drop_column("users", "manager_email")

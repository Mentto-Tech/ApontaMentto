"""announcement push schedule fields

Revision ID: f1a2b3c4d5e6
Revises: e2f3a4b5c6d7
Create Date: 2026-07-27
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("announcements", sa.Column("push_repeat_interval_minutes", sa.Integer(), nullable=True))
    op.add_column("announcements", sa.Column("push_repeat_until", sa.DateTime(), nullable=True))
    op.add_column("announcements", sa.Column("push_last_sent_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("announcements", "push_last_sent_at")
    op.drop_column("announcements", "push_repeat_until")
    op.drop_column("announcements", "push_repeat_interval_minutes")

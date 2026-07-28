"""announcement push schedule times

Revision ID: h3c4d5e6f7g8
Revises: g2b3c4d5e6f7
Create Date: 2026-07-28
"""
from alembic import op
import sqlalchemy as sa

revision = "h3c4d5e6f7g8"
down_revision = "g2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # push_schedule_times: JSON array of "HH:MM" strings, e.g. '["07:10","11:40","18:00"]'
    # push_schedule_sent: JSON object mapping "YYYY-MM-DD HH:MM" -> true, tracks what was sent today
    conn.execute(sa.text("""
        ALTER TABLE announcements
        ADD COLUMN IF NOT EXISTS push_schedule_times TEXT,
        ADD COLUMN IF NOT EXISTS push_schedule_sent TEXT
    """))


def downgrade():
    op.drop_column("announcements", "push_schedule_sent")
    op.drop_column("announcements", "push_schedule_times")

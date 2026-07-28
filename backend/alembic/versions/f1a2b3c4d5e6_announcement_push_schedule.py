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
    # Use IF NOT EXISTS to be idempotent in case columns were added manually
    conn = op.get_bind()
    conn.execute(sa.text("""
        ALTER TABLE announcements
        ADD COLUMN IF NOT EXISTS push_repeat_interval_minutes INTEGER,
        ADD COLUMN IF NOT EXISTS push_repeat_until TIMESTAMP,
        ADD COLUMN IF NOT EXISTS push_last_sent_at TIMESTAMP
    """))


def downgrade():
    op.drop_column("announcements", "push_last_sent_at")
    op.drop_column("announcements", "push_repeat_until")
    op.drop_column("announcements", "push_repeat_interval_minutes")

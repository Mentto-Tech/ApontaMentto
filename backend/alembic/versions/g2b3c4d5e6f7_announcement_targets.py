"""announcement targets

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-28
"""
from alembic import op
import sqlalchemy as sa

revision = "g2b3c4d5e6f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # target_all: True = todos os usuários recebem; False = apenas os listados em announcement_targets
    conn.execute(sa.text(
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_all BOOLEAN NOT NULL DEFAULT TRUE"
    ))
    op.create_table(
        "announcement_targets",
        sa.Column("announcement_id", sa.String(), sa.ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False, primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, primary_key=True),
    )


def downgrade():
    op.drop_table("announcement_targets")
    op.drop_column("announcements", "target_all")

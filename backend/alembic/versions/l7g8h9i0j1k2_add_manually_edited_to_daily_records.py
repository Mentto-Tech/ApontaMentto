"""add manually_edited to daily_records

Revision ID: l7g8h9i0j1k2
Revises: k6f7g8h9i0j1
Create Date: 2026-08-18

"""
from alembic import op
import sqlalchemy as sa

revision = "l7g8h9i0j1k2"
down_revision = "k6f7g8h9i0j1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "daily_records",
        sa.Column("manually_edited", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("daily_records", "manually_edited")

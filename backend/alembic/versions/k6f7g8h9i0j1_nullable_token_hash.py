"""make token_hash and expires_at nullable in timesheet_sign_requests

Revision ID: k6f7g8h9i0j1
Revises: j5e6f7g8h9i0
Create Date: 2026-08-18

"""
from alembic import op
import sqlalchemy as sa

revision = "k6f7g8h9i0j1"
down_revision = "j5e6f7g8h9i0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "timesheet_sign_requests",
        "token_hash",
        existing_type=sa.String(),
        nullable=True,
    )
    op.alter_column(
        "timesheet_sign_requests",
        "expires_at",
        existing_type=sa.DateTime(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "timesheet_sign_requests",
        "expires_at",
        existing_type=sa.DateTime(),
        nullable=False,
    )
    op.alter_column(
        "timesheet_sign_requests",
        "token_hash",
        existing_type=sa.String(),
        nullable=False,
    )

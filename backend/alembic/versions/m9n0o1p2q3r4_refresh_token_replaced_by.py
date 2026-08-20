"""add replaced_by_id to refresh_tokens

Revision ID: m9n0o1p2q3r4
Revises: l7g8h9i0j1k2
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa

revision = "m9n0o1p2q3r4"
down_revision = "l7g8h9i0j1k2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column("replaced_by_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_refresh_tokens_replaced_by",
        "refresh_tokens",
        "refresh_tokens",
        ["replaced_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_refresh_tokens_replaced_by", "refresh_tokens", type_="foreignkey")
    op.drop_column("refresh_tokens", "replaced_by_id")
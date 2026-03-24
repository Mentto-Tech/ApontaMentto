"""absence justifications

Revision ID: 22e9f4e90eab
Revises: 5cb33d586a8d
Create Date: 2026-03-24 08:32:24.064131

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '22e9f4e90eab'
down_revision: Union[str, None] = '5cb33d586a8d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "absence_justifications",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("reason_text", sa.Text(), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("original_filename", sa.String(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("date", "user_id", name="uq_absence_justification_date_user"),
    )

    op.create_index(
        "ix_absence_justifications_date",
        "absence_justifications",
        ["date"],
    )
    op.create_index(
        "ix_absence_justifications_user_id",
        "absence_justifications",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_absence_justifications_user_id", table_name="absence_justifications")
    op.drop_index("ix_absence_justifications_date", table_name="absence_justifications")
    op.drop_table("absence_justifications")

"""time bank entries

Revision ID: 8a2b3c4d5e6f
Revises: 7f3c2a1b9d10
Create Date: 2026-03-26 10:25:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8a2b3c4d5e6f"
down_revision: Union[str, None] = "7f3c2a1b9d10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "time_bank_entries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("daily_record_id", sa.String(), nullable=True),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("amount_minutes", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("entry_type", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["daily_record_id"], ["daily_records.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_time_bank_entries_user_id", "time_bank_entries", ["user_id"])
    op.create_index("ix_time_bank_entries_daily_record_id", "time_bank_entries", ["daily_record_id"])
    op.create_index("ix_time_bank_entries_date", "time_bank_entries", ["date"])


def downgrade() -> None:
    op.drop_index("ix_time_bank_entries_date", table_name="time_bank_entries")
    op.drop_index("ix_time_bank_entries_daily_record_id", table_name="time_bank_entries")
    op.drop_index("ix_time_bank_entries_user_id", table_name="time_bank_entries")
    op.drop_table("time_bank_entries")

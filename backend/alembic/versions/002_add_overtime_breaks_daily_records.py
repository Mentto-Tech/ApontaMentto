"""add overtime, breaks, daily records

Revision ID: 002
Revises: 001
Create Date: 2026-03-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- User: add overtime_hourly_rate ---
    op.add_column(
        "users",
        sa.Column("overtime_hourly_rate", sa.Float(), nullable=True),
    )

    # --- TimeEntry: add entry_type and is_overtime ---
    op.add_column(
        "time_entries",
        sa.Column("entry_type", sa.String(), nullable=False, server_default="work"),
    )
    op.add_column(
        "time_entries",
        sa.Column("is_overtime", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # --- New table: daily_records ---
    op.create_table(
        "daily_records",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("clock_in", sa.String(), nullable=True),
        sa.Column("clock_out", sa.String(), nullable=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("date", "user_id", name="uq_daily_record_date_user"),
    )
    op.create_index("ix_daily_records_date", "daily_records", ["date"])
    op.create_index("ix_daily_records_user_id", "daily_records", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_daily_records_user_id", "daily_records")
    op.drop_index("ix_daily_records_date", "daily_records")
    op.drop_table("daily_records")
    op.drop_column("time_entries", "is_overtime")
    op.drop_column("time_entries", "entry_type")
    op.drop_column("users", "overtime_hourly_rate")

"""punch logs

Revision ID: 6c1a2d3f8b1c
Revises: 22e9f4e90eab
Create Date: 2026-03-24 09:38:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6c1a2d3f8b1c"
down_revision: Union[str, None] = "22e9f4e90eab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "punch_logs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("daily_record_id", sa.String(), nullable=True),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("field", sa.String(), nullable=False),
        sa.Column("time_value", sa.String(), nullable=True),
        sa.Column("overtime_minutes", sa.Integer(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("geo_lat", sa.Float(), nullable=True),
        sa.Column("geo_lng", sa.Float(), nullable=True),
        sa.Column("geo_accuracy", sa.Float(), nullable=True),
        sa.Column("geo_source", sa.String(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["daily_record_id"], ["daily_records.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_punch_logs_user_id", "punch_logs", ["user_id"])
    op.create_index("ix_punch_logs_daily_record_id", "punch_logs", ["daily_record_id"])
    op.create_index("ix_punch_logs_date", "punch_logs", ["date"])
    op.create_index("ix_punch_logs_recorded_at", "punch_logs", ["recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_punch_logs_recorded_at", table_name="punch_logs")
    op.drop_index("ix_punch_logs_date", table_name="punch_logs")
    op.drop_index("ix_punch_logs_daily_record_id", table_name="punch_logs")
    op.drop_index("ix_punch_logs_user_id", table_name="punch_logs")
    op.drop_table("punch_logs")

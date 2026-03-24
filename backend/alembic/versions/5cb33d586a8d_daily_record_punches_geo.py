"""daily record punches geo

Revision ID: 5cb33d586a8d
Revises: 001
Create Date: 2026-03-24 08:27:31.492154

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5cb33d586a8d'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("daily_records", sa.Column("in1", sa.String(), nullable=True))
    op.add_column("daily_records", sa.Column("out1", sa.String(), nullable=True))
    op.add_column("daily_records", sa.Column("in2", sa.String(), nullable=True))
    op.add_column("daily_records", sa.Column("out2", sa.String(), nullable=True))
    op.add_column("daily_records", sa.Column("overtime_minutes", sa.Integer(), nullable=True))

    op.add_column("daily_records", sa.Column("geo_lat", sa.Float(), nullable=True))
    op.add_column("daily_records", sa.Column("geo_lng", sa.Float(), nullable=True))
    op.add_column("daily_records", sa.Column("geo_accuracy", sa.Float(), nullable=True))
    op.add_column("daily_records", sa.Column("geo_source", sa.String(), nullable=True))
    op.add_column("daily_records", sa.Column("ip_address", sa.String(), nullable=True))
    op.add_column("daily_records", sa.Column("user_agent", sa.Text(), nullable=True))
    op.add_column("daily_records", sa.Column("updated_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("daily_records", "updated_at")
    op.drop_column("daily_records", "user_agent")
    op.drop_column("daily_records", "ip_address")
    op.drop_column("daily_records", "geo_source")
    op.drop_column("daily_records", "geo_accuracy")
    op.drop_column("daily_records", "geo_lng")
    op.drop_column("daily_records", "geo_lat")

    op.drop_column("daily_records", "overtime_minutes")
    op.drop_column("daily_records", "out2")
    op.drop_column("daily_records", "in2")
    op.drop_column("daily_records", "out1")
    op.drop_column("daily_records", "in1")

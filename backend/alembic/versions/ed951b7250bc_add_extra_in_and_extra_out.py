"""add extra_in and extra_out

Revision ID: ed951b7250bc
Revises: c3d4e5f6a7b8
Create Date: 2026-05-22 08:34:17.180919

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ed951b7250bc'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('daily_records', sa.Column('extra_in', sa.String(), nullable=True))
    op.add_column('daily_records', sa.Column('extra_out', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('daily_records', 'extra_in')
    op.drop_column('daily_records', 'extra_out')

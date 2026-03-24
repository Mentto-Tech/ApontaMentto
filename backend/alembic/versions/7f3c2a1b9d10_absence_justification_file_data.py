"""absence justification file_data

Revision ID: 7f3c2a1b9d10
Revises: 6c1a2d3f8b1c
Create Date: 2026-03-24 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7f3c2a1b9d10"
down_revision: Union[str, None] = "6c1a2d3f8b1c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("absence_justifications", sa.Column("file_data", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column("absence_justifications", "file_data")

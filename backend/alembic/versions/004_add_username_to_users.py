"""add username to users (safe)

Revision ID: 004
Revises: 003
Create Date: 2026-03-13 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(conn)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def _index_exists(conn, table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(conn)
    return any(idx["name"] == index_name for idx in inspector.get_indexes(table_name))


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, "users", "username"):
        op.add_column("users", sa.Column("username", sa.String(), nullable=True))
        # Use email as default username for existing rows (email is already unique)
        op.execute("UPDATE users SET username = email WHERE username IS NULL")
        op.alter_column("users", "username", nullable=False)

    # Create a unique index if it doesn't exist yet
    if not _index_exists(conn, "users", "ix_users_username"):
        op.create_index("ix_users_username", "users", ["username"], unique=True)


def downgrade() -> None:
    conn = op.get_bind()

    if _index_exists(conn, "users", "ix_users_username"):
        op.drop_index("ix_users_username", table_name="users")

    if _column_exists(conn, "users", "username"):
        op.drop_column("users", "username")

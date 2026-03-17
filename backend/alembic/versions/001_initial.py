"""initial - complete schema

Revision ID: 001
Revises: 
Create Date: 2026-03-17 00:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    
    result_role = conn.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'userrole'"))
    if not result_role.fetchone():
        op.execute("CREATE TYPE userrole AS ENUM ('admin', 'user')")
    
    result_cat = conn.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'usercategory'"))
    if not result_cat.fetchone():
        op.execute("CREATE TYPE usercategory AS ENUM ('pj', 'clt', 'estagiario', 'dono')")

    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column(
            "role",
            postgresql.ENUM("admin", "user", name="userrole", create_type=False),
            nullable=False,
            server_default="user",
        ),
        sa.Column("hourly_rate", sa.Float(), nullable=True),
        sa.Column("overtime_hourly_rate", sa.Float(), nullable=True),
        sa.Column(
            "category",
            postgresql.ENUM("pj", "clt", "estagiario", "dono", name="usercategory", create_type=False),
            nullable=False,
            server_default="clt",
        ),
        sa.Column("weekly_hours", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    op.create_table(
        "projects",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(), nullable=True),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "locations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "time_entries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("start_time", sa.String(), nullable=False),
        sa.Column("end_time", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("entry_type", sa.String(), nullable=False, server_default="work"),
        sa.Column("is_overtime", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("project_id", sa.String(), nullable=True),
        sa.Column("location_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_time_entries_date", "time_entries", ["date"])
    op.create_index("ix_time_entries_user_id", "time_entries", ["user_id"])

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
    op.drop_table("daily_records")
    op.drop_table("time_entries")
    op.drop_table("locations")
    op.drop_table("projects")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS usercategory")
    op.execute("DROP TYPE IF EXISTS userrole")
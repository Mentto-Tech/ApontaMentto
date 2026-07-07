"""add audit_logs table

Revision ID: a1b2c3d4e5f6
Revises: ed951b7250bc
Create Date: 2026-07-06
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "ed951b7250bc"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("user_role", sa.String(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column(
            "timesheet_id",
            sa.String(),
            sa.ForeignKey("timesheet_sign_requests.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("month", sa.String(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_timesheet_id", "audit_logs", ["timesheet_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade():
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_timesheet_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")

"""timesheet signing flow - full schema

Revision ID: 9f1a2b3c4d5e
Revises: add_timesheet_sign_models
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = "9f1a2b3c4d5e"
down_revision = "add_timesheet_sign_models"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Drop old tables and recreate with full schema
    conn.execute(sa.text("DROP TABLE IF EXISTS timesheet_signed_pdfs"))
    conn.execute(sa.text("DROP TABLE IF EXISTS timesheet_sign_requests"))

    op.create_table(
        "timesheet_sign_requests",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("month", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("manager_signature", sa.Text(), nullable=True),
        sa.Column("manager_signed_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_admin_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("employee_signature", sa.Text(), nullable=True),
        sa.Column("employee_signed_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "timesheet_signed_pdfs",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("month", sa.String(), nullable=False),
        sa.Column("pdf_data", sa.LargeBinary(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False, server_default="application/pdf"),
        sa.Column("signed_at", sa.DateTime(), nullable=False),
        sa.Column("sign_request_id", sa.String(), sa.ForeignKey("timesheet_sign_requests.id"), nullable=True),
    )


def downgrade():
    op.drop_table("timesheet_signed_pdfs")
    op.drop_table("timesheet_sign_requests")

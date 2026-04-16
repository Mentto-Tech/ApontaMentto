"""timesheet signed pdf use s3 key

Revision ID: c3d4e5f6a7b8
Revises: 9f1a2b3c4d5e
Create Date: 2026-04-16
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c3d4e5f6a7b8"
down_revision = "9f1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("timesheet_signed_pdfs", sa.Column("s3_key", sa.String(), nullable=True))
    op.create_index("ix_timesheet_signed_pdfs_s3_key", "timesheet_signed_pdfs", ["s3_key"], unique=False)
    op.alter_column("timesheet_signed_pdfs", "pdf_data", existing_type=sa.LargeBinary(), nullable=True)


def downgrade():
    op.alter_column("timesheet_signed_pdfs", "pdf_data", existing_type=sa.LargeBinary(), nullable=False)
    op.drop_index("ix_timesheet_signed_pdfs_s3_key", table_name="timesheet_signed_pdfs")
    op.drop_column("timesheet_signed_pdfs", "s3_key")

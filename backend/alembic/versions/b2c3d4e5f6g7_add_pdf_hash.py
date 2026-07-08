"""add pdf_hash

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-08 09:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6g7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('timesheet_signed_pdfs', sa.Column('pdf_hash', sa.String(), nullable=True))


def downgrade():
    op.drop_column('timesheet_signed_pdfs', 'pdf_hash')

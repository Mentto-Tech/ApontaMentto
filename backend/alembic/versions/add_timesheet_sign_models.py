"""
Add TimesheetSignRequest and TimesheetSignedPdf tables
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime, timedelta
import uuid

# revision identifiers, used by Alembic.
revision = 'add_timesheet_sign_models'
down_revision = 'merge_heads'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'timesheet_sign_requests',
        sa.Column('id', sa.String(), nullable=False, primary_key=True),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('token_hash', sa.String(), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False, default=lambda: datetime.utcnow() + timedelta(days=3)),
        sa.Column('signed_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_admin_id', sa.String(), nullable=False),
    )

    op.create_table(
        'timesheet_signed_pdfs',
        sa.Column('id', sa.String(), nullable=False, primary_key=True),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('month', sa.String(), nullable=False),
        sa.Column('pdf_data', sa.LargeBinary(), nullable=False),
        sa.Column('mime_type', sa.String(), nullable=False, default="application/pdf"),
        sa.Column('signed_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
    )

def downgrade():
    op.drop_table('timesheet_signed_pdfs')
    op.drop_table('timesheet_sign_requests')
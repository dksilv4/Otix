"""add_production_flag_to_involved_companies

Revision ID: 8e9f0d4c3b2a
Revises: 7d9e8f3c2a1b
Create Date: 2026-05-26 15:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = '8e9f0d4c3b2a'
down_revision: str | None = '7d9e8f3c2a1b'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('involved_companies', sa.Column('production', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('involved_companies', 'production')

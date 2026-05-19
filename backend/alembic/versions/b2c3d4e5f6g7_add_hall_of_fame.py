"""add hall_of_fame_media_ids to users

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-18 22:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6g7'
down_revision: str | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('hall_of_fame_media_ids', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    op.drop_column('users', 'hall_of_fame_media_ids')

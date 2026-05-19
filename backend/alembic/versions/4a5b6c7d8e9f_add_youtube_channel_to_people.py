"""add_youtube_channel_to_people

Revision ID: 4a5b6c7d8e9f
Revises: 29387d9fbb46
Create Date: 2026-05-18 18:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '4a5b6c7d8e9f'
down_revision: str | None = '29387d9fbb46'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('people', sa.Column('youtube_channel_id', sa.String(80), nullable=True))
    op.add_column('people', sa.Column('youtube_channel_title', sa.String(500), nullable=True))
    op.create_unique_constraint(None, 'people', ['youtube_channel_id'])


def downgrade() -> None:
    op.drop_constraint(None, 'people', type_='unique')
    op.drop_column('people', 'youtube_channel_title')
    op.drop_column('people', 'youtube_channel_id')

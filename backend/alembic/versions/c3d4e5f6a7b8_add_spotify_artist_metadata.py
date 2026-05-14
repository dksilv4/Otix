"""add_spotify_artist_metadata

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-14 13:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c3d4e5f6a7b8'
down_revision: str | None = 'b2c3d4e5f6a7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('people', sa.Column('spotify_follower_count', sa.Integer(), nullable=True))
    op.add_column('people', sa.Column('spotify_popularity', sa.Integer(), nullable=True))
    op.add_column('people', sa.Column('spotify_genres', postgresql.JSONB(), nullable=True))
    op.add_column('people', sa.Column('spotify_image_url', sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column('people', 'spotify_image_url')
    op.drop_column('people', 'spotify_genres')
    op.drop_column('people', 'spotify_popularity')
    op.drop_column('people', 'spotify_follower_count')

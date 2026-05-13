"""add_spotify_user_fields

Revision ID: a1b2c3d4e5f6
Revises: d9137367d533
Create Date: 2026-05-13 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: str | None = 'd9137367d533'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('spotify_id', sa.String(length=64), unique=True, nullable=True))
    op.add_column('users', sa.Column('spotify_username', sa.String(length=150), nullable=True))
    op.add_column('users', sa.Column('spotify_email', sa.String(length=320), nullable=True))
    op.add_column('users', sa.Column('spotify_avatar_url', sa.String(length=2048), nullable=True))
    op.add_column('users', sa.Column('spotify_access_token', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('spotify_refresh_token', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('spotify_token_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_users_spotify_id', 'users', ['spotify_id'])


def downgrade() -> None:
    op.drop_index('ix_users_spotify_id', 'users')
    op.drop_column('users', 'spotify_token_expires_at')
    op.drop_column('users', 'spotify_refresh_token')
    op.drop_column('users', 'spotify_access_token')
    op.drop_column('users', 'spotify_avatar_url')
    op.drop_column('users', 'spotify_email')
    op.drop_column('users', 'spotify_username')
    op.drop_column('users', 'spotify_id')

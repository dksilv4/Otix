"""add_user_spotify_playlists

Revision ID: b2c3d4e5f6a7
Revises: 048
Create Date: 2026-05-14 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: str | None = '048'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'user_spotify_playlists',
        sa.Column('id', sa.String(length=22), nullable=False),
        sa.Column('user_id', sa.String(length=22), nullable=False),
        sa.Column('spotify_id', sa.String(length=128), nullable=False),
        sa.Column('name', sa.String(length=500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(length=2000), nullable=True),
        sa.Column('track_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('spotify_url', sa.String(length=2000), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'spotify_id', name='uq_user_spotify_playlist'),
    )
    op.create_index('ix_user_spotify_playlists_user_id', 'user_spotify_playlists', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_user_spotify_playlists_user_id', 'user_spotify_playlists')
    op.drop_table('user_spotify_playlists')

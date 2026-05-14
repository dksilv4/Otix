"""add_user_spotify_playlist_tracks

Revision ID: 5c9593dfa212
Revises: g5h6i7j8k9l0
Create Date: 2026-05-14 13:04:57.463549
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '5c9593dfa212'
down_revision: str | None = 'g5h6i7j8k9l0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('user_spotify_playlist_tracks',
    sa.Column('id', sa.String(length=16), nullable=False),
    sa.Column('playlist_id', sa.String(length=16), nullable=False),
    sa.Column('spotify_track_id', sa.String(length=128), nullable=False),
    sa.Column('name', sa.String(length=500), nullable=False),
    sa.Column('artist_name', sa.String(length=500), nullable=False),
    sa.Column('album_name', sa.String(length=500), nullable=True),
    sa.Column('album_image_url', sa.String(length=2000), nullable=True),
    sa.Column('duration_ms', sa.Integer(), nullable=True),
    sa.Column('uri', sa.String(length=200), nullable=True),
    sa.Column('preview_url', sa.String(length=2000), nullable=True),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('added_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['playlist_id'], ['user_spotify_playlists.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('playlist_id', 'spotify_track_id', name='uq_playlist_track')
    )


def downgrade() -> None:
    op.drop_table('user_spotify_playlist_tracks')

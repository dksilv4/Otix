"""add spotify_playlist_subscriptions table

Revision ID: k1l2m3n4o5p6
Revises: j1k2l3m4n5o6
Create Date: 2026-06-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "k1l2m3n4o5p6"
down_revision: str | None = "j1k2l3m4n5o6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "spotify_playlist_subscriptions",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("playlist_id", sa.String(255), nullable=False),
        sa.Column("playlist_name", sa.String(512), nullable=True),
        sa.Column("playlist_owner", sa.String(255), nullable=True),
        sa.Column("playlist_snapshot", sa.String(255), nullable=True),
        sa.Column("auto_sync", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "playlist_id", name="uq_spotify_playlist_subscription"),
    )


def downgrade() -> None:
    op.drop_table("spotify_playlist_subscriptions")

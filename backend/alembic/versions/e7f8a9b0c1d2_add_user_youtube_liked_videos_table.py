"""add user_youtube_liked_videos table

Revision ID: e7f8a9b0c1d2
Revises: p1q2r3s4t5u6
Create Date: 2026-06-22 08:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | None | tuple[str, ...] = "p1q2r3s4t5u6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "user_youtube_liked_videos" not in inspector.get_table_names():
        op.create_table(
            "user_youtube_liked_videos",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(length=16), nullable=False),
            sa.Column("video_id", sa.String(length=50), nullable=False),
            sa.Column("title", sa.Text(), nullable=False, server_default=""),
            sa.Column("channel_id", sa.String(length=50), nullable=False, server_default=""),
            sa.Column("channel_title", sa.Text(), nullable=False, server_default=""),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("thumbnail_url", sa.Text(), nullable=True),
            sa.Column("published_at", sa.String(length=50), nullable=False, server_default=""),
            sa.Column("matched_media_item_id", sa.String(length=16), nullable=True),
            sa.Column("matched_title", sa.Text(), nullable=True),
            sa.Column("matched_artist", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["user_id"], ["users.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["matched_media_item_id"], ["media_items.id"], ondelete="SET NULL"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "video_id", name="uq_user_youtube_video"),
        )
        op.create_index(
            "ix_user_youtube_liked_videos_user_id",
            "user_youtube_liked_videos",
            ["user_id"],
        )


def downgrade() -> None:
    op.drop_table("user_youtube_liked_videos")

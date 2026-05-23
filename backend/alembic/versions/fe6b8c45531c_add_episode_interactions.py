"""add_episode_interactions

Revision ID: fe6b8c45531c
Revises: a1c2d3e4f5g6
Create Date: 2026-05-23 16:08:54.122717
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'fe6b8c45531c'
down_revision: str | None = 'a1c2d3e4f5g6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_episode_interactions",
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("episode_id", sa.String(16), sa.ForeignKey("episodes.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_episode_interactions_user_id", "user_episode_interactions", ["user_id"])
    op.create_index("ix_user_episode_interactions_episode_id", "user_episode_interactions", ["episode_id"])

    op.add_column(
        "users",
        sa.Column("plex_watch_history_enabled", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_index("ix_user_episode_interactions_episode_id", table_name="user_episode_interactions")
    op.drop_index("ix_user_episode_interactions_user_id", table_name="user_episode_interactions")
    op.drop_table("user_episode_interactions")
    op.drop_column("users", "plex_watch_history_enabled")

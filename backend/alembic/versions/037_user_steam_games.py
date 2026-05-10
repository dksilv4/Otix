"""Add user_steam_games table for Steam library tracking.

Revision ID: 037
Revises: 036
Create Date: 2026-05-09
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "037"
down_revision: str | None = "036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_steam_games",
        sa.Column("id", sa.String(26), nullable=False),
        sa.Column("user_id", sa.String(26), nullable=False),
        sa.Column("media_item_id", sa.String(26), nullable=True),
        sa.Column("steam_app_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("playtime_forever", sa.Integer(), server_default="0", nullable=False),
        sa.Column("playtime_2weeks", sa.Integer(), server_default="0", nullable=False),
        sa.Column("img_icon_url", sa.String(256), nullable=True),
        sa.Column("img_logo_url", sa.String(256), nullable=True),
        sa.Column("rtime_last_played", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["media_item_id"], ["media_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "steam_app_id", name="uq_user_steam_game"),
    )
    op.create_index(
        "ix_user_steam_games_user_playtime",
        "user_steam_games",
        ["user_id", sa.text("playtime_forever DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_user_steam_games_user_playtime", table_name="user_steam_games")
    op.drop_table("user_steam_games")

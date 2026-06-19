"""Add Epic Games Store integration tables + user columns.

Revision ID: 39fb85e0d90e
Revises: 01b2c3d4e5f6
Create Date: 2026-06-19 23:31:19.529434

"""

from __future__ import annotations

from typing import ClassVar

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "39fb85e0d90e"
down_revision: str | None = "01b2c3d4e5f6"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ── Epic user fields ──────────────────────────────────────────────
    op.add_column("users", sa.Column("epic_id", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("epic_display_name", sa.String(length=150), nullable=True))
    op.add_column("users", sa.Column("epic_access_token", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("epic_refresh_token", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("epic_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_users_epic_id", "users", ["epic_id"])

    # ── user_epic_games table ─────────────────────────────────────────
    op.create_table(
        "user_epic_games",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.String(length=16), nullable=False),
        sa.Column("epic_app_id", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("developer", sa.String(length=255), nullable=True),
        sa.Column("publisher", sa.String(length=255), nullable=True),
        sa.Column("is_installed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("install_size", sa.BigInteger(), nullable=True),
        sa.Column("platform", sa.String(length=32), nullable=True),
        sa.Column("last_played", sa.DateTime(timezone=True), nullable=True),
        sa.Column("media_item_id", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["media_item_id"], ["media_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "epic_app_id", name="uq_user_epic_games_user_app"),
    )
    op.create_index(
        op.f("ix_user_epic_games_media_item_id"),
        "user_epic_games",
        ["media_item_id"],
        unique=False,
    )

    # ── epic_free_game_claims table ───────────────────────────────────
    op.create_table(
        "epic_free_game_claims",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("promotion_id", sa.String(length=128), nullable=False),
        sa.Column("epic_app_id", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("original_price", sa.String(length=32), nullable=True),
        sa.Column("promotion_url", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("notified_user_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("promotion_id", "epic_app_id", name="uq_epic_free_game_promo_app"),
    )
    op.create_index(
        op.f("ix_epic_free_game_claims_promotion_id"),
        "epic_free_game_claims",
        ["promotion_id"],
        unique=False,
    )


def downgrade() -> None:
    # ── Drop user columns ─────────────────────────────────────────────
    op.drop_constraint("uq_users_epic_id", "users", type_="unique")
    op.drop_column("users", "epic_token_expires_at")
    op.drop_column("users", "epic_refresh_token")
    op.drop_column("users", "epic_access_token")
    op.drop_column("users", "epic_display_name")
    op.drop_column("users", "epic_id")

    # ── Drop tables ───────────────────────────────────────────────────
    op.drop_index(op.f("ix_epic_free_game_claims_promotion_id"), table_name="epic_free_game_claims")
    op.drop_table("epic_free_game_claims")
    op.drop_index(op.f("ix_user_epic_games_media_item_id"), table_name="user_epic_games")
    op.drop_table("user_epic_games")

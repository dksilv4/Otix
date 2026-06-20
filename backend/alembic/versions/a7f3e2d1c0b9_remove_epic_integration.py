"""Remove Epic Games Store integration — tables, columns, and constraints.

Revision ID: a7f3e2d1c0b9
Revises: 01b2c3d4e5f6
Create Date: 2026-06-20 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision: str = 'a7f3e2d1c0b9'
down_revision: str | None = '01b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def table_exists(table: str) -> bool:
    bind = op.get_bind()
    return table in inspect(bind).get_table_names()


def column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    return any(c["name"] == column for c in inspect(bind).get_columns(table))


def upgrade() -> None:
    # ── Drop tables (if they exist) ───────────────────────────────────
    if table_exists("epic_free_game_claims"):
        op.drop_index(
            op.f("ix_epic_free_game_claims_promotion_id"),
            table_name="epic_free_game_claims",
        )
        op.drop_table("epic_free_game_claims")

    if table_exists("user_epic_games"):
        op.drop_index(
            op.f("ix_user_epic_games_media_item_id"),
            table_name="user_epic_games",
        )
        op.drop_table("user_epic_games")

    # ── Drop user columns (if they exist) ─────────────────────────────
    if column_exists("users", "epic_token_expires_at"):
        op.drop_column("users", "epic_token_expires_at")
    if column_exists("users", "epic_refresh_token"):
        op.drop_column("users", "epic_refresh_token")
    if column_exists("users", "epic_access_token"):
        op.drop_column("users", "epic_access_token")
    if column_exists("users", "epic_display_name"):
        op.drop_column("users", "epic_display_name")
    if column_exists("users", "epic_id"):
        # Drop the unique constraint first
        try:
            op.drop_constraint("uq_users_epic_id", "users", type_="unique")
        except Exception:
            pass
        op.drop_column("users", "epic_id")


def downgrade() -> None:
    # No downgrade — Epic integration is permanently removed.
    # If you need to restore it, create a new migration that adds the
    # tables and columns back using the original definitions.
    pass

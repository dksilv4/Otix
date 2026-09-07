"""Add label column to media_assets.

Captures variant semantics for selection (logo: multicolor/white/black, hero:
clean/blurred/material, etc.). Backfills from SteamGridDB ``style`` where the
style name doubles as a label. Idempotent: ADD COLUMN IF NOT EXISTS.

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-01
"""
from __future__ import annotations

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS label VARCHAR(30)")
    op.execute(
        """
        UPDATE media_assets
        SET label = CASE
            -- SteamGridDB logos: official = multicolor, white = white, black = black
            WHEN asset_type = 'logo' AND style IN ('official') THEN 'multicolor'
            WHEN asset_type = 'logo' AND style IN ('white') THEN 'white'
            WHEN asset_type = 'logo' AND style IN ('black') THEN 'black'
            WHEN asset_type = 'logo' AND style IN ('custom') THEN 'custom'
            -- SteamGridDB grids: no_logo = textless, material = material
            WHEN asset_type = 'textless_poster' AND style IN ('no_logo') THEN 'textless'
            WHEN asset_type = 'textless_poster' AND style IN ('material') THEN 'material'
            -- SteamGridDB heroes
            WHEN asset_type = 'backdrop' AND style IN ('material') THEN 'material'
            WHEN asset_type = 'backdrop' AND style IN ('blurred') THEN 'blurred'
            WHEN asset_type = 'backdrop' AND style IN ('alternate') THEN 'alternate'
            ELSE label
        END
        WHERE provider = 'steamgrid' AND style IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE media_assets DROP COLUMN IF EXISTS label")

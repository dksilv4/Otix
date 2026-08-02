"""Composite unique index on media_assets (media_item_id, url, asset_type).

The v2 game hydrator stores every SteamGridDB grid as ``poster`` AND
duplicates textless/material grids as ``textless_poster`` — the same URL now
legitimately appears in two rows for one media item. The global
``media_assets_url_key`` index on ``url`` would silently drop those
duplicates, and it also wrongly blocked the same artwork being reused across
different media items. Scope uniqueness to (media_item_id, url, asset_type)
so each item keeps its own per-type dedupe. Idempotent.

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-02
"""
from __future__ import annotations

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS media_assets_url_key")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_media_assets_item_url_type "
        "ON media_assets (media_item_id, url, asset_type)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_media_assets_item_url_type")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS media_assets_url_key ON media_assets (url)"
    )

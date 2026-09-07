"""Drop asset URL columns from media_items.

Asset selection now happens at query time from the ``media_assets`` pool
(selection service + Redis cache) instead of reading columns off MediaItem.
No data migration needed: the same URLs already exist as media_assets rows
(``promote()`` wrote them to columns AND stored them in media_assets), so the
selection service picks the best on first cache miss. Idempotent.

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-01
"""
from __future__ import annotations

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE media_items DROP COLUMN IF EXISTS poster_url, "
        "DROP COLUMN IF EXISTS textless_poster_url, "
        "DROP COLUMN IF EXISTS backdrop_url, "
        "DROP COLUMN IF EXISTS logo_url, "
        "DROP COLUMN IF EXISTS icon_url"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE media_items ADD COLUMN IF NOT EXISTS poster_url VARCHAR(2000), "
        "ADD COLUMN IF NOT EXISTS textless_poster_url VARCHAR(2000), "
        "ADD COLUMN IF NOT EXISTS backdrop_url VARCHAR(2000), "
        "ADD COLUMN IF NOT EXISTS logo_url VARCHAR(2000), "
        "ADD COLUMN IF NOT EXISTS icon_url VARCHAR(2000)"
    )

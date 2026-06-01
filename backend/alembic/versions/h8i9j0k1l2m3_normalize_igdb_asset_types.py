"""normalize igdb asset types to otix standard names

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-05-31
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'h8i9j0k1l2m3'
down_revision: str | None = 'g7h8i9j0k1l2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE media_assets SET asset_type = 'poster' "
        "WHERE provider = 'igdb' AND asset_type = 'cover'"
    )
    op.execute(
        "UPDATE media_assets SET asset_type = 'backdrop' "
        "WHERE provider = 'igdb' AND asset_type = 'artwork'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE media_assets SET asset_type = 'cover' "
        "WHERE provider = 'igdb' AND asset_type = 'poster'"
    )
    op.execute(
        "UPDATE media_assets SET asset_type = 'artwork' "
        "WHERE provider = 'igdb' AND asset_type = 'backdrop'"
    )

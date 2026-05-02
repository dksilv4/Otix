"""Add unique constraint on media_assets.url to prevent duplicate images.

Revision ID: 002
Revises: 001
Create Date: 2026-05-01
"""

from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint("uq_media_assets_url", "media_assets", ["url"])


def downgrade() -> None:
    op.drop_constraint("uq_media_assets_url", "media_assets", type_="unique")

"""add_is_adult_to_media_items

Revision ID: a7f3c2d1e5b9
Revises: 480c9c19faa5
Create Date: 2026-05-24
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a7f3c2d1e5b9'
down_revision: str | None = '480c9c19faa5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "media_items",
        sa.Column("is_adult", sa.Boolean(), server_default="false", nullable=False),
    )
    # Backfill from existing ExternalID stubs tagged as adult during TMDB seed
    op.execute("""
        UPDATE media_items
        SET is_adult = true
        WHERE id IN (
            SELECT DISTINCT media_item_id
            FROM external_ids
            WHERE provider = 'tmdb'
              AND is_adult = true
              AND media_item_id IS NOT NULL
        )
    """)


def downgrade() -> None:
    op.drop_column("media_items", "is_adult")

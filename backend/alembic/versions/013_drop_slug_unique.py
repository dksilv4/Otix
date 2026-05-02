"""Drop unique constraint on media_items.slug — otix_id is the source of truth.

Revision ID: 013
Revises: 012
Create Date: 2026-05-02
"""

from collections.abc import Sequence

from alembic import op

revision: str = "013"
down_revision: str | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("media_items_slug_key", "media_items", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("media_items_slug_key", "media_items", ["slug"])

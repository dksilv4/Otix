"""Rename steam_-prefixed columns on games to generic names.

Revision ID: 011
Revises: 010
Create Date: 2026-05-02
"""

from typing import Sequence, Union

from alembic import op

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE games RENAME COLUMN steam_price_json TO price_json")
    op.execute("ALTER TABLE games RENAME COLUMN steam_recommendations TO recommendations")
    op.execute("ALTER TABLE games RENAME COLUMN steam_review_summary TO review_summary")


def downgrade() -> None:
    op.execute("ALTER TABLE games RENAME COLUMN price_json TO steam_price_json")
    op.execute("ALTER TABLE games RENAME COLUMN recommendations TO steam_recommendations")
    op.execute("ALTER TABLE games RENAME COLUMN review_summary TO steam_review_summary")

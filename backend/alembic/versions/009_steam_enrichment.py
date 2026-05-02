"""Add Steam enrichment columns to games table.

Revision ID: 009
Revises: 008
Create Date: 2026-05-02
"""

from typing import Sequence, Union

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS steam_developers JSONB")
    op.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS steam_publishers JSONB")
    op.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS steam_price_json JSONB")
    op.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS steam_recommendations INTEGER")
    op.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS steam_review_summary VARCHAR(200)")


def downgrade() -> None:
    op.drop_column("games", "steam_review_summary")
    op.drop_column("games", "steam_recommendations")
    op.drop_column("games", "steam_price_json")
    op.drop_column("games", "steam_publishers")
    op.drop_column("games", "steam_developers")

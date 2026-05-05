"""Add style and score columns to media_assets for SteamGridDB metadata.

Revision ID: 014
Revises: 2684c21b5b1a
Create Date: 2026-05-05
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "014"
down_revision: str | None = "2684c21b5b1a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("media_assets", sa.Column("style", sa.String(length=20), nullable=True))
    op.add_column("media_assets", sa.Column("score", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("media_assets", "score")
    op.drop_column("media_assets", "style")

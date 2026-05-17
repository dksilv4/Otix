"""add spotify_related_crawled_at to people

Revision ID: a1b2c3d4e5f6
Revises: f3b9d6d7f251
Create Date: 2026-05-17 03:53:05.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: str | None = 'f3b9d6d7f251'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('people', sa.Column('spotify_related_crawled_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('people', 'spotify_related_crawled_at')

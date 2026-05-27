"""add_review_cooldown

Revision ID: 7d9e8f3c2a1b
Revises: 6c9a83fc54f3
Create Date: 2026-05-26 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = '7d9e8f3c2a1b'
down_revision: str | None = '6c9a83fc54f3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('reviews', sa.Column('cooldown_until', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('reviews', 'cooldown_until')

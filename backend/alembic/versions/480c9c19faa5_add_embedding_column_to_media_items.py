"""add embedding column to media_items

Revision ID: 480c9c19faa5
Revises: a7b8c9d0e1f2
Create Date: 2026-05-24 01:45:00.000000
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = '480c9c19faa5'
down_revision: str | None = 'a7b8c9d0e1f2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(text("ALTER TABLE media_items ADD COLUMN embedding vector(384)"))


def downgrade() -> None:
    op.execute(text("ALTER TABLE media_items DROP COLUMN embedding"))

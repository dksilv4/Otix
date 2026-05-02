"""Add lang column to media_assets for language/textless differentiation.

Revision ID: 007
Revises: 006
Create Date: 2026-05-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS lang VARCHAR(10)")


def downgrade() -> None:
    op.drop_column("media_assets", "lang")

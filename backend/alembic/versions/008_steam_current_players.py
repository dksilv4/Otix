"""Add current_players column to games for Steam CCU data.

Revision ID: 008
Revises: 007
Create Date: 2026-05-02
"""

from typing import Sequence, Union

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS current_players INTEGER")


def downgrade() -> None:
    op.drop_column("games", "current_players")

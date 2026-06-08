"""Add time_to_beat JSON column to game table

Revision ID: 1a2b3c4d5e6f
Revises: 33cb7d824ffe
Create Date: 2026-06-07 21:50:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "1a2b3c4d5e6f"
down_revision: str | None = "33cb7d824ffe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("game", sa.Column("time_to_beat", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("game", "time_to_beat")

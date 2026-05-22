"""add discover_emphases to users

Revision ID: a1c2d3e4f5g6
Revises: 7841a8068ecf
Create Date: 2026-05-22 10:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c2d3e4f5g6'
down_revision: str | None = '7841a8068ecf'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("discover_emphases", sa.JSON, nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("users", "discover_emphases")

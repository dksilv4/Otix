"""Add two_factor_enabled and two_factor_secret columns to users.

Revision ID: 034
Revises: 033
Create Date: 2026-05-09
"""

import sqlalchemy as sa
from alembic import op

revision: str = "034"
down_revision: str | None = "033"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("two_factor_secret", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "two_factor_secret")
    op.drop_column("users", "two_factor_enabled")

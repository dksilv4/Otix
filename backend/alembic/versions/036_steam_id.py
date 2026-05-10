"""Add steam_id column to users.

Revision ID: 036
Revises: 035
Create Date: 2026-05-09
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "036"
down_revision: str | None = "035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("steam_id", sa.String(17), nullable=True))
    op.create_unique_constraint("uq_users_steam_id", "users", ["steam_id"])


def downgrade() -> None:
    op.drop_constraint("uq_users_steam_id", "users", type_="unique")
    op.drop_column("users", "steam_id")

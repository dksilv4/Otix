"""Add icon_url to media_items

Revision ID: 5d0f9126d3c6
Revises: 2ccc3f48dee3
Create Date: 2026-06-06 19:29:52.687910
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from sqlalchemy import inspect

revision: str = '5d0f9126d3c6'
down_revision: str | None = '2ccc3f48dee3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    return any(c["name"] == column for c in inspect(bind).get_columns(table))


def upgrade() -> None:
    if not column_exists("media_items", "icon_url"):
        op.add_column("media_items", sa.Column("icon_url", sa.String(length=2000), nullable=True))


def downgrade() -> None:
    if column_exists("media_items", "icon_url"):
        op.drop_column("media_items", "icon_url")

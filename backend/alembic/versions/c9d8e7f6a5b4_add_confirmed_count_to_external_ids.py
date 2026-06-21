"""Add confirmed_count, confirmed_by, last_confirmed_at to external_ids.

Revision ID: c9d8e7f6a5b4
Revises: b8g4h5d2e1c0
Create Date: 2026-06-21 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c9d8e7f6a5b4"
down_revision: str | None = "b8g4h5d2e1c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "external_ids",
        sa.Column("confirmed_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "external_ids",
        sa.Column("confirmed_by", sa.ARRAY(sa.String(30)), server_default="{}", nullable=False),
    )
    op.add_column(
        "external_ids",
        sa.Column("last_confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("external_ids", "last_confirmed_at")
    op.drop_column("external_ids", "confirmed_by")
    op.drop_column("external_ids", "confirmed_count")

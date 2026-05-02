"""Add synced_at and next_sync_at to people table for person sync.

Revision ID: 005
Revises: 004
Create Date: 2026-05-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "people",
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "people",
        sa.Column("next_sync_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "people",
        sa.Column("content_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "people",
        sa.Column("hash_match_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("people", "hash_match_count")
    op.drop_column("people", "content_hash")
    op.drop_column("people", "next_sync_at")
    op.drop_column("people", "synced_at")

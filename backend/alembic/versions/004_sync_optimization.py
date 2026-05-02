"""Add content_hash, hash_match_count, next_sync_at for sync optimization.

Revision ID: 004
Revises: 003
Create Date: 2026-05-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "external_ids",
        sa.Column("content_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "external_ids",
        sa.Column("hash_match_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "media_items",
        sa.Column("next_sync_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "collections",
        sa.Column("content_hash", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("collections", "content_hash")
    op.drop_column("media_items", "next_sync_at")
    op.drop_column("external_ids", "hash_match_count")
    op.drop_column("external_ids", "content_hash")

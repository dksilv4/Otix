"""Add missing user columns (is_private, is_bot) that were back-ported into the initial migration.

Revision ID: n1o2p3q4r5s6
Revises: m1n2o3p4q5r6
Create Date: 2026-06-03
"""
from __future__ import annotations

from alembic import op

revision: str = "n1o2p3q4r5s6"
down_revision: str | None = "m1n2o3p4q5r6"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    pass

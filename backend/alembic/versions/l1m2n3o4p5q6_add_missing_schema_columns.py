"""Add columns that were added to the initial migration after it was applied to production.

This migration catches up the production database by adding columns that were
back-ported into the initial migration after it had already been applied.

Revision ID: l1m2n3o4p5q6
Revises: k1l2m3n4o5p6
Create Date: 2026-06-03

"""
from __future__ import annotations

from typing import ClassVar

import sqlalchemy as sa
from alembic import op

revision: str = "l1m2n3o4p5q6"
down_revision: str | None = "k1l2m3n4o5p6"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ── media_items.view_count ──
    op.execute(
        "ALTER TABLE media_items ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0"
    )

    # ── external_ids.entity_id + index ──
    op.execute(
        "ALTER TABLE external_ids ADD COLUMN IF NOT EXISTS entity_id VARCHAR(16)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_external_id_entity ON external_ids (entity_type, entity_id)"
    )

    # ── users.country ──
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100)"
    )

    # ── involved_companies.production ──
    op.execute(
        "ALTER TABLE involved_companies ADD COLUMN IF NOT EXISTS production BOOLEAN NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    pass

"""Bridge migration — links the production DB's stamped revision to our consolidated chain.

The production database has alembic_version = '6c9a83fc54f3' (a revision from an
earlier version of the migration chain that was later replaced). This bridge
acts as a no-op pass-through so Alembic can reach the consolidated migration.

Revision ID: 6c9a83fc54f3
Revises: d847197dadc8
Create Date: 2026-06-03
"""
from __future__ import annotations

from typing import ClassVar

from alembic import op

revision: str = "6c9a83fc54f3"
down_revision: str | None = "d847197dadc8"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # No-op bridge — all schema work is in the consolidated migration
    # (m1n2o3p4q5r6) which follows this one.
    pass


def downgrade() -> None:
    pass

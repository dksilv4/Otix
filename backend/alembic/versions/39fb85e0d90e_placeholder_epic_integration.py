"""Placeholder for deleted epic_integration migration.

Revision ID: 39fb85e0d90e
Revises: a7f3e2d1c0b9
Create Date: 2026-06-20 16:30:00.000000

This migration file was deleted from the codebase but the DB still
references it. This empty placeholder bridges the gap so alembic
can continue executing pending migrations.
"""

from collections.abc import Sequence

revision: str = '39fb85e0d90e'
down_revision: str | None = 'a7f3e2d1c0b9'  # remove_epic_integration (idempotent, safe to run)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

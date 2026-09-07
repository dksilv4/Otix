"""Add avg_rating to people.

The Person ORM model and people_service.py have written person.avg_rating
since the people-rating feature was added, but no migration ever created the
column. Movie import hydrates credits via ``select(Person)``, which selects
every mapped column — the missing column made any import that touched people
fail with ``column people.avg_rating does not exist``.

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-28
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("people", sa.Column("avg_rating", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("people", "avg_rating")

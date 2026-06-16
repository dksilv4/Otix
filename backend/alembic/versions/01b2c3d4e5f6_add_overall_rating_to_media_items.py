"""add overall_rating and overall_rating_source to media_items

Revision ID: 01b2c3d4e5f6
Revises: 67fa8bdf58b5
Create Date: 2026-06-16 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "01b2c3d4e5f6"
down_revision: str | None = "67fa8bdf58b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c["name"] for c in inspector.get_columns("media_items")]
    if "overall_rating" not in columns:
        op.add_column("media_items", sa.Column("overall_rating", sa.Float(), nullable=True))
    if "overall_rating_source" not in columns:
        op.add_column("media_items", sa.Column("overall_rating_source", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("media_items", "overall_rating")
    op.drop_column("media_items", "overall_rating_source")

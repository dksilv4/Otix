"""Add started interaction type and started_count

Revision ID: 021_started
Revises: 020_user_list
Create Date: 2026-05-06

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE user_media_interactions DROP CONSTRAINT IF EXISTS ck_interaction_type"
    )
    op.execute(
        "ALTER TABLE user_media_interactions ADD CONSTRAINT ck_interaction_type "
        "CHECK (interaction_type IN ('rated', 'watched', 'liked', 'watchlisted', 'played', 'reviewed', 'started'))"
    )
    op.add_column(
        "media_items",
        sa.Column("started_count", sa.Integer(), server_default="0"),
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE user_media_interactions DROP CONSTRAINT IF EXISTS ck_interaction_type"
    )
    op.execute(
        "ALTER TABLE user_media_interactions ADD CONSTRAINT ck_interaction_type "
        "CHECK (interaction_type IN ('rated', 'watched', 'liked', 'watchlisted', 'played', 'reviewed'))"
    )
    op.drop_column("media_items", "started_count")

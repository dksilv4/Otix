"""add_owned_interaction_type

Revision ID: 7d5be39765fc
Revises: 5f930e0f17cc
Create Date: 2026-06-05 01:01:05.421133
"""

from collections.abc import Sequence

from alembic import op

revision: str = "7d5be39765fc"
down_revision: str | None = "5f930e0f17cc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE user_media_interactions "
        "DROP CONSTRAINT IF EXISTS ck_interaction_type"
    )
    op.execute(
        "ALTER TABLE user_media_interactions "
        "ADD CONSTRAINT ck_interaction_type CHECK ("
        "interaction_type IN ("
        "'rated', 'watched', 'liked', 'watchlisted', "
        "'played', 'reviewed', 'started', 'listened', 'owned'"
        ")"
        ")"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE user_media_interactions "
        "DROP CONSTRAINT IF EXISTS ck_interaction_type"
    )
    op.execute(
        "ALTER TABLE user_media_interactions "
        "ADD CONSTRAINT ck_interaction_type CHECK ("
        "interaction_type IN ("
        "'rated', 'watched', 'liked', 'watchlisted', "
        "'played', 'reviewed', 'started', 'listened'"
        ")"
        ")"
    )

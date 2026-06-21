"""Add 'owned' to ck_interaction_type check constraint

Revision ID: 6e0f8237d4c7
Revises: 5d0f9126d3c6
Create Date: 2026-06-07 01:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "6e0f8237d4c7"
down_revision: str | None = "5d0f9126d3c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE user_media_interactions DROP CONSTRAINT IF EXISTS ck_interaction_type")
    op.execute(
        "DO $$ BEGIN "
        "  ALTER TABLE user_media_interactions "
        "  ADD CONSTRAINT ck_interaction_type CHECK ("
        "  interaction_type = ANY (ARRAY["
        "  'rated', 'watched', 'liked', 'watchlisted', "
        "  'played', 'reviewed', 'started', 'listened', 'owned'"
        "  ])); "
        "EXCEPTION WHEN duplicate_object THEN "
        "  NULL; "
        "END $$"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE user_media_interactions DROP CONSTRAINT ck_interaction_type")
    op.execute("ALTER TABLE user_media_interactions ADD CONSTRAINT ck_interaction_type CHECK (interaction_type = ANY (ARRAY['rated', 'watched', 'liked', 'watchlisted', 'played', 'reviewed', 'started', 'listened']))")

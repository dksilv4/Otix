"""add trigram indexes on title/name and FK indexes on media_credits

Revision ID: b1c2d3e4f5a6
Revises: 8ca40cc38fc5
Create Date: 2026-05-24 20:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'b1c2d3e4f5a6'
down_revision: str | None = '8ca40cc38fc5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # GiST trigram index for similarity(title, query) > threshold searches.
    # GIN trigram does NOT support similarity() — only GiST does.
    op.execute(
        "CREATE INDEX ix_media_items_title_trgm ON media_items USING gist (title gist_trgm_ops)"
    )
    # GIN trigram index for ILIKE '%query%' on person names.
    op.execute(
        "CREATE INDEX ix_people_name_trgm ON people USING gin (name gin_trgm_ops)"
    )

    # FK join indexes for the credit-person EXISTS subquery in search
    op.create_index(
        "ix_media_credits_media_item_id",
        "media_credits",
        ["media_item_id"],
    )
    op.create_index(
        "ix_media_credits_person_id",
        "media_credits",
        ["person_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_media_credits_person_id", table_name="media_credits")
    op.drop_index("ix_media_credits_media_item_id", table_name="media_credits")
    op.execute("DROP INDEX IF EXISTS ix_people_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_media_items_title_trgm")

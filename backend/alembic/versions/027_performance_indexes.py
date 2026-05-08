"""Drop redundant expression-based search index, add btree indexes for sort performance.

The expression index ix_media_items_search (migration 023) is superseded by
idx_media_items_search (migration 001) on the precomputed search_vector column.
The expression index only adds write overhead with no query benefit.

Adds btree indexes on release_date and avg_rating so sorted-search and
list queries can scan instead of sorting.
"""

from alembic import op

revision: str = "027"
down_revision: str | None = "026"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_media_items_search")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_media_items_release_date "
        "ON media_items (release_date DESC NULLS LAST)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_media_items_avg_rating "
        "ON media_items (avg_rating DESC NULLS LAST)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_media_items_avg_rating")
    op.execute("DROP INDEX IF EXISTS idx_media_items_release_date")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_media_items_search "
        "ON media_items "
        "USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, '')))"
    )

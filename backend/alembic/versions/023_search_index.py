"""Add GIN expression index for full-text search on media_items."""

from alembic import op

revision: str = "023"
down_revision: str | None = "022"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX ix_media_items_search
        ON media_items
        USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, '')));
        """
    )


def downgrade() -> None:
    op.drop_index("ix_media_items_search", table_name="media_items")

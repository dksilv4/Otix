"""Add pg_trgm extension and trigram index on media_items.title for fuzzy search."""

from alembic import op

revision: str = "024"
down_revision: str | None = "023"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_media_items_title_trgm
        ON media_items USING gin (title gin_trgm_ops);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_media_items_title_trgm")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")

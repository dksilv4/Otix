"""Add pgvector extension, embedding column, and IVFFlat index for semantic search.

If pgvector is not available on the host the migration is a no-op — semantic
search degrades gracefully to FTS + trigram only.
"""

from alembic import op

revision: str = "026"
down_revision: str | None = "025"
branch_labels: str | None = None
depends_on: str | None = None

EMBEDDING_DIM = 384
IVFFLAT_LISTS = 100

UPGRADE_SQL = f"""
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
    ALTER TABLE media_items
        ADD COLUMN IF NOT EXISTS embedding vector({EMBEDDING_DIM});
    CREATE INDEX IF NOT EXISTS idx_media_items_embedding
        ON media_items
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = {IVFFLAT_LISTS});
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector not available, skipping semantic search: %', SQLERRM;
END $$;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_media_items_embedding")
    op.execute("ALTER TABLE media_items DROP COLUMN IF EXISTS embedding")
    op.execute("DROP EXTENSION IF EXISTS vector")

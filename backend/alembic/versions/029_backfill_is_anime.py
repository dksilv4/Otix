"""Backfill is_anime for movies and shows using existing keyword data.

Matches the _is_anime() logic in the TMDB transformer: any media item
with an "anime" keyword gets is_anime = true.
"""

from alembic import op
import sqlalchemy as sa

revision: str = "029"
down_revision: str | None = "028"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            UPDATE shows
            SET is_anime = true
            WHERE media_item_id IN (
                SELECT mk.media_item_id
                FROM media_keywords mk
                JOIN keywords k ON k.id = mk.keyword_id
                WHERE k.name ILIKE 'anime'
            )
        """),
    )
    conn.execute(
        sa.text("""
            UPDATE movies
            SET is_anime = true
            WHERE media_item_id IN (
                SELECT mk.media_item_id
                FROM media_keywords mk
                JOIN keywords k ON k.id = mk.keyword_id
                WHERE k.name ILIKE 'anime'
            )
        """),
    )


def downgrade() -> None:
    # No-op: can't distinguish backfilled values from synced values.
    pass

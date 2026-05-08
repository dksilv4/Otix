"""Backfill is_anime for shows: Japanese language + Animation genre.

Matches the _is_anime() ja+animation heuristic in the TMDB transformer.
Also handles shows that were already backfilled by 029 if it got rerun.
"""

from alembic import op
import sqlalchemy as sa

revision: str = "030"
down_revision: str | None = "029"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            UPDATE shows
            SET is_anime = true
            WHERE is_anime = false
              AND media_item_id IN (
                SELECT mi.id
                FROM media_items mi
                JOIN media_genres mg ON mg.media_item_id = mi.id
                JOIN genres g ON g.id = mg.genre_id
                WHERE mi.media_type = 'show'
                  AND mi.original_language = 'ja'
                  AND g.name = 'Animation'
              )
        """),
    )


def downgrade() -> None:
    pass

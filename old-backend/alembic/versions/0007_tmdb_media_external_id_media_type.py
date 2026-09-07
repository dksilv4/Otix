"""Make TMDB media-item external IDs media_type-aware.

TMDB reuses numeric IDs across media types (movie 62 "2001: A Space Odyssey",
show 62 "The Challenge", company 62 "Logo"). The old
``uq_external_id_provider_ext`` uniqueness on (provider, external_id,
entity_type) omitted media_type, so a movie and a show with the same TMDB id
collided: the sync pipeline hijacked the other's external_ids row, orphaning a
MediaItem and minting a fresh duplicate on every backlog cycle.

Replace the single 3-column constraint with partial unique indexes:

- TMDB media items: unique on (provider, external_id, media_type), so movie 62
  and show 62 can coexist as distinct rows.
- Other media items (igdb, steam, musicbrainz, ...) and non-media entities:
  keep the 3-column uniqueness, since those providers map one id to one media
  type.

Also backfill external_ids.media_type from the MediaItem each row points to, so
the new uniqueness is immediately meaningful (fixes legacy NULLs and hijacked
values like a movie row claiming a 'company' stub).

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-20
"""
from __future__ import annotations

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Backfill media_type for media_item rows from the entity they point to.
    # Done before creating the new indexes so they enforce the correct key.
    op.execute(
        """
        UPDATE external_ids e
        SET media_type = m.media_type
        FROM media_items m
        WHERE e.entity_type = 'media_item'
          AND e.entity_id = m.id
          AND e.media_type IS DISTINCT FROM m.media_type
        """
    )

    # uq_external_id_provider_ext is a UNIQUE constraint in the ORM baseline but
    # may exist as a bare UNIQUE INDEX in drifted environments (see 0006 for the
    # same index-vs-constraint pattern). Drop both forms so the leftover 3-column
    # uniqueness can't keep blocking movie/show coexistence.
    op.execute(
        "ALTER TABLE external_ids DROP CONSTRAINT IF EXISTS uq_external_id_provider_ext"
    )
    op.execute("DROP INDEX IF EXISTS uq_external_id_provider_ext")

    # TMDB media items: uniqueness includes media_type.
    op.execute(
        """
        CREATE UNIQUE INDEX uq_ext_tmdb_media
        ON external_ids (provider, external_id, media_type)
        WHERE entity_type = 'media_item' AND provider = 'tmdb'
        """
    )

    # Non-TMDB media items keep 3-column uniqueness (one id → one media type).
    op.execute(
        """
        CREATE UNIQUE INDEX uq_ext_media_other
        ON external_ids (provider, external_id, entity_type)
        WHERE entity_type = 'media_item' AND provider <> 'tmdb'
        """
    )

    # Non-media entities keep 3-column uniqueness.
    op.execute(
        """
        CREATE UNIQUE INDEX uq_ext_nonmedia
        ON external_ids (provider, external_id, entity_type)
        WHERE entity_type IS NOT NULL AND entity_type <> 'media_item'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_ext_nonmedia")
    op.execute("DROP INDEX IF EXISTS uq_ext_media_other")
    op.execute("DROP INDEX IF EXISTS uq_ext_tmdb_media")
    op.execute(
        "ALTER TABLE external_ids ADD CONSTRAINT uq_external_id_provider_ext "
        "UNIQUE (provider, external_id, entity_type)"
    )

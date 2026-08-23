"""Make (provider, external_id, media_type) globally unique on external_ids.

0007 added a TMDB-only partial index keyed on media_type, but the TMDB daily
import still re-inserted the full export every day: the stub partial index
``uq_external_id_provider_media_type_stub`` only deduped ``entity_type IS NULL``
rows, so a resolved media row (entity_type='media_item') never blocked a fresh
stub. Each re-inserted stub was re-dispatched by the backlog, and each legacy
orphaned item minted a fresh duplicate MediaItem on every cycle.

Replace both partial indexes (TMDB media + stub) with one non-partial unique
index on ``(provider, external_id, media_type)``:

- Movie 62 and show 62 coexist (keyed by media_type) — the TMDB ID-collision fix.
- A stub insert for an already-resolved id now conflicts with the media row and
  becomes a no-op — the daily import stops re-seeding resolved ids.

Also re-run the corrective ``media_type`` backfill (0007 ran before some legacy
code paths claimed non-media stubs as media rows, leaving rows like a movie
claiming 'company') and delete the stale NULL stubs that are the collision
surface blocking the index.

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-20
"""
from __future__ import annotations

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Re-align media_type for media_item rows. 0007's backfill ran before some
    # code paths claimed non-media stubs (company/keyword/...) as media rows,
    # leaving media_type='company' on rows pointing at shows.
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

    # Delete stale NULL stubs that already have a resolved media_item twin.
    # These are the exact rows the old partial stub index failed to dedup on
    # re-import; they now collide with the global index below.
    op.execute(
        """
        DELETE FROM external_ids stub
        WHERE stub.entity_type IS NULL
          AND EXISTS (
            SELECT 1 FROM external_ids o
            WHERE o.provider = stub.provider
              AND o.external_id = stub.external_id
              AND o.media_type IS NOT DISTINCT FROM stub.media_type
              AND o.entity_type = 'media_item'
          )
        """
    )

    # Swap the two partial indexes for one global index. uq_ext_media_other and
    # uq_ext_nonmedia stay — non-TMDB providers still map one id to one media
    # type, and their entity_type key is unchanged.
    op.execute("DROP INDEX IF EXISTS uq_ext_tmdb_media")
    op.execute("DROP INDEX IF EXISTS uq_external_id_provider_media_type_stub")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_external_id_provider_media_type
        ON external_ids (provider, external_id, media_type)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_external_id_provider_media_type")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_ext_tmdb_media
        ON external_ids (provider, external_id, media_type)
        WHERE entity_type = 'media_item' AND provider = 'tmdb'
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_external_id_provider_media_type_stub
        ON external_ids (provider, external_id, media_type)
        WHERE entity_type IS NULL
        """
    )

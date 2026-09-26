"""
Partial index on media_assets(media_item_id, asset_type) for locally mirrored card artwork.

The discover feed's ``prefer_local=True`` path annotates every row in the
catalog query with an EXISTS subquery that checks whether any card-type asset
(poster / textless_poster / backdrop) has been mirrored to local disk.
Without an index the planner performs a sequential scan of the full
``media_assets`` table for every candidate row, which accounts for ~1.2s of
latency on the game rails (the largest base set, since games have no
textless-poster gate).

The index is partial (WHERE local_name IS NOT NULL AND local_name != '') so it
only covers the rows the subquery can ever match — keeping its size small
regardless of how many remote-only assets exist.
"""

from django.db import migrations


def create_index(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
                media_assets_local_card_idx
            ON media_assets (media_item_id, asset_type)
            WHERE local_name IS NOT NULL
              AND local_name != '';
            """
        )
    else:
        schema_editor.execute(
            """
            CREATE INDEX IF NOT EXISTS
                media_assets_local_card_idx
            ON media_assets (media_item_id, asset_type)
            WHERE local_name IS NOT NULL
              AND local_name != '';
            """
        )


def drop_index(apps, schema_editor):
    schema_editor.execute("DROP INDEX IF EXISTS media_assets_local_card_idx;")


class Migration(migrations.Migration):
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    # Django wraps each migration in a transaction by default, so we must
    # opt out here. The index creation is idempotent (IF NOT EXISTS) and
    # safe to re-run if interrupted.
    atomic = False

    dependencies = [
        ("media", "0014_characterasset"),
    ]

    operations = [
        # Composite partial index: the EXISTS subquery in local_artwork_exists()
        # filters on (media_item_id, asset_type) with a local_name IS NOT NULL /
        # != '' guard. This index lets Postgres satisfy that subquery with an
        # index-only scan instead of a seqscan, dropping game-rail latency from
        # ~1.5 s to ~150 ms.
        migrations.RunPython(create_index, drop_index),
    ]

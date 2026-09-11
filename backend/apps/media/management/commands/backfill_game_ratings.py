"""Backfill IGDB rating/growth fields on seeded games that lack them.

The IGDB seed only started writing ``avg_rating`` / ``rating_count`` (and only
started recording the true IGDB ``game_type``) once the discover rails needed
them; games mapped before that still carry ``avg_rating IS NULL``,
``rating_count = 0`` and a default ``game_type`` of ``main_game`` — including
DLC/expansions that never got reclassified. That leaves the discover shelves
empty and lets expansions masquerade as main games.

This one-off refetches those games from IGDB in batches and applies:
  - ``_apply_game_growth`` — real game_type/release_status/parent/website, so
    DLC/expansion rows are relabeled and drop out of the main-game rails,
  - ``_top_up_media_popularity`` + ``top_up_game_ratings`` — the sort columns
    the popular/top_rated/now_playing shelves read.

All three are fill-once where it matters (a row that already carries a value is
left alone), so re-running is harmless and a later Steam-owned rating survives.
``--limit`` caps how many rows are touched; by default it covers every
mapped-but-ratingsless game.
"""

from __future__ import annotations

import asyncio

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.media.models import MediaItem
from apps.media.services.igdb_ingest import (
    GAME_HYDRATION_FIELDS,
    _apply_game_growth,
    _top_up_media_popularity,
    top_up_game_ratings,
)
from core.providers.igdb import IGDBProvider

_BATCH = 100


async def _fetch_raw_games(igdb_ids: list[int]) -> list[dict]:
    """Fetch full hydration payloads over a fresh async client."""
    provider = IGDBProvider()
    return await provider.get_games(igdb_ids, fields=GAME_HYDRATION_FIELDS)


class Command(BaseCommand):
    help = "Backfill IGDB game_type + avg_rating/rating_count on seeded games that lack them."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Max games to backfill (default: all that are missing ratings).",
        )
        parser.add_argument(
            "--batch",
            type=int,
            default=_BATCH,
            help="Games per IGDB fetch (default: 100).",
        )

    def handle(self, *args, **options) -> None:
        limit = options["limit"]
        batch_size = max(1, options["batch"])

        rows = list(
            MediaItem.objects.filter(
                media_type="game",
                external_ids__provider="igdb",
            )
            .filter(Q(avg_rating__isnull=True) | Q(rating_count=0))
            .order_by("id")
            .values_list("id", "external_ids__external_id")
            .distinct()
        )
        if limit is not None:
            rows = rows[:limit]

        if not rows:
            self.stdout.write("no games need a backfill")
            return

        pk_to_igdb = {media_pk: int(igdb_id) for media_pk, igdb_id in rows}
        pks = list(pk_to_igdb)
        total = len(pks)
        self.stdout.write(f"backfilling {total} games")

        done = 0
        failed = 0
        for start in range(0, total, batch_size):
            batch_pks = pks[start : start + batch_size]
            batch_ids = [pk_to_igdb[pk] for pk in batch_pks]
            media_by_id = {
                igdb_id: media
                for media in MediaItem.objects.select_related("game").filter(pk__in=batch_pks)
                for igdb_id in (pk_to_igdb[media.pk],)
            }
            try:
                raws = asyncio.run(_fetch_raw_games(batch_ids))
            except Exception as exc:  # network/auth hiccup — move on, retry later
                failed += len(batch_ids)
                self.stderr.write(f"batch failed ({exc}); {len(batch_ids)} skipped")
                continue
            for raw in raws:
                raw_id = raw.get("id")
                media = media_by_id.get(raw_id) if isinstance(raw_id, int) else None
                if media is None:
                    continue
                try:
                    _apply_game_growth(media.game, raw)
                    _top_up_media_popularity(media, raw)
                    top_up_game_ratings(media, raw)
                    done += 1
                except Exception:
                    continue  # per-row best-effort; refetch later
            self.stdout.write(f"  {min(start + batch_size, total)}/{total} (filled {done})")

        self.stdout.write(f"filled={done} failed={failed} scanned={total}")

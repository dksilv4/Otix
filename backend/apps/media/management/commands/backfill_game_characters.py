"""Management command to backfill characters for catalog games from IGDB."""

from __future__ import annotations

import asyncio
import logging
import time

from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from apps.media.models import Character, ExternalID, MediaCharacter, MediaItem
from core.providers.igdb import IGDBProvider
from core.providers.igdb.hydrators import _upsert_game_characters

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Backfill characters for catalog games from IGDB."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of games to backfill.",
        )
        parser.add_argument(
            "--game-id",
            type=int,
            default=None,
            help="Target a specific MediaItem ID.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-check games that already have characters attached.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Query IGDB and report character counts without saving.",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.25,
            help="Delay in seconds between IGDB queries to respect rate limits (default: 0.25s).",
        )

    def handle(self, *args, **options):
        limit = options.get("limit")
        game_id = options.get("game_id")
        force = options.get("force", False)
        dry_run = options.get("dry_run", False)
        delay = options.get("delay", 0.25)

        media_ct = ContentType.objects.get_for_model(MediaItem)

        qs = MediaItem.objects.filter(media_type="game")
        if game_id:
            qs = qs.filter(pk=game_id)
        elif not force:
            # Exclude games that already have attached characters
            has_chars_ids = MediaCharacter.objects.values_list(
                "media_item_id", flat=True
            ).distinct()
            qs = qs.exclude(pk__in=has_chars_ids)

        # Only games that have an IGDB external ID
        igdb_media_ids = ExternalID.objects.filter(
            content_type=media_ct, provider="igdb"
        ).values_list("object_id", flat=True)
        qs = qs.filter(pk__in=igdb_media_ids).order_by("pk")

        if limit:
            qs = qs[:limit]

        games = list(qs)
        total_games = len(games)
        if total_games == 0:
            self.stdout.write(self.style.WARNING("No games found requiring character backfill."))
            return

        self.stdout.write(
            f"Starting character backfill for {total_games} game(s) "
            f"(force={force}, dry_run={dry_run})..."
        )

        async def _fetch(provider, igdb_id):
            return await provider.get_game_characters(igdb_id)

        provider = IGDBProvider()
        games_with_chars = 0
        total_characters_found = 0
        errors = 0

        for idx, media in enumerate(games, start=1):
            ext = ExternalID.objects.filter(
                content_type=media_ct, object_id=media.pk, provider="igdb"
            ).first()
            if not ext or not ext.external_id.isdigit():
                continue

            igdb_id = int(ext.external_id)
            try:
                chars = asyncio.run(_fetch(provider, igdb_id))
                char_count = len(chars) if chars else 0

                if char_count > 0:
                    games_with_chars += 1
                    total_characters_found += char_count
                    self.stdout.write(
                        f"[{idx}/{total_games}] '{media.title}' (ID {media.pk}, IGDB {igdb_id}): "
                        f"found {char_count} character(s)"
                    )
                    if not dry_run:
                        _upsert_game_characters(media, chars)
                else:
                    self.stdout.write(
                        f"[{idx}/{total_games}] '{media.title}' (ID {media.pk}): 0 characters"
                    )

            except Exception as e:
                errors += 1
                self.stdout.write(
                    self.style.ERROR(
                        f"[{idx}/{total_games}] Failed fetching characters for '{media.title}' "
                        f"(ID {media.pk}, IGDB {igdb_id}): {e}"
                    )
                )

            if delay > 0 and idx < total_games:
                time.sleep(delay)

        self.stdout.write(
            self.style.SUCCESS(
                f"\nBackfill complete! Processed {total_games} game(s): "
                f"{games_with_chars} had characters, "
                f"{total_characters_found} total character links found, "
                f"{errors} error(s). Total Characters in DB: {Character.objects.count()}."
            )
        )

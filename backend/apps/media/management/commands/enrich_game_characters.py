"""Management command to enrich game characters with external IDs and artwork."""

from __future__ import annotations

import logging
import time

from django.core.management.base import BaseCommand

from apps.media.models import Character, MediaItem
from apps.media.services.character_enrichment import enrich_character, enrich_game_characters

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Enrich game characters with Fandom, Wikidata, and Commons imagery & external IDs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--game-id",
            type=int,
            default=None,
            help="Enrich characters for a specific MediaItem ID.",
        )
        parser.add_argument(
            "--character-id",
            type=int,
            default=None,
            help="Enrich a single Character by ID.",
        )
        parser.add_argument(
            "--community",
            type=str,
            default=None,
            help="Explicit Fandom community subdomain (e.g. 'clair-obscur', 'witcher', 'batman').",
        )
        parser.add_argument(
            "--now-playing",
            action="store_true",
            help="Target games from the 'now_playing' discover rail.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of games to process.",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.5,
            help="Delay in seconds between games to respect rate limits (default: 0.5s).",
        )

    def handle(self, *args, **options):
        game_id = options.get("game_id")
        character_id = options.get("character_id")
        community = options.get("community")
        now_playing = options.get("now_playing")
        limit = options.get("limit")
        delay = options.get("delay", 0.5)

        if character_id:
            char = Character.objects.filter(pk=character_id).first()
            if not char:
                self.stdout.write(self.style.ERROR(f"Character with ID {character_id} not found."))
                return
            self.stdout.write(f"Enriching character '{char.name}' (ID {char.pk})...")
            changed = enrich_character(char, fandom_community=community)
            asset_count = char.assets.count()
            ext_count = char.external_ids.count()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Done! Character '{char.name}': {asset_count} asset(s), "
                    f"{ext_count} external ID(s) (changed={changed})."
                )
            )
            return

        if now_playing:
            from apps.discover.services.discover import list_feed

            qs = list_feed(
                media_type="game",
                list_type="now_playing",
                genre=None,
                language=None,
                is_anime=None,
                platform=None,
                exclude_adult=True,
            )
        else:
            qs = MediaItem.objects.filter(media_type="game").order_by("pk")

        if game_id:
            qs = qs.filter(pk=game_id)
        if limit:
            qs = qs[:limit]

        games = list(qs)
        total = len(games)
        if total == 0:
            self.stdout.write(self.style.WARNING("No games found to process."))
            return

        self.stdout.write(f"Starting character enrichment for {total} game(s)...")
        total_enriched = 0

        for idx, media in enumerate(games, start=1):
            char_count = media.characters.count()
            self.stdout.write(
                f"[{idx}/{total}] Enriching '{media.title}' "
                f"(ID {media.pk}, {char_count} characters)..."
            )
            try:
                count = enrich_game_characters(media, fandom_community=community)
                total_enriched += count
                self.stdout.write(f"  -> Enriched {count} character(s).")
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  -> Error: {e}"))

            if delay > 0 and idx < total:
                time.sleep(delay)

        self.stdout.write(
            self.style.SUCCESS(
                f"\nCharacter enrichment complete! Processed {total} game(s), "
                f"enriched {total_enriched} characters."
            )
        )

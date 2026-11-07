"""Management command to identify duplicate game editions, model them as GameEdition records, and deduplicate catalog rows."""

from __future__ import annotations

import logging
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.library.models import GameMatchRecord, UserGame, UserLocalGame, UserMediaRequest
from apps.media.models import ExternalID, Game, GameEdition, MediaAsset, MediaItem
from apps.media.services.game_edition import (
    find_canonical_base_game,
    is_duplicate_edition,
    resolve_or_create_game_edition,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Identify and collapse duplicate game editions into GameEdition records under canonical base games."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview edition deduplication without writing database changes or deleting rows.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Limit the number of duplicate games to process (0 = all).",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        limit = options.get("limit", 0)

        self.stdout.write(self.style.NOTICE(f"Scanning game catalog for duplicate editions (dry_run={dry_run})..."))

        games_qs = (
            MediaItem.objects.filter(media_type="game")
            .select_related("game")
            .order_by("id")
        )
        total_games = games_qs.count()
        self.stdout.write(f"Total game MediaItems in catalog: {total_games}")

        media_item_ct = ContentType.objects.get_for_model(MediaItem)

        duplicates_found = 0
        canonical_linked = 0
        relations_repointed = 0
        deleted_count = 0

        # Preload IGDB external IDs for fast lookup
        ext_ids_map: dict[int, dict[str, str]] = {}
        for ext in ExternalID.objects.filter(content_type=media_item_ct, media_type="game"):
            if ext.object_id not in ext_ids_map:
                ext_ids_map[ext.object_id] = {}
            ext_ids_map[ext.object_id][ext.provider] = ext.external_id

        # Iterate over all game media items in chunks
        chunk_size = 500
        for offset in range(0, total_games, chunk_size):
            chunk = games_qs[offset : offset + chunk_size]
            for item in chunk:
                # Check if item itself is an edition
                item_ext_ids = ext_ids_map.get(item.id, {})
                igdb_id = item_ext_ids.get("igdb")

                game_obj: Game | None = getattr(item, "game", None)
                parent_game = game_obj.parent_game if game_obj else None
                parent_game_title = game_obj.parent_game_title if game_obj else None

                is_edition, edition_name = is_duplicate_edition(
                    title=item.title,
                    parent_name=parent_game_title or (parent_game.title if parent_game else None),
                )

                if not is_edition:
                    continue

                # Locate canonical base game
                base_game = parent_game
                if not base_game:
                    base_game = find_canonical_base_game(item.title, igdb_id=igdb_id)

                if not base_game or base_game.id == item.id:
                    continue

                duplicates_found += 1

                # Gather edition metadata
                edition_data = {
                    "name": edition_name,
                    "raw_title": item.title,
                    "igdb_id": igdb_id,
                    "release_date": item.release_date,
                    "external_ids": item_ext_ids,
                    "cover_image_id": None,
                    "summary": item.overview,
                    "is_default": False,
                }

                if dry_run:
                    if duplicates_found <= 50:
                        self.stdout.write(
                            f"  [Edition Match] {item.title!r} (ID: {item.id}) "
                            f"--> Base: {base_game.title!r} (ID: {base_game.id}) [{edition_name}]"
                        )
                else:
                    with transaction.atomic():
                        resolve_or_create_game_edition(base_game, edition_data)
                        canonical_linked += 1

                        # Repoint MediaAssets to canonical base game (respecting unique constraint uq_media_assets_item_url_type)
                        repointed_assets = 0
                        for asset in MediaAsset.objects.filter(media_item=item):
                            if not MediaAsset.objects.filter(
                                media_item=base_game,
                                url=asset.url,
                                asset_type=asset.asset_type,
                            ).exists():
                                asset.media_item = base_game
                                asset.save(update_fields=["media_item"])
                                repointed_assets += 1
                            else:
                                asset.delete()

                        # Repoint or transfer ExternalIDs
                        for ext in ExternalID.objects.filter(content_type=media_item_ct, object_id=item.id):
                            if not ExternalID.objects.filter(
                                content_type=media_item_ct,
                                object_id=base_game.id,
                                provider=ext.provider,
                                external_id=ext.external_id,
                            ).exists():
                                ext.object_id = base_game.id
                                ext.save(update_fields=["object_id"])
                            else:
                                ext.delete()

                        # Repoint library foreign keys pointing to duplicate MediaItem
                        repointed_local = UserLocalGame.objects.filter(media_item=item).update(media_item=base_game)
                        repointed_sugg = UserLocalGame.objects.filter(match_suggestion_media=item).update(match_suggestion_media=base_game)
                        repointed_canon = UserGame.objects.filter(media_item=item).update(media_item=base_game)
                        repointed_matches = GameMatchRecord.objects.filter(media_item=item).update(media_item=base_game)
                        repointed_requests = UserMediaRequest.objects.filter(media_item=item).update(media_item=base_game)

                        relations_repointed += (
                            repointed_assets
                            + repointed_local
                            + repointed_sugg
                            + repointed_canon
                            + repointed_matches
                            + repointed_requests
                        )

                        # Delete duplicate MediaItem
                        item.delete()
                        deleted_count += 1

                if limit > 0 and duplicates_found >= limit:
                    break

            if limit > 0 and duplicates_found >= limit:
                break

        self.stdout.write(self.style.SUCCESS("\n--- Game Editions Deduplication Summary ---"))
        self.stdout.write(f"Total games analyzed:         {total_games}")
        self.stdout.write(f"Duplicate editions detected:  {duplicates_found}")
        if not dry_run:
            self.stdout.write(f"Canonical editions created:   {canonical_linked}")
            self.stdout.write(f"Relations repointed:          {relations_repointed}")
            self.stdout.write(f"Duplicate MediaItems removed: {deleted_count}")
        else:
            self.stdout.write(self.style.WARNING("Dry run complete. No database changes were applied."))

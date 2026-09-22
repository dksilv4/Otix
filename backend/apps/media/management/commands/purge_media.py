"""Management command to delete all existing media from the database and disk cache."""

from __future__ import annotations

import logging

from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.media.models import Episode, ExternalID, MediaItem, Season
from apps.media.services.assets import purge_downloaded_assets

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Delete all existing media items, assets, external IDs, and mirrored disk files."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be deleted without actually deleting.",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)

        item_count = MediaItem.objects.count()
        episode_count = Episode.objects.count()
        season_count = Season.objects.count()

        media_cts = [
            ContentType.objects.get_for_model(MediaItem),
            ContentType.objects.get_for_model(Season),
            ContentType.objects.get_for_model(Episode),
        ]
        external_id_qs = ExternalID.objects.filter(content_type__in=media_cts)
        ext_count = external_id_qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] Would delete {item_count} MediaItems (with cascading records), "
                    f"{ext_count} ExternalIDs, and purge mirrored assets."
                )
            )
            return

        self.stdout.write(f"Purging {item_count} MediaItems and related media records...")

        # Purge physical disk mirror files first
        purge_report = purge_downloaded_assets()
        self.stdout.write(
            f"Purged {purge_report['deleted']} mirrored asset files "
            f"({purge_report['bytes_freed']} bytes freed)."
        )

        with transaction.atomic():
            ext_deleted, _ = external_id_qs.delete()
            items_deleted, details = MediaItem.objects.all().delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully deleted all media: {items_deleted} rows removed "
                f"({item_count} MediaItems, {ext_deleted} ExternalIDs, "
                f"{season_count} Seasons, {episode_count} Episodes). Details: {details}"
            )
        )

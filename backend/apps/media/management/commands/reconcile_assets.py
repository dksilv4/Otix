"""Management command to reconcile mirrored assets between database and disk."""

from __future__ import annotations

import logging
import os

from django.core.management.base import BaseCommand

from apps.media.models import MediaAsset
from apps.media.services import assets as assets_service

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Reconcile MediaAsset mirrored records with files on disk, or refetch missing artwork."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear-missing",
            action="store_true",
            help="Clear local_name/size/downloaded_at for assets missing from disk so catalog serves remote URLs.",
        )
        parser.add_argument(
            "--refetch",
            action="store_true",
            help="Refetch and mirror artwork for catalog items that are missing local files.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Maximum items to refetch when --refetch is used (default 50).",
        )

    def handle(self, *args, **options):
        clear_missing = options.get("clear_missing", False)
        refetch = options.get("refetch", False)
        limit = options.get("limit", 50)

        directory = assets_service.asset_dir()
        existing_files = set(os.listdir(directory)) if directory.is_dir() else set()
        total_mirrored_rows = MediaAsset.objects.filter(local_name__isnull=False).count()

        self.stdout.write(f"Asset directory: {directory}")
        self.stdout.write(f"Files found on disk: {len(existing_files)}")
        self.stdout.write(f"MediaAsset rows marked mirrored: {total_mirrored_rows}")

        if clear_missing:
            cleared = assets_service.reconcile_missing_assets()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Cleared {cleared} stale MediaAsset records whose files were missing from disk."
                )
            )

        if refetch:
            self.stdout.write(f"Running sweep to mirror missing artwork (limit={limit})...")
            report = assets_service.sweep_unmirrored_media(limit=limit)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Sweep complete: scanned {report['scanned']} items, mirrored {report['mirrored']}, "
                    f"wrote {report['bytes']} bytes."
                )
            )

        if not clear_missing and not refetch:
            if not existing_files and total_mirrored_rows > 0:
                self.stdout.write(
                    self.style.WARNING(
                        f"All {total_mirrored_rows} mirrored asset records are missing from disk! "
                        "Run with --clear-missing to reset catalog to remote URLs, "
                        "or with --refetch to re-download missing artwork."
                    )
                )
            else:
                missing_count = sum(
                    1
                    for name in MediaAsset.objects.filter(local_name__isnull=False).values_list(
                        "local_name", flat=True
                    )
                    if name not in existing_files
                )
                if missing_count > 0:
                    self.stdout.write(
                        self.style.WARNING(
                            f"{missing_count} MediaAsset records point to missing files on disk. "
                            "Use --clear-missing to resolve."
                        )
                    )
                else:
                    self.stdout.write(self.style.SUCCESS("All mirrored assets match disk state."))

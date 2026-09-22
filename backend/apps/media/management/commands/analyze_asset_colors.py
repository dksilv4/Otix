"""Management command to backfill color analysis for assets lacking color_guess."""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand

from apps.media.models import MediaAsset
from apps.media.services.assets import asset_dir
from apps.media.services.color_analyzer import analyze_image_file, analyze_image_url

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Analyze and backfill color_guess for media assets lacking color metadata."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Maximum number of assets to analyze (default: 100).",
        )
        parser.add_argument(
            "--type",
            type=str,
            default=None,
            help="Filter by asset_type (e.g. logo, backdrop, poster, icon).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Inspect and report color guesses without saving.",
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        asset_type = options.get("type")
        dry_run = options.get("dry_run", False)

        qs = MediaAsset.objects.filter(color_guess__isnull=True)
        if asset_type:
            qs = qs.filter(asset_type__iexact=asset_type)

        total_pending = qs.count()
        candidates = qs.order_by("-usage_count", "id")[:limit]

        self.stdout.write(
            f"Found {total_pending} assets without color_guess. "
            f"Processing up to {len(candidates)}..."
        )

        analyzed = 0
        updated = 0
        base_dir = asset_dir()

        for asset in candidates:
            guess = None
            if asset.local_name:
                local_path = base_dir / asset.local_name
                if local_path.is_file():
                    guess = analyze_image_file(local_path, asset.asset_type)

            if not guess and asset.url:
                guess = analyze_image_url(asset.url, asset.asset_type)

            if guess:
                analyzed += 1
                if not dry_run:
                    asset.color_guess = guess
                    asset.save(update_fields=["color_guess"])
                    updated += 1
                self.stdout.write(f"Asset #{asset.pk} ({asset.asset_type}): {guess}")

        action_desc = "Would update" if dry_run else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"Finished: analyzed {analyzed} assets. {action_desc} {updated} rows."
            )
        )

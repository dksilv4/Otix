"""Management command to backfill color analysis for assets lacking color_guess."""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.media.models import MediaAsset
from apps.media.services.assets import asset_dir
from apps.media.services.color_analyzer import (
    analyze_image_file,
    analyze_image_url,
    extract_dominant_color_file,
    extract_dominant_color_url,
)

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

        qs = MediaAsset.objects.filter(Q(color_guess__isnull=True) | Q(dominant_color__isnull=True))
        if asset_type:
            qs = qs.filter(asset_type__iexact=asset_type)

        total_pending = qs.count()
        candidates = qs.order_by("-usage_count", "id")[:limit]

        self.stdout.write(
            f"Found {total_pending} assets without color metadata. "
            f"Processing up to {len(candidates)}..."
        )

        analyzed = 0
        updated = 0
        base_dir = asset_dir()

        for asset in candidates:
            guess = asset.color_guess
            dom_col = asset.dominant_color
            to_update = []

            local_path = (base_dir / asset.local_name) if asset.local_name else None
            is_local = local_path and local_path.is_file()

            if not guess:
                if is_local:
                    guess = analyze_image_file(local_path, asset.asset_type)
                elif asset.url:
                    guess = analyze_image_url(asset.url, asset.asset_type)
                if guess:
                    asset.color_guess = guess
                    to_update.append("color_guess")

            if not dom_col:
                if is_local:
                    dom_col = extract_dominant_color_file(local_path)
                elif asset.url:
                    dom_col = extract_dominant_color_url(asset.url)
                if dom_col:
                    asset.dominant_color = dom_col
                    to_update.append("dominant_color")

            if to_update:
                analyzed += 1
                if not dry_run:
                    asset.save(update_fields=to_update)
                    updated += 1
                self.stdout.write(
                    f"Asset #{asset.pk} ({asset.asset_type}): guess={asset.color_guess}, dominant={asset.dominant_color}"
                )

        action_desc = "Would update" if dry_run else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"Finished: analyzed {analyzed} assets. {action_desc} {updated} rows."
            )
        )

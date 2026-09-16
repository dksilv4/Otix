"""Seed Otix catalog rows for unmatched scanned server games via Steam."""

from django.core.management.base import BaseCommand

from apps.media.services.steam_seed import seed_unmatched_server_games


class Command(BaseCommand):
    help = "Seed catalog games for unmatched scanned server titles using Steam store search."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--limit",
            type=int,
            default=5000,
            help="Max unmatched titles to search (default 5000).",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.2,
            help="Seconds to wait between Steam requests.",
        )

    def handle(self, *args, **options) -> None:
        result = seed_unmatched_server_games(limit=options["limit"], delay=options["delay"])
        created = result.get("created") or []
        skipped = result.get("skipped") or []
        unmatched = result.get("unmatched") or []
        self.stdout.write(
            f"Scanned {result.get('scanned_files', 0)} files, "
            f"searched {result.get('searched', 0)} titles."
        )
        self.stdout.write(self.style.SUCCESS(f"Created {len(created)}: {', '.join(created) or '—'}"))
        if skipped:
            self.stdout.write(f"Skipped {len(skipped)} already in catalog.")
        if unmatched:
            preview = ", ".join(unmatched[:20])
            extra = f" (+{len(unmatched) - 20} more)" if len(unmatched) > 20 else ""
            self.stdout.write(self.style.WARNING(f"No Steam match for {len(unmatched)}: {preview}{extra}"))

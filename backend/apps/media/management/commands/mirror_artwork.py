"""Management command: one-shot discover artwork mirror sweep.

Wraps ``assets_service.sweep_unmirrored_media`` so an operator can drain catalog
items that have remote primary artwork but no local copy yet, without waiting for
the ``mirror-discover-artwork`` beat task. Respects the server-wide mirroring +
discover toggles (either off => the sweep is a no-op reporting zeroes).
``--limit`` defaults to the admin-configured ``sweep_limit()``.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.media.services import assets as assets_service


class Command(BaseCommand):
    help = "Mirror artwork for up to --limit catalog items missing local copies."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Max items to mirror this run (default: the configured sweep limit).",
        )

    def handle(self, *args, **options) -> None:
        result = assets_service.sweep_unmirrored_media(limit=options["limit"])
        self.stdout.write(
            "scanned={scanned} mirrored={mirrored} bytes={bytes}".format(**result)
        )

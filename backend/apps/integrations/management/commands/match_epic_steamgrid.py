"""Command to resolve unmatched Epic games via SteamGridDB.

Usage:
    python manage.py match_epic_steamgrid [--limit N] [--user USERNAME] [--delay SECS]
"""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.integrations.services.epic_steamgrid import resolve_unmatched_epic_with_steamgrid

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Resolve unmatched Epic Games library entries using SteamGridDB"

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            type=str,
            help="Username to process (defaults to the first user)",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Limit the number of unmatched games to process",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.25,
            help="Delay in seconds between SteamGridDB lookups (default 0.25)",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        username = options.get("user")
        if username:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist as exc:
                raise CommandError(f"User '{username}' does not exist.") from exc
        else:
            user = User.objects.first()
            if not user:
                raise CommandError("No users exist in the database.")

        self.stdout.write(
            self.style.NOTICE(f"Starting SteamGridDB resolution for user '{user.username}'...")
        )

        def on_progress(processed: int, total: int, matched: int, assets: int) -> None:
            self.stdout.write(
                f"[{processed}/{total}] {matched} matched so far ({assets} artwork assets attached)..."
            )

        try:
            result = resolve_unmatched_epic_with_steamgrid(
                user,
                limit=options.get("limit"),
                delay=options.get("delay") or 0.25,
                on_progress=on_progress,
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        except Exception as exc:
            logger.exception("SteamGridDB resolution failed")
            raise CommandError(f"Failed to resolve games: {exc}") from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Completed: {result['matched']} matched / {result['total']} processed. "
                f"Failed: {result['failed']}. Artwork assets added: {result['assets_added']}."
            )
        )

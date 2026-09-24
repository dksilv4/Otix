"""Create a scoped plugin gateway token (prints the plaintext secret once).

The secret is only stored as a SHA-256 hash, so save the printed value now —
there is no way to recover it later. Each ``--grant`` is ``plugin`` (every
method) or ``plugin:prefix`` (only methods whose dotted name starts with
``prefix``). Repeat ``--grant`` to build a multi-plugin scope.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils.dateparse import parse_datetime

from plugin_framework.gateway import create_token


class Command(BaseCommand):
    help = "Create a scoped plugin gateway API token (secret printed once)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--name", required=True, help="Human label for the token")
        parser.add_argument(
            "--grant",
            action="append",
            required=True,
            metavar="PLUGIN[:PREFIX]",
            help="Scope grant: 'plex' (all methods) or 'plex:plex.identity' (prefix). Repeatable.",
        )
        parser.add_argument(
            "--expires",
            default=None,
            help="Optional ISO-8601 expiry (e.g. 2027-01-01T00:00:00Z)",
        )

    def handle(self, *args, **options) -> None:
        grants: list[dict] = []
        for grant in options["grant"]:
            plugin, _, prefix = grant.partition(":")
            if not plugin.strip():
                self.stderr.write(self.style.ERROR(f"invalid grant: {grant!r}"))
                return
            grants.append({"plugin": plugin.strip(), "methods": prefix})
        expires_at = parse_datetime(options["expires"]) if options["expires"] else None
        if options["expires"] and expires_at is None:
            self.stderr.write(self.style.ERROR("--expires must be ISO-8601"))
            return
        token, plaintext = create_token(name=options["name"], grants=grants, expires_at=expires_at)
        self.stdout.write(self.style.SUCCESS(f"Created token {token.name} (id={token.id})"))
        self.stdout.write(
            self.style.WARNING("Secret (shown once, stored only hashed): ") + plaintext
        )

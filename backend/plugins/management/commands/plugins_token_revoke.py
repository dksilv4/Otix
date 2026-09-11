"""Revoke a plugin gateway token by id or by its stored prefix."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from plugins.models import PluginAccessToken


class Command(BaseCommand):
    help = "Revoke a plugin gateway API token (--id or --prefix)."

    def add_arguments(self, parser) -> None:
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--id", type=int, help="Token database id")
        group.add_argument("--prefix", help="Token prefix (shown in the list command)")

    def handle(self, *args, **options) -> None:
        token = None
        if options["id"] is not None:
            token = PluginAccessToken.objects.filter(id=options["id"]).first()
        elif options["prefix"]:
            token = PluginAccessToken.objects.filter(prefix=options["prefix"]).first()
        if token is None:
            self.stderr.write(self.style.ERROR("Token not found."))
            return
        if not token.is_active:
            self.stdout.write(f"Token '{token.name}' is already revoked.")
            return
        token.is_active = False
        token.save(update_fields=("is_active", "updated_at"))
        self.stdout.write(self.style.SUCCESS(f"Revoked token '{token.name}'."))

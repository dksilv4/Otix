"""Disable a registered plugin (occ app:disable analog)."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from plugins.services import PluginStateError, disable_plugin


class Command(BaseCommand):
    help = "Disable a registered plugin."

    def add_arguments(self, parser) -> None:
        parser.add_argument("plugin")

    def handle(self, *args, **options) -> None:
        try:
            plugin = disable_plugin(options["plugin"])
        except PluginStateError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(f"Disabled {plugin.name} {plugin.version}.")

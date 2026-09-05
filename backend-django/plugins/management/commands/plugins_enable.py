"""Enable a registered plugin (occ app:enable analog)."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from plugins.services import PluginStateError, enable_plugin


class Command(BaseCommand):
    help = "Enable a registered plugin once its declared permissions are granted."

    def add_arguments(self, parser) -> None:
        parser.add_argument("plugin")

    def handle(self, *args, **options) -> None:
        try:
            plugin = enable_plugin(options["plugin"])
        except PluginStateError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(f"Enabled {plugin.name} {plugin.version}.")

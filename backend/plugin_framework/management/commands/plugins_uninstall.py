"""Forget a registered plugin (occ app:remove analog).

The registry row is deleted but the plugin *folder* is left on disk, so a later
``plugins_scan`` re-registers it. To fully remove a plugin, delete its folder.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from plugin_framework.services import PluginStateError, unregister_plugin


class Command(BaseCommand):
    help = "Unregister a plugin (deletes its registry row; folder is kept on disk)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("plugin")

    def handle(self, *args, **options) -> None:
        try:
            unregister_plugin(options["plugin"])
        except PluginStateError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(f"Unregistered {options['plugin']}.")

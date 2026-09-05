"""Scan a plugins root and register every healthy plugin folder.

The API-side mirror of Nextcloud's ``occ app:install`` flow for a local store:
scanning makes folders *available* (registry rows, disabled); ``plugins_enable``
activates them. Never loads plugin code — the separate host process does that.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from plugins.services import plugin_root, scan_root


class Command(BaseCommand):
    help = "Register healthy plugin folders under the plugins root."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--root",
            default=None,
            help="Scan this root instead of settings.PLUGINS_ROOT.",
        )

    def handle(self, *args, **options) -> None:
        root = plugin_root() if options["root"] is None else options["root"]
        report = scan_root(root)
        if not report:
            self.stdout.write(f"No plugin folders found under {root}.")
            return
        for item in report:
            if item["ok"]:
                state = "added" if item["created"] else "updated"
                on = "enabled" if item["enabled"] else "disabled"
                self.stdout.write(f"[{state}] {item['id']} {item['version']} ({on})")
            else:
                self.stderr.write(f"[error] {item['id']}: {item['error']}")
        self.stdout.write(f"Scanned {len(report)} folder(s) under {root}.")

"""Scan plugin folders and register every healthy one.

The API-side mirror of Nextcloud's ``occ app:install`` flow for a local store:
scanning makes folders *available* (registry rows); ``plugins_enable`` activates
operator folders. First-party bundled plugins (bundled_plugins/) are seeded as
auto-enabled system rows on the default run. Never loads plugin code — the
separate host process does that.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from plugin_framework.services import (
    bundled_root,
    plugin_root,
    scan_bundled,
    scan_extensions,
    scan_root,
)


class Command(BaseCommand):
    help = "Register plugin folders: bundled (system) + operator PLUGINS_ROOT + extensions."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--root",
            default=None,
            help="Scan only this operator root instead of the defaults.",
        )

    def handle(self, *args, **options) -> None:
        if options["root"] is not None:
            self._scan_root(scan_root(options["root"]), options["root"])
            return
        self._scan_root(scan_bundled(), bundled_root())
        self._scan_root(scan_root(plugin_root()), plugin_root())
        self._scan_root(scan_extensions(), "extensions")

    def _scan_root(self, report: list[dict], root) -> None:
        if not report:
            self.stdout.write(f"No plugin folders found under {root}.")
            return
        for item in report:
            if item["ok"]:
                if item.get("skipped"):
                    self.stdout.write(f"[skip] {item['id']}: {item['skipped']}")
                    continue
                state = "added" if item["created"] else "updated"
                on = "enabled" if item["enabled"] else "disabled"
                self.stdout.write(f"[{state}] {item['id']} {item['version']} ({on})")
            else:
                self.stderr.write(f"[error] {item['id']}: {item['error']}")
        self.stdout.write(f"Scanned {len(report)} folder(s) under {root}.")

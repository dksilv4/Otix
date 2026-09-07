"""List registered plugins and their enable/grant state (occ app:list analog)."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from plugins.models import Plugin


class Command(BaseCommand):
    help = "List registered plugins with their enable/grant state."

    def handle(self, *args, **options) -> None:
        plugins = Plugin.objects.all()
        if not plugins:
            self.stdout.write("No plugins registered (run plugins_scan).")
            return
        for plugin in plugins:
            missing = plugin.missing_grants()
            state = "enabled" if plugin.enabled else "disabled"
            suffix = ""
            if missing:
                suffix = f"  MISSING GRANTS: {', '.join(missing)}"
            elif plugin.system:
                suffix = "  (system)"
            elif plugin.error:
                suffix = f"  error: {plugin.error}"
            self.stdout.write(
                f"{plugin.name:<24} {plugin.version:<10} {state:<9} "
                f"{plugin.stage:<8}{suffix}"
            )

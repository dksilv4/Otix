"""In-process registry of loaded server plugins.

Plugins are folders discovered by ``plugins.discovery``; :meth:`PluginRegistry.
scan_and_load` turns each healthy folder into a live :class:`Plugin` instance
by importing its entry module and instantiating the ``Plugin`` subclass it
defines. The registry isolates failures: one plugin that fails to import never
blocks the others, and every error is recorded (``errors`` / ``all()``) so the
host can surface it in the admin/config UI.

Entry modules are imported *by file path* because plugin folders can live
anywhere the operator chooses; the synthetic module name is derived from the
plugin id so re-scans replace rather than collide.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

from plugins.base import Plugin, PluginError
from plugins.discovery import DiscoveredPlugin, scan
from plugins.manifest import PluginManifest

_MODULE_SAFE = re.compile(r"[^a-zA-Z0-9_]+")


def module_name_for(plugin_id: str, entry_stem: str) -> str:
    return f"_plugin_{_MODULE_SAFE.sub('_', plugin_id)}_{_MODULE_SAFE.sub('_', entry_stem)}"


def load_plugin(manifest: PluginManifest, root: Path) -> Plugin:
    """Import a plugin's entry module and instantiate its ``Plugin`` subclass."""
    entry = root / manifest.entry_main
    module_name = module_name_for(manifest.name, entry.stem)
    sys.modules.pop(module_name, None)  # re-scan replaces, never duplicates
    spec = importlib.util.spec_from_file_location(module_name, entry)
    if spec is None or spec.loader is None:  # pragma: no cover - defensive
        raise PluginError(f"cannot load plugin entry: {entry}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    for candidate in vars(module).values():
        if (
            isinstance(candidate, type)
            and issubclass(candidate, Plugin)
            and candidate is not Plugin
        ):
            return candidate(manifest)
    raise PluginError(f"entry module '{manifest.entry_main}' must define a Plugin subclass")


class PluginRegistry:
    """Owns the set of loaded plugins and the failures from the last scan."""

    def __init__(self) -> None:
        self._plugins: dict[str, Plugin] = {}
        self.errors: dict[str, str] = {}

    def register(self, plugin: Plugin) -> None:
        """Register an already-instantiated plugin (explicit installs)."""
        self._plugins[plugin.manifest.name] = plugin

    def get(self, plugin_id: str) -> Plugin | None:
        return self._plugins.get(plugin_id)

    def get_by_name(self, display_name: str) -> Plugin | None:
        return next(
            (p for p in self._plugins.values() if p.manifest.name == display_name),
            None,
        )

    def all(self) -> list[Plugin]:
        return list(self._plugins.values())

    def ids(self) -> list[str]:
        return sorted(self._plugins)

    def scan_and_load(self, root: str | Path) -> list[DiscoveredPlugin]:
        """Discover + load every healthy plugin under ``root``.

        Returns the discovery records (so callers can see per-folder status);
        healthy ones are loaded into the registry and failures are stored in
        ``errors`` keyed by folder name.
        """
        self._plugins.clear()
        self.errors.clear()
        found = scan(root)
        for record in found:
            if record.error is not None or record.manifest is None:
                self.errors[record.root.name] = record.error or "unknown error"
                continue
            try:
                plugin = load_plugin(record.manifest, record.root)
            except PluginError as exc:
                self.errors[record.root.name] = str(exc)
                continue
            self._plugins[record.manifest.name] = plugin
        return found


# Process-wide default registry; host code may create private registries for
# isolated plugin sets (e.g. a marketplace sandbox) instead.
default_registry = PluginRegistry()


def discover_and_load(root: str | Path) -> PluginRegistry:
    """Convenience: scan ``root`` into the default registry and return it."""
    default_registry.scan_and_load(root)
    return default_registry

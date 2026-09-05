"""Filesystem discovery of drop-in server plugins.

A server plugin is a folder (a Python package with ``__init__.py``) containing
``manifest.yaml`` and an entry module (default ``plugin.py``). Discovery scans
a plugins root one level deep, loads + validates each manifest, and reports
per-plugin errors instead of failing the whole scan — a broken plugin must not
take the healthy ones down.

The manifest ``name`` must equal the folder name (the Nextcloud app rule): the
folder is the unit of identity, so an id that silently diverged from its
location would make uninstall/upgrade ambiguous.

Only folders that look like plugins (contain a ``manifest.yaml``) are
considered; everything else under the root is ignored so a plugins root can
also hold scaffolding, notes and the like.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from plugins.manifest import ManifestError, PluginManifest, load_manifest

MANIFEST_FILE = "manifest.yaml"


@dataclass(frozen=True)
class DiscoveredPlugin:
    """One plugin folder found by :func:`scan`."""

    id: str
    root: Path
    manifest: PluginManifest | None = None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.manifest is not None and self.error is None


def iter_plugin_roots(root: str | Path) -> list[Path]:
    """Directories under ``root`` that declare a ``manifest.yaml``."""
    root = Path(root)
    if not root.is_dir():
        return []
    return sorted(
        p for p in root.iterdir()
        if p.is_dir() and not p.name.startswith(("_", ".")) and (p / MANIFEST_FILE).is_file()
    )


def scan(root: str | Path) -> list[DiscoveredPlugin]:
    """Scan ``root`` for plugin folders, loading and validating each manifest."""
    discovered: list[DiscoveredPlugin] = []
    for folder in iter_plugin_roots(root):
        try:
            manifest = load_manifest(folder / MANIFEST_FILE)
            if manifest.name != folder.name:
                raise ManifestError(
                    f"manifest 'name' ({manifest.name}) must match folder name "
                    f"({folder.name})"
                )
            entry = folder / manifest.entry_main
            if not entry.is_file():
                raise ManifestError(
                    f"entry module '{manifest.entry_main}' missing"
                )
            if not (folder / "__init__.py").is_file():
                raise ManifestError("plugin folder must be a Python package (add __init__.py)")
        except ManifestError as exc:
            discovered.append(
                DiscoveredPlugin(id=folder.name, root=folder, error=str(exc))
            )
            continue
        discovered.append(
            DiscoveredPlugin(id=manifest.name, root=folder, manifest=manifest)
        )
    return discovered

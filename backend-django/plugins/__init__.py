"""Server-side plugin framework (host).

The self-hosted Otix strategy makes plugins a first-class server concept: each
plugin is a drop-in folder (``manifest.yaml`` + ``plugin.py``) the brain
discovers and runs natively — no Node service. This package is both the
framework core and a Django app (``plugins.apps.PluginsConfig``, registered in
``INSTALLED_APPS`` so host models/migrations/admin can live here and its tests
run in the default suite).

Public API:
- ``manifest``   — YAML schema + validation mirroring ``desktop/plugins/types.ts``
- ``permissions``— capability-token vocabulary + grant math (``table:*``/``network:*``)
- ``base``       — ``Plugin`` base + JSON-safe output + data-method dispatch
- ``discovery``  — filesystem scan of a plugins root
- ``registry``   — load + hold live plugins, isolating per-plugin failures

A plugin's own Django models/migrations (the §4 "plugin becomes an app" step)
are a later increment: this layer is the manifest→load→dispatch foundation that
step builds on.
"""

from plugins.base import Plugin, PluginError, to_json_safe
from plugins.discovery import DiscoveredPlugin, scan
from plugins.manifest import (
    ManifestError,
    PluginManifest,
    PluginService,
    load_manifest,
    parse_manifest,
)
from plugins.permissions import codename_for, missing_grants, unsupported_grants
from plugins.registry import PluginRegistry, default_registry, discover_and_load

__version__ = "0.1.0"

__all__ = [
    "DiscoveredPlugin",
    "ManifestError",
    "Plugin",
    "PluginError",
    "PluginManifest",
    "PluginRegistry",
    "PluginService",
    "__version__",
    "codename_for",
    "default_registry",
    "discover_and_load",
    "load_manifest",
    "missing_grants",
    "parse_manifest",
    "scan",
    "to_json_safe",
    "unsupported_grants",
]

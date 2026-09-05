"""Plugin manifest schema — the server-side mirror of the JS plugin manifest.

A drop-in JS plugin (``manifest.json`` + ``main.js``) becomes a drop-in server
plugin folder (``manifest.yaml`` + ``plugin.py``). The schema below mirrors
``desktop/plugins/types.ts`` so a single manifest vocabulary serves the React
frontend unchanged and the Django host: every field the UI reads (permissions,
config, slots, settings, services, db) is represented. YAML is used instead of
JSON so manifests can carry comments.

Validation rules
----------------
- ``name`` must be a lowercase slug; it is the stable plugin id.
- ``entry.main`` is a bare filename resolved inside the plugin folder. Absolute
  paths and ``..`` traversal are rejected (a manifest must never dictate where
  the host imports from).
- ``permissions`` entries must match the capability token grammar and, unless
  they are a known vocabulary token or a server grant (``table:*`` /
  ``network:*``), load fails loudly rather than silently trusting unknown power.
- Unknown keys are ignored so future manifest fields do not break old hosts.

The parsed object is frozen and JSON-serialisable via :meth:`to_dict` (the
shape the host API / frontend consume).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

SLUG_RE = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
# Capability tokens: ``scope:resource`` (ui:nav.item, table:media_ratings) or a
# bare power word (notifications). Dots/asterisks allowed inside the resource.
TOKEN_RE = re.compile(r"^[a-z][a-z0-9]*(?::[a-z0-9][a-z0-9_.*]*)?$")

# Frontend vocabulary (desktop/plugins/types.ts) + server-side grants that the
# legacy sandbox expressed as ``table:*``-style strings. Anything matching the
# token grammar that is not in here must start with a recognised server grant
# scope (``table:`` / ``network:``), mirroring the legacy permission model.
KNOWN_PERMISSIONS = frozenset(
    {
        "network:external",
        "storage:local",
        "events:subscribe",
        "ui:settings",
        "ui:media.actions",
        "ui:list.actions",
        "ui:nav.item",
        "ui:dashboard.widget",
        "notifications",
        "api:proxy",
        "ui:command",
    }
)
SERVER_GRANT_SCOPES = ("table:", "network:")

STAGES = ("alpha", "beta", "stable")
# Known ``config`` field types (desktop/plugins/types.ts ``PluginConfigFieldType``).
CONFIG_FIELD_TYPES = frozenset(
    {
        "string",
        "number",
        "boolean",
        "secret",
        "enum",
        "select",
        "uuid",
        "list",
        "path-list",
        "object",
        "instances",
        "serverUrl",
    }
)

_DEFAULT_ENTRY = "plugin.py"


class ManifestError(ValueError):
    """A manifest failed to parse or failed validation."""


def _as_text(value) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ManifestError("expected a string value")
    return value


def _as_int(value, what: str) -> int | None:
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        raise ManifestError(f"{what} must be an integer")
    return value


def _as_bool(value, what: str) -> bool:
    if value is None:
        return False
    if not isinstance(value, bool):
        raise ManifestError(f"{what} must be a boolean")
    return value


@dataclass(frozen=True)
class PluginService:
    """A capability the plugin provides to the host (legacy ``services``)."""

    type: str
    methods: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {"type": self.type, "methods": list(self.methods)}


@dataclass(frozen=True)
class PluginManifest:
    """Validated plugin manifest.

    ``entry.main`` is resolved to a module name + file at load time (see
    ``plugins.registry.load_plugin``); here it stays the declared filename so
    the manifest is round-trippable.
    """

    name: str
    version: str
    description: str = ""
    author: str = ""
    repository: str = ""
    min_app_version: str = ""
    timeout: int | None = None
    icon: str | None = None
    stage: str = "stable"
    system: bool = False
    permissions: tuple[str, ...] = ()
    entry_main: str = _DEFAULT_ENTRY
    depends_on: tuple[str, ...] = ()
    services: tuple[PluginService, ...] = ()
    config: dict = field(default_factory=dict)
    slots: tuple = ()
    settings_tabs: tuple = ()
    db_tables: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Re-serialisable manifest shaped like the JS ``PluginManifest``."""
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "author": self.author,
            "repository": self.repository,
            "min_app_version": self.min_app_version,
            "timeout": self.timeout,
            "icon": self.icon,
            "stage": self.stage,
            "system": self.system,
            "permissions": list(self.permissions),
            "entry": {"main": self.entry_main},
            "depends_on": list(self.depends_on),
            "services": [s.to_dict() for s in self.services],
            "config": self.config,
            "slots": list(self.slots),
            "settings": {"tabs": list(self.settings_tabs)},
            "db": {"tables": self.db_tables},
        }


def _validate_entry(entry, root: Path | None) -> str:
    if not isinstance(entry, dict) or not isinstance(entry.get("main"), str):
        raise ManifestError("'entry.main' must be a string")
    main = entry["main"].strip() or _DEFAULT_ENTRY
    if main.startswith(("/", "\\")) or ".." in Path(main).parts:
        raise ManifestError("'entry.main' must be a filename inside the plugin folder")
    if root is not None and not (root / main).is_file():
        raise ManifestError(f"entry file '{main}' not found in plugin folder")
    return main


def _normalise_services(raw) -> tuple[PluginService, ...]:
    if raw in (None, ""):
        return ()
    if not isinstance(raw, list):
        raise ManifestError("'services' must be a list")
    services: list[PluginService] = []
    for item in raw:
        if isinstance(item, str):
            services.append(PluginService(type=item))
        elif isinstance(item, dict) and isinstance(item.get("type"), str):
            methods = item.get("methods") or []
            if not isinstance(methods, list) or not all(
                isinstance(m, str) for m in methods
            ):
                raise ManifestError("service 'methods' must be a list of strings")
            services.append(PluginService(type=item["type"], methods=tuple(methods)))
        else:
            raise ManifestError("'services' entries must be strings or {type, methods}")
    return tuple(services)


def _validate_permissions(raw) -> tuple[str, ...]:
    if raw in (None, ""):
        return ()
    if not isinstance(raw, list) or not all(isinstance(p, str) for p in raw):
        raise ManifestError("'permissions' must be a list of strings")
    permissions = tuple(raw)
    for token in permissions:
        if not TOKEN_RE.match(token):
            raise ManifestError(f"permission '{token}' is not a valid capability token")
        if token not in KNOWN_PERMISSIONS and not token.startswith(SERVER_GRANT_SCOPES):
            raise ManifestError(
                f"permission '{token}' is not a known capability"
                f" (known: {sorted(KNOWN_PERMISSIONS)} or a {SERVER_GRANT_SCOPES} grant)"
            )
    return permissions


def _validate_config(raw) -> dict:
    if raw in (None, ""):
        return {}
    if not isinstance(raw, dict):
        raise ManifestError("'config' must be an object of {field: {type, ...}}")
    for key, spec in raw.items():
        if not isinstance(spec, dict) or "type" not in spec:
            raise ManifestError(f"config field '{key}' needs a 'type'")
        if spec["type"] not in CONFIG_FIELD_TYPES:
            raise ManifestError(
                f"config field '{key}' has unknown type '{spec['type']}'"
                f" (known: {sorted(CONFIG_FIELD_TYPES)})"
            )
    return raw


def parse_manifest(data: str, root: Path | None = None) -> PluginManifest:
    """Parse + validate YAML text into a frozen :class:`PluginManifest`."""
    try:
        raw = yaml.safe_load(data)
    except yaml.YAMLError as exc:  # pragma: no cover - message varies by parser
        raise ManifestError(f"invalid YAML: {exc}") from exc
    if not isinstance(raw, dict):
        raise ManifestError("manifest must be a YAML mapping")
    name = _as_text(raw.get("name")).strip()
    if not SLUG_RE.match(name):
        raise ManifestError("'name' must be a lowercase slug (letters, digits, hyphens)")
    version = _as_text(raw.get("version")).strip()
    if not version:
        raise ManifestError("'version' is required")

    stage = _as_text(raw.get("stage")) or "stable"
    if stage not in STAGES:
        raise ManifestError(f"'stage' must be one of {STAGES}")

    permissions = _validate_permissions(raw.get("permissions"))
    entry_main = _validate_entry(raw.get("entry") or {"main": _DEFAULT_ENTRY}, root)
    depends_on = tuple(
        p
        for p in raw.get("depends_on") or []
        if isinstance(p, str) and SLUG_RE.match(p)
    )

    return PluginManifest(
        name=name,
        version=version,
        description=_as_text(raw.get("description")),
        author=_as_text(raw.get("author")),
        repository=_as_text(raw.get("repository")),
        min_app_version=_as_text(raw.get("min_app_version")),
        timeout=_as_int(raw.get("timeout"), "'timeout'"),
        icon=raw.get("icon") if isinstance(raw.get("icon"), str) else None,
        stage=stage,
        system=_as_bool(raw.get("system"), "'system'"),
        permissions=permissions,
        entry_main=entry_main,
        depends_on=depends_on,
        services=_normalise_services(raw.get("services")),
        config=_validate_config(raw.get("config")),
        slots=tuple(raw.get("slots") or []),
        settings_tabs=tuple((raw.get("settings") or {}).get("tabs") or []),
        db_tables=(raw.get("db") or {}).get("tables") or {},
    )


def load_manifest(path: str | Path) -> PluginManifest:
    """Load + validate the manifest file at ``path``."""
    path = Path(path)
    if not path.is_file():
        raise ManifestError(f"manifest not found: {path}")
    return parse_manifest(path.read_text(encoding="utf-8"), root=path.parent)

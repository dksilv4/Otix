"""Plugin registry service — the API's interface to plugin state.

Registering (scan), enabling, disabling, granting and uninstalling never execute
plugin code: they read a manifest from disk, sync the ``Plugin`` row (operator
intent / the API's source of truth), and leave actually *loading* code to the
separate host process, which reacts to the rows. HTTP-free, so the manage.py
commands and the future config/PluginAPI endpoints share it.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from django.conf import settings

from plugin_framework.discovery import scan
from plugin_framework.gateway import deactivate_plugin_tokens, ensure_plugin_token
from plugin_framework.manifest import PluginManifest
from plugin_framework.models import Plugin

logger = logging.getLogger(__name__)


class PluginStateError(ValueError):
    """A plugin state transition was rejected (unknown/missing grants/etc.)."""


def plugin_root() -> Path:
    return Path(settings.PLUGINS_ROOT)


def bundled_root() -> Path:
    return Path(settings.BUNDLED_PLUGINS_ROOT)


def _manifest_defaults(manifest: PluginManifest) -> dict[str, Any]:
    return {
        "version": manifest.version,
        "description": manifest.description,
        "author": manifest.author,
        "repository": manifest.repository,
        "icon": manifest.icon or "",
        "stage": manifest.stage,
        "min_app_version": manifest.min_app_version,
        "manifest": manifest.to_dict(),
        "permissions_declared": list(manifest.permissions),
    }


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def register_plugin(
    manifest: PluginManifest, *, system: bool = False, grant: list[str] | None = None
) -> tuple[Plugin, bool]:
    """Create or refresh the registry row for ``manifest``.

    Creating seeds ``enabled=False`` (unless ``system``), empty config/instances
    and grants = declared + extra ``grant`` tokens. Refreshing keeps the
    operator's enabled/config/instances/granted, re-seeds freshly declared
    permissions into granted (trusted-self-host default: a version that starts
    asking for more still runs) and preserves operator-added grants such as
    ``table:any``. Returns ``(plugin, created)``.
    """
    granted = _dedupe((grant or []) + list(manifest.permissions))
    existing = Plugin.objects.filter(name=manifest.name).first()
    if existing is None:
        plugin = Plugin(
            name=manifest.name,
            permissions_granted=granted,
            config={},
            instances=[],
            enabled=system,
            system=system,
            error="",
            **_manifest_defaults(manifest),
        )
        plugin.save()
        if plugin.enabled:
            # Auto-enabled (system) plugins come up with their token live, so the
            # registry and the gateway never disagree about enabled == has token.
            ensure_plugin_token(plugin=plugin.name)
        return plugin, True
    for key, value in _manifest_defaults(manifest).items():
        setattr(existing, key, value)
    existing.permissions_granted = _dedupe(list(existing.permissions_granted or []) + granted)
    existing.system = existing.system or system
    existing.error = ""
    existing.save()
    return existing, False


def _get_plugin(name: str) -> Plugin:
    plugin = Plugin.objects.filter(name=name).first()
    if plugin is None:
        raise PluginStateError(f"plugin '{name}' is not registered (run plugins_scan)")
    return plugin


def enable_plugin(name: str) -> Plugin:
    """Enable a registered plugin, refusing until every declared grant is present."""
    plugin = _get_plugin(name)
    if plugin.system:
        raise PluginStateError(f"plugin '{name}' is a system plugin and always enabled")
    missing = plugin.missing_grants()
    if missing:
        raise PluginStateError(
            f"plugin '{name}' declares permissions not granted: {', '.join(missing)}"
        )
    invalid = plugin.invalid_grants()
    if invalid:
        raise PluginStateError(
            f"plugin '{name}' has unknown granted permissions: {', '.join(invalid)}"
        )
    plugin.enabled = True
    plugin.error = ""
    plugin.save(update_fields=("enabled", "error", "updated_at"))
    # An enabled plugin owns an active scoped token; mint it when missing so the
    # registry and gateway agree (existing shared secrets are kept on re-enable).
    ensure_plugin_token(plugin=plugin.name)
    return plugin


def disable_plugin(name: str) -> Plugin:
    plugin = _get_plugin(name)
    if plugin.system:
        raise PluginStateError(f"plugin '{name}' is a system plugin and cannot be disabled")
    plugin.enabled = False
    plugin.save(update_fields=("enabled", "updated_at"))
    # Disabling cuts third-party access: deactivate the plugin's tokens so any
    # previously-shared secret stops resolving immediately.
    deactivate_plugin_tokens(plugin.name)
    return plugin


def unregister_plugin(name: str) -> None:
    plugin = _get_plugin(name)
    if plugin.system:
        raise PluginStateError(f"plugin '{name}' is a system plugin and cannot be uninstalled")
    plugin.delete()


def scan_root(root: str | Path | None = None) -> list[dict]:
    """Register every healthy plugin folder under ``root``; report per folder.

    A broken folder never blocks the rest: it is reported and its error is
    surfaced on any existing registry row. Returns a JSON-friendly per-folder
    report (``ok``/``created``/``enabled``/``version`` or ``ok=False``+``error``).
    """
    records = scan(plugin_root() if root is None else root)
    report: list[dict] = []
    for record in records:
        if not record.ok:
            existing = Plugin.objects.filter(name=record.id).first()
            if existing is not None:
                existing.error = record.error or ""
                existing.save(update_fields=("error", "updated_at"))
            report.append({"id": record.id, "ok": False, "error": record.error})
            continue
        plugin, created = register_plugin(record.manifest)
        report.append(
            {
                "id": plugin.name,
                "ok": True,
                "created": created,
                "enabled": plugin.enabled,
                "version": plugin.version,
            }
        )
    return report


def scan_bundled() -> list[dict]:
    """Seed first-party plugins (BUNDLED_PLUGINS_ROOT) as auto-enabled system rows.

    Bundled plugins are shipped with the app and never disabled/uninstalled — the
    Nextcloud shipped-apps analog. A same-named plugin the operator installed
    under PLUGINS_ROOT shadows the bundled copy (their row stays operator-owned).
    """
    records = scan(bundled_root())
    report: list[dict] = []
    for record in records:
        if not record.ok:
            existing = Plugin.objects.filter(name=record.id).first()
            if existing is not None:
                existing.error = record.error or ""
                existing.save(update_fields=("error", "updated_at"))
            report.append({"id": record.id, "ok": False, "error": record.error})
            continue
        if Plugin.objects.filter(name=record.id, system=False).exists():
            report.append(
                {"id": record.id, "ok": True, "created": False, "skipped": "operator copy wins"}
            )
            continue
        plugin, created = register_plugin(record.manifest, system=True)
        if plugin.system and not plugin.enabled:
            plugin.enabled = True
            plugin.save(update_fields=("enabled", "updated_at"))
            ensure_plugin_token(plugin=plugin.name)
        report.append(
            {
                "id": plugin.name,
                "ok": True,
                "created": created,
                "enabled": plugin.enabled,
                "version": plugin.version,
            }
        )
    return report


def scan_extensions() -> list[dict]:
    """Scan the community plugin folder (extensions/plugins/) and register all
    available plugins into the database. This is the single source of truth for
    community plugins — the otix-plugins submodule has been removed.
    """
    repo_root = Path(settings.BASE_DIR).parent
    plugins_root = repo_root / "extensions" / "plugins"
    report: list[dict] = []
    seen_ids: set[str] = set()

    if not plugins_root.is_dir():
        return report

    for folder in sorted(plugins_root.iterdir()):
        if not folder.is_dir() or folder.name.startswith(("_", ".")):
            continue
        manifest_file = folder / "manifest.json"
        if not manifest_file.is_file():
            continue

        plugin_id = folder.name
        if plugin_id in seen_ids:
            continue
        seen_ids.add(plugin_id)

        try:
            manifest_data = json.loads(manifest_file.read_text("utf-8"))
        except Exception as exc:
            report.append({"id": plugin_id, "ok": False, "error": str(exc)})
            continue

        display_name = manifest_data.get("name") or plugin_id
        version = str(manifest_data.get("version") or "1.0.0")
        description = str(manifest_data.get("description") or "")
        author = str(manifest_data.get("author") or "Otix")
        repository = str(manifest_data.get("repository") or "")
        icon = str(manifest_data.get("icon") or "")
        stage = str(manifest_data.get("stage") or "stable")
        min_app_version = str(manifest_data.get("min_app_version") or "")
        permissions = list(manifest_data.get("permissions") or [])
        config_schema = manifest_data.get("config") or {}
        defaults = {
            k: v.get("default")
            for k, v in config_schema.items()
            if isinstance(v, dict) and "default" in v
        }

        manifest_data["name"] = display_name

        existing = Plugin.objects.filter(name=plugin_id).first()
        if existing is None:
            is_default_enabled = plugin_id in {"sabnzbd", "prowlarr", "fps-capture", "local-files"}
            plugin = Plugin.objects.create(
                name=plugin_id,
                version=version,
                description=description,
                author=author,
                repository=repository,
                icon=icon,
                stage=stage,
                min_app_version=min_app_version,
                system=False,
                enabled=is_default_enabled,
                error="",
                manifest=manifest_data,
                permissions_declared=permissions,
                permissions_granted=permissions,
                config=defaults,
                instances=[],
            )
            report.append(
                {
                    "id": plugin.name,
                    "ok": True,
                    "created": True,
                    "enabled": plugin.enabled,
                    "version": plugin.version,
                }
            )
        else:
            existing.version = version
            existing.description = description
            existing.author = author
            existing.repository = repository or existing.repository
            existing.icon = icon or existing.icon
            existing.stage = stage
            existing.manifest = manifest_data
            existing.permissions_declared = permissions
            existing.permissions_granted = _dedupe(
                list(existing.permissions_granted or []) + permissions
            )
            existing.save()
            report.append(
                {
                    "id": existing.name,
                    "ok": True,
                    "created": False,
                    "enabled": existing.enabled,
                    "version": existing.version,
                }
            )

    # Read the local marketplace registry for any remotely-hosted plugins
    # not yet installed as local folders.
    registry_file = repo_root / "extensions" / "registry.json"
    if registry_file.is_file():
        try:
            reg_data = json.loads(registry_file.read_text("utf-8"))
            for item in reg_data.get("plugins", []):
                p_id = item.get("id")
                if not p_id or p_id in seen_ids:
                    continue
                seen_ids.add(p_id)
                manifest_data = {
                    "name": item.get("name") or p_id,
                    "version": item.get("version") or "0.1.0",
                    "description": item.get("description") or "",
                    "author": item.get("author") or "Otix",
                    "repository": item.get("repository") or "",
                    "icon": item.get("icon") or "",
                    "permissions": item.get("permissions") or [],
                }
                if not Plugin.objects.filter(name=p_id).exists():
                    p = Plugin.objects.create(
                        name=p_id,
                        version=manifest_data["version"],
                        description=manifest_data["description"],
                        author=manifest_data["author"],
                        repository=manifest_data["repository"],
                        icon=manifest_data["icon"],
                        manifest=manifest_data,
                        permissions_declared=manifest_data["permissions"],
                        permissions_granted=manifest_data["permissions"],
                        config={},
                        instances=[],
                    )
                    report.append(
                        {
                            "id": p.name,
                            "ok": True,
                            "created": True,
                            "enabled": p.enabled,
                            "version": p.version,
                        }
                    )
        except Exception:
            pass

    return report

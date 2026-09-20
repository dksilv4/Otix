"""Persist non-account connections and fan them out to every claimed Otix node."""

from __future__ import annotations

import logging
from typing import Any, Callable

from apps.library.models import UserGameServer, UserNodeConnection

logger = logging.getLogger(__name__)

REDACTED = "***"
DROP_KEYS = {
    "apiKey",
    "useSsl",
    "urlBase",
    "configured",
    "has_api_key",
    "hasApiKey",
    "complete_dir",
    "completeDir",
    "local_complete_dir",
    "localCompleteDir",
    "folderLinked",
    "folderError",
    "linkedLibraryPath",
    "providerCompleteDir",
    "sabnzbdLibrary",
}
SECRET_KEYS = {"api_key", "apiKey"}

SaveFn = Callable[[UserGameServer, dict], tuple[int, dict | list]]


def get_or_create_connections(user) -> UserNodeConnection:
    row, _ = UserNodeConnection.objects.get_or_create(user=user)
    return row


def _is_secret_placeholder(value: Any) -> bool:
    if value is None:
        return True
    text = str(value).strip()
    return text in ("", REDACTED)


def _sanitize_mapping(value: Any) -> Any:
    if isinstance(value, list):
        return [_sanitize_mapping(item) for item in value]
    if not isinstance(value, dict):
        return value
    out: dict[str, Any] = {}
    for key, raw in value.items():
        if key in DROP_KEYS:
            continue
        if key in SECRET_KEYS and _is_secret_placeholder(raw):
            continue
        out[key] = _sanitize_mapping(raw)
    return out


def _deep_merge(base: dict | None, incoming: dict | None) -> dict:
    out = dict(base or {})
    for key, value in (incoming or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _mask_secrets(value: Any) -> Any:
    if isinstance(value, list):
        return [_mask_secrets(item) for item in value]
    if not isinstance(value, dict):
        return value
    out: dict[str, Any] = {}
    for key, raw in value.items():
        if key in SECRET_KEYS and raw and not _is_secret_placeholder(raw):
            out[key] = REDACTED
            out.setdefault("has_api_key", True)
            out.setdefault("hasApiKey", True)
            continue
        out[key] = _mask_secrets(raw)
    return out


def _section_configured(section: Any) -> bool:
    if not isinstance(section, dict):
        return False
    host = str(section.get("host") or "").strip()
    if not host:
        return False
    if section.get("configured") or section.get("has_api_key") or section.get("hasApiKey"):
        return True
    api_key = section.get("api_key") or section.get("apiKey")
    return bool(api_key) and not _is_secret_placeholder(api_key)


def _payload_configured(kind: str, payload: dict | None) -> bool:
    if not isinstance(payload, dict) or not payload:
        return False
    if kind == "usenet":
        return _section_configured(payload.get("sabnzbd")) or _section_configured(
            payload.get("prowlarr")
        )
    return _section_configured(payload) or bool(payload.get("instances"))


def _as_dict(payload: Any) -> dict:
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def store_connection(user, kind: str, payload: dict | None) -> dict:
    clean = _sanitize_mapping(_as_dict(payload))
    if not clean:
        row = get_or_create_connections(user)
        stored = getattr(row, kind) or {}
        return stored if isinstance(stored, dict) else {}
    row = get_or_create_connections(user)
    merged = _deep_merge(getattr(row, kind) if isinstance(getattr(row, kind), dict) else {}, clean)
    setattr(row, kind, merged)
    row.save(update_fields=[kind, "updated_at"])
    return merged


def stored_connection(user, kind: str) -> dict:
    user_id = getattr(user, "pk", None) or getattr(user, "id", None)
    if user_id is None:
        return {}
    try:
        row = UserNodeConnection.objects.get(user_id=user_id)
    except UserNodeConnection.DoesNotExist:
        return {}
    value = getattr(row, kind, None)
    return value if isinstance(value, dict) else {}


def user_servers(user) -> list[UserGameServer]:
    return list(UserGameServer.objects.filter(user=user).order_by("created_at", "id"))


def configured_map(user) -> dict[str, bool]:
    usenet = stored_connection(user, "usenet")
    return {
        "sabnzbd": _section_configured(usenet.get("sabnzbd")),
        "prowlarr": _section_configured(usenet.get("prowlarr")),
        "radarr": _payload_configured("radarr", stored_connection(user, "radarr")),
        "sonarr": _payload_configured("sonarr", stored_connection(user, "sonarr")),
    }


def has_shared_connections(user) -> bool:
    return any(configured_map(user).values())


def serialized_store(user) -> dict[str, Any]:
    return {
        "usenet": _mask_secrets(stored_connection(user, "usenet")),
        "radarr": _mask_secrets(stored_connection(user, "radarr")),
        "sonarr": _mask_secrets(stored_connection(user, "sonarr")),
        "configured": configured_map(user),
    }


def store_all(user, payload: dict | None) -> dict[str, Any]:
    data = _as_dict(payload)
    if "usenet" in data:
        store_connection(user, "usenet", data.get("usenet"))
    if "radarr" in data:
        store_connection(user, "radarr", data.get("radarr"))
    if "sonarr" in data:
        store_connection(user, "sonarr", data.get("sonarr"))
    return serialized_store(user)


def _kind_save_fns() -> tuple[tuple[str, SaveFn], ...]:
    from apps.library.services.game_server import (
        radarr_save_config,
        sonarr_save_config,
        usenet_save_config,
    )

    return (
        ("usenet", usenet_save_config),
        ("radarr", radarr_save_config),
        ("sonarr", sonarr_save_config),
    )


def push_shared_connections(server: UserGameServer) -> list[str]:
    """Write stored SABnzbd / *arr settings onto one node. Caller must opt in."""
    user = getattr(server, "user", None)
    if user is None:
        return []
    pushed: list[str] = []
    for kind, save_fn in _kind_save_fns():
        payload = stored_connection(user, kind)
        if not _payload_configured(kind, payload):
            continue
        try:
            status_code, _data = save_fn(server, payload)
            if 200 <= int(status_code) < 300:
                pushed.append(kind)
            else:
                logger.info(
                    "shared %s push to server %s returned %s",
                    kind,
                    server.id,
                    status_code,
                )
        except Exception:
            logger.warning(
                "failed to push shared %s connections to server %s",
                kind,
                server.id,
                exc_info=True,
            )
    return pushed


def push_shared_to_servers(user, server_ids: list[int] | None = None) -> list[dict[str, Any]]:
    servers = user_servers(user)
    if server_ids is not None:
        wanted = {int(item) for item in server_ids}
        servers = [server for server in servers if server.id in wanted]
    results: list[dict[str, Any]] = []
    for server in servers:
        kinds = push_shared_connections(server)
        results.append(
            {
                "server_id": server.id,
                "name": server.name,
                "ok": True,
                "kinds": kinds,
            }
        )
    return results


def overlay_connection_payload(kind: str, live: Any, shared: dict | None) -> Any:
    shared_payload = shared if isinstance(shared, dict) else {}
    if not shared_payload:
        return live
    if not isinstance(live, dict):
        return _mask_secrets(shared_payload)
    if kind == "usenet":
        merged = dict(live)
        for section in ("sabnzbd", "prowlarr"):
            live_section = live.get(section)
            shared_section = shared_payload.get(section)
            if not _section_configured(live_section) and _section_configured(shared_section):
                merged[section] = _mask_secrets(shared_section)
        return merged
    if _section_configured(live) or live.get("instances"):
        return live
    return _mask_secrets(shared_payload)


def save_store_and_node(
    user,
    kind: str,
    payload: dict | None,
    primary: UserGameServer | None,
    save_fn: SaveFn | None,
) -> tuple[int, dict | list]:
    """Write backend-node settings to Django, or worker settings to that Otix node."""
    from apps.library.services.backend_node import is_backend_node

    if primary is None or is_backend_node(primary) or save_fn is None:
        store_connection(user, kind, payload)
        if primary is None or save_fn is None:
            return 200, {"status": "ok", "stored": True}
        return save_fn(primary, _as_dict(payload))
    return save_fn(primary, _as_dict(payload))


def read_with_shared(
    user,
    kind: str,
    primary: UserGameServer,
    get_fn: Callable[[UserGameServer], tuple[int, dict | list]],
) -> tuple[int, dict | list]:
    """Read this node's config. Worker nodes stay local; the backend node uses the account store."""
    from apps.library.services.backend_node import is_backend_node

    if is_backend_node(primary):
        return get_fn(primary)
    return get_fn(primary)


INSTANCE_KINDS = ("usenet", "radarr", "sonarr")


def _has_real_secret(value: Any) -> bool:
    if isinstance(value, list):
        return any(_has_real_secret(item) for item in value)
    if not isinstance(value, dict):
        return False
    for key, raw in value.items():
        if key in SECRET_KEYS and raw and not _is_secret_placeholder(raw):
            return True
        if isinstance(raw, (dict, list)) and _has_real_secret(raw):
            return True
    return False


def _kind_io() -> tuple[tuple[str, Callable, SaveFn], ...]:
    from apps.library.services.game_server import (
        radarr_get_config,
        radarr_save_config,
        sonarr_get_config,
        sonarr_save_config,
        usenet_get_config,
        usenet_save_config,
    )

    return (
        ("usenet", usenet_get_config, usenet_save_config),
        ("radarr", radarr_get_config, radarr_save_config),
        ("sonarr", sonarr_get_config, sonarr_save_config),
    )


def import_instances(
    user,
    dest: UserGameServer,
    source: UserGameServer,
    kinds: list[str] | None = None,
) -> dict[str, Any]:
    """Copy SABnzbd / *arr instances from one node onto another. Keys never go to the client."""
    dest_id = int(getattr(dest, "id", 0) or 0)
    source_id = int(getattr(source, "id", 0) or 0)
    if dest_id == source_id:
        return {
            "ok": False,
            "error": "Pick a different node to import from.",
            "imported": [],
            "skipped": [],
            "errors": [],
            "from_server_id": source_id,
            "to_server_id": dest_id,
        }

    wanted = {item for item in (kinds or INSTANCE_KINDS) if item in INSTANCE_KINDS}
    imported: list[str] = []
    skipped: list[str] = []
    errors: list[dict[str, Any]] = []

    for kind, get_fn, save_fn in _kind_io():
        if kind not in wanted:
            continue
        try:
            status_code, data = get_fn(source, include_secrets=True)
        except TypeError:
            status_code, data = get_fn(source)
        except Exception as exc:
            errors.append({"kind": kind, "error": str(exc)})
            continue
        payload = data if isinstance(data, dict) else {}
        if int(status_code) >= 400:
            detail = payload.get("detail") or payload.get("error") or f"HTTP {status_code}"
            errors.append({"kind": kind, "error": str(detail)})
            continue
        if not _payload_configured(kind, payload):
            skipped.append(kind)
            continue
        if not _has_real_secret(payload):
            errors.append(
                {
                    "kind": kind,
                    "error": "Source node did not return API keys. Update otix-server on that machine.",
                }
            )
            continue
        try:
            save_status, save_data = save_store_and_node(user, kind, payload, dest, save_fn)
        except Exception as exc:
            errors.append({"kind": kind, "error": str(exc)})
            continue
        save_payload = save_data if isinstance(save_data, dict) else {}
        if int(save_status) >= 400:
            detail = save_payload.get("detail") or save_payload.get("error") or f"HTTP {save_status}"
            errors.append({"kind": kind, "error": str(detail)})
            continue
        imported.append(kind)

    return {
        "ok": bool(imported) and not errors,
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "from_server_id": source_id,
        "to_server_id": dest_id,
    }

"""Epic OAuth token vault and library fetch — owned by Django (backend-as-node)."""

from __future__ import annotations

import base64
import json
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

EPIC_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a"
EPIC_CLIENT_SECRET = "daafbccc737745039dffe53d94fc76cf"
EPIC_OAUTH_HOST = "account-public-service-prod03.ol.epicgames.com"
EPIC_LIBRARY_HOST = "library-service.live.use1a.on.epicgames.com"
EPIC_CATALOG_HOST = "catalog-public-service-prod06.ol.epicgames.com"
EPIC_UA = "UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit"
SKIP_PREFIXES = ("UE_", "QuixelBridge_", "MetaHumanSample_", "Lyra_", "FabPlugin_")

RequestFn = Callable[..., tuple[int, dict[str, Any]]]


class EpicAuthError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def parse_authorization_code(raw: str) -> str:
    stripped = raw.strip()
    if not stripped:
        raise EpicAuthError(400, "No authorization code provided")
    if stripped.startswith("{"):
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise EpicAuthError(400, "No authorization code provided") from exc
        code = payload.get("authorizationCode")
        if not code or not str(code).strip():
            raise EpicAuthError(400, "No authorization code provided")
        return str(code).strip()
    return stripped


def _basic_auth_header() -> str:
    token = base64.b64encode(f"{EPIC_CLIENT_ID}:{EPIC_CLIENT_SECRET}".encode()).decode()
    return f"basic {token}"


def _connection_row(user):
    from apps.library.services.node_connections import get_or_create_connections

    return get_or_create_connections(user)


def read_epic_secrets(user) -> dict | None:
    row = _connection_row(user)
    data = row.epic if isinstance(getattr(row, "epic", None), dict) else None
    if not data:
        # Backward-compatible nest under organize while migration lands.
        organize = row.organize if isinstance(row.organize, dict) else {}
        nested = organize.get("epic")
        data = nested if isinstance(nested, dict) else None
    if not isinstance(data, dict):
        return None
    if not data.get("refresh_token"):
        return None
    return data


def write_epic_secrets(user, *, account_id: str, display_name: str, refresh_token: str) -> None:
    row = _connection_row(user)
    payload = {
        "account_id": account_id,
        "display_name": display_name,
        "refresh_token": refresh_token,
    }
    if hasattr(row, "epic"):
        row.epic = payload
        row.save(update_fields=["epic", "updated_at"])
        return
    organize = dict(row.organize) if isinstance(row.organize, dict) else {}
    organize["epic"] = payload
    row.organize = organize
    row.save(update_fields=["organize", "updated_at"])


def clear_epic_secrets(user) -> None:
    row = _connection_row(user)
    update_fields = ["updated_at"]
    if hasattr(row, "epic"):
        row.epic = {}
        update_fields.append("epic")
    organize = dict(row.organize) if isinstance(row.organize, dict) else {}
    if "epic" in organize:
        organize.pop("epic", None)
        row.organize = organize
        update_fields.append("organize")
    row.save(update_fields=update_fields)


def exchange_code(code: str, request_fn: RequestFn | None = None) -> dict[str, Any]:
    do_request = request_fn or _http_request
    status, data = do_request(
        "POST",
        f"https://{EPIC_OAUTH_HOST}/account/api/oauth/token",
        headers={
            "Authorization": _basic_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": EPIC_UA,
        },
        data={"grant_type": "authorization_code", "code": code},
    )
    if status != 200:
        detail = data.get("errorMessage") or data.get("detail") or "Epic auth failed"
        raise EpicAuthError(400, detail)
    return data


def refresh_access_token(refresh_token: str, request_fn: RequestFn | None = None) -> dict[str, Any]:
    do_request = request_fn or _http_request
    status, data = do_request(
        "POST",
        f"https://{EPIC_OAUTH_HOST}/account/api/oauth/token",
        headers={
            "Authorization": _basic_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": EPIC_UA,
        },
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
    )
    if status != 200:
        detail = data.get("errorMessage") or data.get("detail") or "Epic refresh failed"
        raise EpicAuthError(400, detail)
    return data


def _http_request(method: str, url: str, **kwargs) -> tuple[int, dict[str, Any]]:
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.request(method, url, **kwargs)
            try:
                payload = resp.json()
            except Exception:
                payload = {"detail": resp.text}
            if not isinstance(payload, dict):
                payload = {"detail": str(payload)}
            return resp.status_code, payload
    except Exception as exc:
        return 502, {"detail": str(exc)}


def epic_status(user) -> dict[str, Any]:
    secrets = read_epic_secrets(user)
    if not secrets:
        return {"connected": False}
    return {
        "connected": True,
        "account_id": secrets.get("account_id") or "",
        "display_name": secrets.get("display_name") or "",
    }


def epic_auth(user, code: str) -> dict[str, Any]:
    parsed = parse_authorization_code(code)
    data = exchange_code(parsed)
    refresh = data.get("refresh_token") or ""
    if not refresh:
        raise EpicAuthError(400, "Epic did not return a refresh token")
    write_epic_secrets(
        user,
        account_id=str(data.get("account_id") or ""),
        display_name=str(data.get("displayName") or data.get("display_name") or ""),
        refresh_token=str(refresh),
    )
    return {
        "connected": True,
        "account_id": data.get("account_id") or "",
        "display_name": data.get("displayName") or data.get("display_name") or "",
    }


def epic_disconnect(user) -> dict[str, Any]:
    clear_epic_secrets(user)
    return {"connected": False}


def _fetch_library_items(access_token: str, request_fn: RequestFn) -> list[dict]:
    status, data = request_fn(
        "GET",
        f"https://{EPIC_LIBRARY_HOST}/library/api/public/items?includeMetadata=true",
        headers={"Authorization": f"bearer {access_token}", "User-Agent": EPIC_UA},
    )
    if status != 200:
        raise EpicAuthError(status, data.get("detail") or "Failed to fetch Epic library")
    records = data.get("records") if isinstance(data, dict) else None
    return records if isinstance(records, list) else []


def _catalog_title(
    namespace: str,
    catalog_item_id: str,
    access_token: str,
    request_fn: RequestFn,
) -> str:
    status, data = request_fn(
        "GET",
        f"https://{EPIC_CATALOG_HOST}/catalog/api/shared/namespace/{namespace}/bulk/items"
        f"?id={catalog_item_id}&includeDLCDetails=false&includeMainGameDetails=false&country=US&locale=en",
        headers={"Authorization": f"bearer {access_token}", "User-Agent": EPIC_UA},
    )
    if status != 200 or not isinstance(data, dict):
        return catalog_item_id
    items = data.get(namespace) or data.get("data") or []
    if isinstance(items, dict):
        item = items.get(catalog_item_id) or {}
        return str(item.get("title") or catalog_item_id)
    if isinstance(items, list) and items:
        return str(items[0].get("title") or catalog_item_id)
    return catalog_item_id


def epic_scan(user, request_fn: RequestFn | None = None) -> dict[str, Any]:
    do_request = request_fn or _http_request
    secrets = read_epic_secrets(user)
    if not secrets:
        raise EpicAuthError(400, "Epic is not connected")
    refreshed = refresh_access_token(str(secrets["refresh_token"]), do_request)
    access = refreshed.get("access_token")
    new_refresh = refreshed.get("refresh_token") or secrets["refresh_token"]
    write_epic_secrets(
        user,
        account_id=str(refreshed.get("account_id") or secrets.get("account_id") or ""),
        display_name=str(
            refreshed.get("displayName")
            or refreshed.get("display_name")
            or secrets.get("display_name")
            or ""
        ),
        refresh_token=str(new_refresh),
    )
    records = _fetch_library_items(str(access), do_request)
    games: list[dict[str, Any]] = []

    def build_game(record: dict) -> dict | None:
        if not isinstance(record, dict):
            return None
        app_name = str(record.get("appName") or record.get("app_name") or "").strip()
        if not app_name or app_name.startswith(SKIP_PREFIXES):
            return None
        namespace = str(record.get("namespace") or "")
        catalog_item_id = str(record.get("catalogItemId") or record.get("catalog_item_id") or "")
        offer_id = str(record.get("id") or record.get("offer_id") or "")
        title = str(record.get("title") or "")
        if not title and namespace and catalog_item_id:
            title = _catalog_title(namespace, catalog_item_id, str(access), do_request)
        return {
            "app_name": app_name,
            "namespace": namespace,
            "catalog_item_id": catalog_item_id,
            "offer_id": offer_id,
            "title": title or app_name,
        }

    with ThreadPoolExecutor(max_workers=8) as pool:
        for result in pool.map(build_game, records):
            if result:
                games.append(result)

    return {"games": games, "total": len(games)}

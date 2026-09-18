"""Epic Games OAuth token vault and library helpers."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any, Callable

import httpx

EPIC_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a"
EPIC_CLIENT_SECRET = "daafbccc737745039dffe53d94fc76cf"
EPIC_OAUTH_HOST = "account-public-service-prod03.ol.epicgames.com"
EPIC_LIBRARY_HOST = "library-service.live.use1a.on.epicgames.com"
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


def secrets_path(storage_dir: Path) -> Path:
    return storage_dir / "epic.json"


def read_secrets(storage_dir: Path) -> dict | None:
    path = secrets_path(storage_dir)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def write_secrets(
    storage_dir: Path,
    *,
    account_id: str,
    display_name: str,
    refresh_token: str,
) -> None:
    storage_dir.mkdir(parents=True, exist_ok=True)
    path = secrets_path(storage_dir)
    payload = {
        "account_id": account_id,
        "display_name": display_name,
        "refresh_token": refresh_token,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def delete_secrets(storage_dir: Path) -> None:
    path = secrets_path(storage_dir)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def status_payload(storage_dir: Path) -> dict:
    secrets = read_secrets(storage_dir)
    refresh_token = (secrets or {}).get("refresh_token")
    connected = isinstance(refresh_token, str) and bool(refresh_token.strip())
    if not connected:
        return {"connected": False, "account_id": None, "display_name": None}
    return {
        "connected": True,
        "account_id": secrets.get("account_id"),
        "display_name": secrets.get("display_name"),
    }


def _basic_auth_header() -> str:
    credentials = f"{EPIC_CLIENT_ID}:{EPIC_CLIENT_SECRET}".encode()
    return "Basic " + base64.b64encode(credentials).decode("ascii")


def _default_headers() -> dict[str, str]:
    return {
        "Authorization": _basic_auth_header(),
        "User-Agent": EPIC_UA,
    }


def _do_request(
    method: str,
    url: str,
    *,
    request: RequestFn | None = None,
    **kwargs: Any,
) -> tuple[int, dict[str, Any]]:
    if request is not None:
        return request(method, url, **kwargs)
    with httpx.Client() as client:
        response = client.request(method, url, **kwargs)
        try:
            body = response.json() if response.content else {}
        except json.JSONDecodeError:
            body = {}
        if not isinstance(body, dict):
            body = {}
        return response.status_code, body


def exchange_code(code: str, *, request: RequestFn | None = None) -> dict:
    url = f"https://{EPIC_OAUTH_HOST}/account/api/oauth/token"
    status, body = _do_request(
        "POST",
        url,
        request=request,
        headers=_default_headers(),
        data={
            "grant_type": "authorization_code",
            "code": code,
            "token_type": "eg1",
        },
    )
    if status != 200:
        raise EpicAuthError(400, "Code expired or invalid. Sign in again.")
    account_id = body.get("account_id")
    display_name = body.get("displayName") or body.get("display_name")
    refresh_token = body.get("refresh_token")
    if not account_id or not display_name or not refresh_token:
        raise EpicAuthError(400, "Code expired or invalid. Sign in again.")
    return {
        "account_id": str(account_id),
        "display_name": str(display_name),
        "refresh_token": str(refresh_token),
    }


def refresh_access(refresh_token: str, *, request: RequestFn | None = None) -> dict:
    url = f"https://{EPIC_OAUTH_HOST}/account/api/oauth/token"
    status, body = _do_request(
        "POST",
        url,
        request=request,
        headers=_default_headers(),
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "token_type": "eg1",
        },
    )
    error = body.get("error") or body.get("errorCode")
    if error in ("invalid_grant", "invalid_refresh_token"):
        raise EpicAuthError(400, "Reconnect Epic")
    if status != 200:
        raise EpicAuthError(400, "Reconnect Epic")
    access_token = body.get("access_token")
    new_refresh_token = body.get("refresh_token")
    if not access_token or not new_refresh_token:
        raise EpicAuthError(400, "Reconnect Epic")
    return {
        "access_token": str(access_token),
        "refresh_token": str(new_refresh_token),
    }


def fetch_library_items(access_token: str, *, request: RequestFn | None = None) -> list[dict]:
    items: list[dict] = []
    cursor: str | None = None
    while True:
        params: dict[str, str] = {"includeMetadata": "true"}
        if cursor:
            params["cursor"] = cursor
        url = f"https://{EPIC_LIBRARY_HOST}/library/api/public/items"
        status, body = _do_request(
            "GET",
            url,
            request=request,
            headers={
                "Authorization": f"bearer {access_token}",
                "User-Agent": EPIC_UA,
            },
            params=params,
        )
        if status != 200:
            raise EpicAuthError(500, "Failed to scan Epic library. Please try again.")
        records = body.get("records")
        if isinstance(records, list):
            items.extend(record for record in records if isinstance(record, dict))
        metadata = body.get("responseMetadata") or {}
        next_cursor = metadata.get("nextCursor") if isinstance(metadata, dict) else None
        if not next_cursor:
            break
        cursor = str(next_cursor)
    return items


def normalize_games(records: list[dict]) -> list[dict]:
    seen: set[str] = set()
    games: list[dict] = []
    for record in records:
        app_name = record.get("appName") or record.get("sandboxId") or record.get("id")
        if not app_name:
            continue
        app_name = str(app_name)
        if any(app_name.startswith(prefix) for prefix in SKIP_PREFIXES):
            continue
        if app_name in seen:
            continue
        seen.add(app_name)
        title = (
            record.get("sandboxName")
            or record.get("appTitle")
            or record.get("title")
            or app_name
        )
        games.append(
            {
                "app_name": app_name,
                "namespace": record.get("namespace"),
                "catalog_item_id": record.get("catalogItemId"),
                "offer_id": record.get("offerId"),
                "title": str(title),
            }
        )
    return games

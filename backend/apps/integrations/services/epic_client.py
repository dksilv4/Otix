"""Epic Games API client for OAuth token exchange, refresh, and library scanning.

Directly communicates with Epic Games public/internal services via HTTP:
- account-public-service-prod03.ol.epicgames.com (OAuth tokens)
- library-service.live.use1a.on.epicgames.com (User owned library items)
- catalog-public-service-prod06.ol.epicgames.com (Catalog items metadata)
"""

from __future__ import annotations

import base64
import json
import logging
from datetime import timedelta
from typing import Any
from urllib.parse import quote

import httpx
from django.utils import timezone

logger = logging.getLogger(__name__)

EPIC_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a"
EPIC_CLIENT_SECRET = "daafbccc737745039dffe53d94fc76cf"
EPIC_BASIC_AUTH = base64.b64encode(f"{EPIC_CLIENT_ID}:{EPIC_CLIENT_SECRET}".encode()).decode()

EPIC_OAUTH_HOST = "account-public-service-prod03.ol.epicgames.com"
EPIC_LIBRARY_HOST = "library-service.live.use1a.on.epicgames.com"
EPIC_CATALOG_HOST = "catalog-public-service-prod06.ol.epicgames.com"

EPIC_USER_AGENT = "UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit"

SKIP_PREFIXES = ("UE_", "QuixelBridge_", "MetaHumanSample_", "Lyra_", "FabPlugin_")


class EpicAuthError(Exception):
    """Raised when authentication with Epic Games fails."""


class EpicScanError(Exception):
    """Raised when library scanning fails."""


def clean_authorization_code(raw: str) -> str:
    """Extract raw code from string, JSON payload, or redirect URL."""
    trimmed = raw.strip()
    if not trimmed:
        raise EpicAuthError("No authorization code provided.")
    if trimmed.startswith("{"):
        try:
            parsed = json.loads(trimmed)
            if isinstance(parsed, dict) and parsed.get("authorizationCode"):
                return str(parsed["authorizationCode"]).strip()
        except Exception:
            pass
    return trimmed


def exchange_authorization_code(code: str) -> dict[str, Any]:
    """Exchange an authorization code for Epic access & refresh tokens."""
    cleaned_code = clean_authorization_code(code)
    url = f"https://{EPIC_OAUTH_HOST}/account/api/oauth/token"
    headers = {
        "Authorization": f"Basic {EPIC_BASIC_AUTH}",
        "User-Agent": EPIC_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "grant_type": "authorization_code",
        "code": cleaned_code,
        "token_type": "eg1",
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(url, headers=headers, data=data)
    except Exception as exc:
        logger.warning("Epic OAuth connection error: %s", exc)
        raise EpicAuthError("Failed to contact Epic authentication servers.") from exc

    if resp.status_code != 200:
        logger.info("Epic OAuth token exchange rejected: %s", resp.status_code)
        raise EpicAuthError("Authorization code is invalid or expired. Please sign in again.")

    try:
        payload = resp.json()
    except Exception as exc:
        raise EpicAuthError("Invalid response from Epic authentication server.") from exc

    account_id = payload.get("account_id")
    refresh_token = payload.get("refresh_token")
    access_token = payload.get("access_token")
    expires_in = payload.get("expires_in", 28800)
    display_name = payload.get("displayName") or payload.get("display_name") or ""

    if not account_id or not refresh_token:
        raise EpicAuthError("Missing account details from Epic authentication.")

    expires_at = timezone.now() + timedelta(seconds=int(expires_in))

    return {
        "account_id": account_id,
        "display_name": display_name,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
    }


def refresh_user_tokens(user) -> str:
    """Ensure user has a valid Epic access token; refresh if expired."""
    if not user.epic_refresh_token:
        raise EpicAuthError("No Epic account linked.")

    # If access token is valid for at least another 60 seconds, reuse it
    if (
        user.epic_access_token
        and user.epic_token_expires_at
        and user.epic_token_expires_at > timezone.now() + timedelta(seconds=60)
    ):
        return user.epic_access_token

    url = f"https://{EPIC_OAUTH_HOST}/account/api/oauth/token"
    headers = {
        "Authorization": f"Basic {EPIC_BASIC_AUTH}",
        "User-Agent": EPIC_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "grant_type": "refresh_token",
        "refresh_token": user.epic_refresh_token,
        "token_type": "eg1",
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(url, headers=headers, data=data)
    except Exception as exc:
        logger.warning("Epic token refresh connection error: %s", exc)
        raise EpicScanError("Failed to contact Epic authentication servers.") from exc

    if resp.status_code != 200:
        err_data = {}
        try:
            err_data = resp.json()
        except Exception:
            pass
        if (
            err_data.get("error") == "invalid_grant"
            or err_data.get("errorCode") == "invalid_refresh_token"
        ):
            # Session expired; clear refresh token
            user.epic_refresh_token = None
            user.epic_access_token = None
            user.epic_token_expires_at = None
            user.save(
                update_fields=["epic_refresh_token", "epic_access_token", "epic_token_expires_at"]
            )
            raise EpicAuthError("Epic session expired. Please reconnect your Epic Games account.")
        raise EpicScanError("Failed to refresh Epic session. Please try again.")

    try:
        payload = resp.json()
    except Exception as exc:
        raise EpicScanError("Invalid response from Epic token endpoint.") from exc

    new_access_token = payload.get("access_token")
    new_refresh_token = payload.get("refresh_token") or user.epic_refresh_token
    expires_in = payload.get("expires_in", 28800)

    user.epic_access_token = new_access_token
    user.epic_refresh_token = new_refresh_token
    user.epic_token_expires_at = timezone.now() + timedelta(seconds=int(expires_in))
    user.save(update_fields=["epic_access_token", "epic_refresh_token", "epic_token_expires_at"])

    return str(new_access_token)


def fetch_library_items(access_token: str) -> list[dict[str, Any]]:
    """Paginate and fetch all items from Epic's library-service."""
    items: list[dict[str, Any]] = []
    cursor = ""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "User-Agent": EPIC_USER_AGENT,
    }

    with httpx.Client(timeout=30.0) as client:
        while True:
            url = f"https://{EPIC_LIBRARY_HOST}/library/api/public/items?includeMetadata=true"
            if cursor:
                url += f"&cursor={quote(cursor)}"

            try:
                resp = client.get(url, headers=headers)
            except Exception as exc:
                logger.warning("Epic library fetch error: %s", exc)
                raise EpicScanError("Failed to fetch library items from Epic Games.") from exc

            if resp.status_code != 200:
                raise EpicScanError(f"Failed to fetch library items (HTTP {resp.status_code}).")

            try:
                data = resp.json()
            except Exception as exc:
                raise EpicScanError("Failed to parse Epic library response.") from exc

            records = data.get("records") or []
            items.extend(records)

            next_cursor = (data.get("responseMetadata") or {}).get("nextCursor")
            if not next_cursor:
                break
            cursor = next_cursor

    return items


def is_generic_title(title: str | None) -> bool:
    if not title:
        return True
    s = title.strip().lower()
    if s in ("", "live", "production", "staging", "test", "dev", "development"):
        return True
    if s.endswith(" production") or s.endswith(" staging"):
        return True
    return False


def enrich_catalog_titles(access_token: str, records: list[dict[str, Any]]) -> dict[str, str]:
    """Bulk fetch catalog titles for records that have generic or placeholder titles."""
    by_namespace: dict[str, list[str]] = {}
    for rec in records:
        app_name = rec.get("appName") or rec.get("sandboxId") or rec.get("id") or ""
        if any(app_name.startswith(p) for p in SKIP_PREFIXES):
            continue
        catalog_id = rec.get("catalogItemId")
        namespace = rec.get("namespace")
        if not catalog_id or not namespace:
            continue

        title = rec.get("appTitle") or rec.get("title") or rec.get("sandboxName") or ""
        if is_generic_title(title) or title == app_name:
            by_namespace.setdefault(namespace, []).append(str(catalog_id))

    if not by_namespace:
        return {}

    catalog_titles: dict[str, str] = {}
    headers = {
        "Authorization": f"Bearer {access_token}",
        "User-Agent": EPIC_USER_AGENT,
    }

    with httpx.Client(timeout=30.0) as client:
        for ns, ids in by_namespace.items():
            # Batch in chunks of 50
            for i in range(0, len(ids), 50):
                chunk = ids[i : i + 50]
                query_str = "&".join(f"id={quote(cid)}" for cid in chunk)
                url = f"https://{EPIC_CATALOG_HOST}/catalog/api/shared/namespace/{ns}/bulk/items?{query_str}&country=US&locale=en-US"
                try:
                    resp = client.get(url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        if isinstance(data, dict):
                            for cid, item in data.items():
                                if isinstance(item, dict) and item.get("title"):
                                    catalog_titles[cid] = item["title"]
                except Exception as exc:
                    logger.debug("Failed catalog title enrichment chunk: %s", exc)

    return catalog_titles


def scan_epic_cloud_library(user) -> list[dict[str, Any]]:
    """Execute complete cloud scan for a user and return list of normalized games."""
    access_token = refresh_user_tokens(user)
    records = fetch_library_items(access_token)
    catalog_titles = enrich_catalog_titles(access_token, records)

    seen: set[str] = set()
    games: list[dict[str, Any]] = []

    for rec in records:
        app_name = rec.get("appName") or rec.get("sandboxId") or rec.get("id") or ""
        if not app_name or any(app_name.startswith(p) for p in SKIP_PREFIXES):
            continue
        if app_name in seen:
            continue
        seen.add(app_name)

        catalog_id = rec.get("catalogItemId")
        title = ""
        app_title = rec.get("appTitle")
        rec_title = rec.get("title")
        sandbox_name = rec.get("sandboxName")

        if app_title and not is_generic_title(app_title):
            title = app_title
        elif rec_title and not is_generic_title(rec_title):
            title = rec_title
        elif catalog_id and catalog_titles.get(catalog_id):
            title = catalog_titles[catalog_id]
        elif sandbox_name and not is_generic_title(sandbox_name):
            title = sandbox_name
        elif sandbox_name:
            title = sandbox_name
        else:
            title = app_name

        games.append(
            {
                "app_name": app_name,
                "namespace": rec.get("namespace"),
                "catalog_item_id": catalog_id,
                "offer_id": rec.get("offerId"),
                "title": title,
            }
        )

    return games

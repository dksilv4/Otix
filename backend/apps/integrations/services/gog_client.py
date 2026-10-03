"""GOG API client for OAuth token exchange, refresh, and library scanning.

Directly communicates with GOG services via HTTP:
- auth.gog.com (OAuth tokens)
- embed.gog.com (User profile and owned games)
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
from django.utils import timezone

logger = logging.getLogger(__name__)

GOG_CLIENT_ID = "46899977096215655"
GOG_CLIENT_SECRET = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9"
GOG_REDIRECT_URI = "https://embed.gog.com/on_login_success?origin=client"
GOG_AUTH_HOST = "auth.gog.com"
GOG_EMBED_HOST = "embed.gog.com"
GOG_AUTH_URL = (
    f"https://{GOG_AUTH_HOST}/auth?client_id={GOG_CLIENT_ID}"
    f"&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient"
    f"&response_type=code&layout=client2"
)

GOG_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Otix/1.0"
)


class GOGAuthError(Exception):
    """Raised when authentication with GOG fails."""


class GOGScanError(Exception):
    """Raised when library scanning fails."""


def clean_authorization_code(raw: str) -> str:
    """Extract code from plain string, JSON, or redirect URL."""
    trimmed = raw.strip()
    if not trimmed:
        raise GOGAuthError("No authorization code provided.")
    if trimmed.startswith("http://") or trimmed.startswith("https://"):
        parsed = urlparse(trimmed)
        params = parse_qs(parsed.query)
        code_vals = params.get("code") or params.get("authorizationCode")
        if code_vals:
            return code_vals[0].strip()
    if trimmed.startswith("{"):
        try:
            payload = json.loads(trimmed)
            if isinstance(payload, dict):
                code = payload.get("code") or payload.get("authorizationCode")
                if code:
                    return str(code).strip()
        except Exception:
            pass
    return trimmed


def exchange_authorization_code(code: str) -> dict[str, Any]:
    """Exchange code for GOG access & refresh tokens."""
    cleaned_code = clean_authorization_code(code)
    url = f"https://{GOG_AUTH_HOST}/token"
    params = {
        "client_id": GOG_CLIENT_ID,
        "client_secret": GOG_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": cleaned_code,
        "redirect_uri": GOG_REDIRECT_URI,
    }
    headers = {
        "User-Agent": GOG_USER_AGENT,
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(url, params=params, headers=headers)
    except Exception as exc:
        logger.warning("GOG OAuth connection error: %s", exc)
        raise GOGAuthError("Failed to contact GOG authentication servers.") from exc

    if resp.status_code != 200:
        logger.info("GOG OAuth token exchange rejected: %s", resp.status_code)
        raise GOGAuthError("Authorization code is invalid or expired. Please sign in again.")

    try:
        payload = resp.json()
    except Exception as exc:
        raise GOGAuthError("Invalid response from GOG authentication server.") from exc

    refresh_token = payload.get("refresh_token")
    access_token = payload.get("access_token")
    expires_in = payload.get("expires_in", 3600)
    user_id = payload.get("user_id")

    if not refresh_token:
        raise GOGAuthError("Missing refresh token from GOG authentication.")

    # Fetch user details
    display_name = ""
    account_id = str(user_id) if user_id else ""
    try:
        with httpx.Client(timeout=15.0) as client:
            u_resp = client.get(
                f"https://{GOG_EMBED_HOST}/userData.json",
                headers={"Authorization": f"Bearer {access_token}", "User-Agent": GOG_USER_AGENT},
            )
            if u_resp.status_code == 200:
                u_data = u_resp.json()
                display_name = u_data.get("username") or ""
                if not account_id and u_data.get("userId"):
                    account_id = str(u_data.get("userId"))
    except Exception:
        logger.debug("Failed to retrieve GOG user profile details")

    if not account_id:
        account_id = display_name or "gog_user"

    expires_at = timezone.now() + timedelta(seconds=int(expires_in))

    return {
        "account_id": account_id,
        "display_name": display_name,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
    }


def refresh_user_tokens(user) -> str:
    """Refresh user tokens if expired or near expiration."""
    if not user.gog_refresh_token:
        raise GOGAuthError("User has no GOG credentials configured.")

    if (
        user.gog_access_token
        and user.gog_token_expires_at
        and user.gog_token_expires_at > timezone.now() + timedelta(seconds=60)
    ):
        return user.gog_access_token

    url = f"https://{GOG_AUTH_HOST}/token"
    params = {
        "client_id": GOG_CLIENT_ID,
        "client_secret": GOG_CLIENT_SECRET,
        "grant_type": "refresh_token",
        "refresh_token": user.gog_refresh_token,
    }
    headers = {
        "User-Agent": GOG_USER_AGENT,
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(url, params=params, headers=headers)
    except Exception as exc:
        raise GOGAuthError("Failed to refresh GOG token.") from exc

    if resp.status_code != 200:
        try:
            err_data = resp.json()
            if err_data.get("error") == "invalid_grant":
                user.gog_refresh_token = None
                user.gog_access_token = None
                user.gog_token_expires_at = None
                user.save(
                    update_fields=["gog_refresh_token", "gog_access_token", "gog_token_expires_at"]
                )
                raise GOGAuthError("GOG refresh token expired. Please reconnect.")
        except GOGAuthError:
            raise
        except Exception:
            pass
        raise GOGAuthError("Failed to refresh GOG token.")

    payload = resp.json()
    new_access_token = payload.get("access_token")
    new_refresh_token = payload.get("refresh_token") or user.gog_refresh_token
    expires_in = payload.get("expires_in", 3600)

    user.gog_access_token = new_access_token
    user.gog_refresh_token = new_refresh_token
    user.gog_token_expires_at = timezone.now() + timedelta(seconds=int(expires_in))
    user.save(update_fields=["gog_access_token", "gog_refresh_token", "gog_token_expires_at"])

    return new_access_token


def scan_gog_cloud_library(user) -> list[dict[str, Any]]:
    """Fetch user's owned games from GOG cloud API."""
    access_token = refresh_user_tokens(user)
    headers = {
        "Authorization": f"Bearer {access_token}",
        "User-Agent": GOG_USER_AGENT,
        "Accept": "application/json",
    }

    all_games: list[dict[str, Any]] = []
    seen: set[str] = set()
    page = 1

    with httpx.Client(timeout=30.0) as client:
        while True:
            url = f"https://{GOG_EMBED_HOST}/account/getFilteredProducts?mediaType=1&page={page}"
            try:
                resp = client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                raise GOGScanError(f"Failed to fetch GOG library page {page}.") from exc

            products = data.get("products", [])
            for prod in products:
                prod_id = str(prod.get("id") or "")
                title = prod.get("title") or ""
                if not prod_id or not title:
                    continue
                if prod_id in seen:
                    continue
                seen.add(prod_id)

                all_games.append(
                    {
                        "game_id": prod_id,
                        "title": title,
                        "slug": prod.get("slug"),
                        "image": prod.get("image"),
                    }
                )

            total_pages = data.get("totalPages", 1)
            if page >= total_pages:
                break
            page += 1

    return all_games

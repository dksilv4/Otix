"""IGDB API v4 client (sync, Twitch client-credentials auth).

Mirrors the legacy ``otix.providers.igdb.client`` subset the game matcher uses:
search / name-search / get-game / external_games cross-reference, authenticated
with a Twitch OAuth2 app token (``Client-ID`` + ``Bearer`` headers). Outbound
calls go through the module ``_request`` leaf (urllib) — the seam tests patch —
so nothing touches the network in tests. Deferred from legacy: Redis-backed
token + search caching, per-provider rate limiting, and the broader
game/cover/screenshot surface.

Token caching is in-process with a 60-day expiry (matching the legacy TTL):
a long-running server refetches at most once a day-per-process after expiry.
Tests prime the cache or patch ``_request`` to answer the oauth endpoint.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

from django.conf import settings

_API_BASE = "https://api.igdb.com/v4"
_OAUTH_URL = "https://id.twitch.tv/oauth2/token"
_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60  # 60 days (legacy Redis TTL)

# Field set the matcher searches/seeds with. Full-game hydration
# (``GAME_FIELDS``: summary/storyline/companies/screenshots/...) is deferred;
# seeded rows carry the search shape and are enriched by later platform work.
SEARCH_FIELDS = (
    "id,name,slug,cover.image_id,first_release_date,platforms.name"
)

# Module-level token cache: {token, expires_at (monotonic)}.
_token_cache: dict[str, float | None] = {"token": None, "expires_at": 0.0}


class IGDBNotConfigured(Exception):
    """IGDB credentials are unset; the matcher degrades to no IGDB phases."""


class IGDBAuthError(Exception):
    """Twitch token exchange failed."""


class IGDBError(Exception):
    """An IGDB API call failed (non-200 after one 401 retry)."""


def configured() -> bool:
    return bool(getattr(settings, "IGDB_CLIENT_ID", "")) and bool(
        getattr(settings, "IGDB_CLIENT_SECRET", "")
    )


def _request(
    method: str,
    url: str,
    *,
    data: bytes | None = None,
    headers: dict | None = None,
    timeout: float = 30.0,
) -> tuple[int, str]:
    """Return ``(status, body_text)``; raises ``urllib``/``OSError`` on failure."""
    request = urllib.request.Request(url, method=method, headers=headers or {}, data=data)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:  # provider answered with an error status
        return exc.code, exc.read().decode("utf-8", "replace")


def reset_token_cache() -> None:
    """Clear the in-process token (test hook + 401 retry path)."""
    _token_cache["token"] = None
    _token_cache["expires_at"] = 0.0


class IGDBProvider:
    """Small sync IGDB v4 client for the game matcher."""

    def __init__(self) -> None:
        if not configured():
            raise IGDBNotConfigured("IGDB not configured")

    # ── Auth ────────────────────────────────────────────────────────────

    def _get_token(self) -> str:
        cached = _token_cache.get("token")
        expires_at = _token_cache.get("expires_at") or 0.0
        if cached and time.monotonic() < expires_at:
            return str(cached)
        form = urllib.parse.urlencode(
            {
                "client_id": settings.IGDB_CLIENT_ID,
                "client_secret": settings.IGDB_CLIENT_SECRET,
                "grant_type": "client_credentials",
            }
        ).encode("utf-8")
        status, text = _request(
            "POST",
            _OAUTH_URL,
            data=form,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if status != 200:
            raise IGDBAuthError(f"Twitch OAuth failed: {status} {text[:200]}")
        token = json.loads(text).get("access_token")
        if not token:
            raise IGDBAuthError("No access_token in Twitch OAuth response")
        _token_cache["token"] = token
        _token_cache["expires_at"] = time.monotonic() + _TOKEN_TTL_SECONDS
        return token

    # ── API request helper (401 → clear token, retry once) ──────────────

    def _post(self, path: str, body: str) -> list[dict]:
        url = f"{_API_BASE}{path}"
        for _ in range(2):
            token = self._get_token()
            headers = {
                "Client-ID": settings.IGDB_CLIENT_ID,
                "Authorization": f"Bearer {token}",
                "Content-Type": "text/plain",
            }
            status, text = _request("POST", url, data=body.encode("utf-8"), headers=headers)
            if status == 401:
                reset_token_cache()
                continue  # refetch token and retry once
            if status != 200:
                raise IGDBError(f"IGDB {path} query failed: {status}")
            return json.loads(text)
        raise IGDBAuthError("IGDB rejected the access token twice")

    # ── Game endpoints (matcher subset) ─────────────────────────────────

    def get_games(self, ids: list[int], fields: str | None = None) -> list[dict]:
        if not ids:
            return []
        id_list = ",".join(str(i) for i in ids)
        body = f"fields {fields or '*'} ; where id = ({id_list}) ; limit {len(ids)} ;"
        return self._post("/games", body)

    def get_game(self, igdb_id: int, fields: str | None = None) -> dict | None:
        results = self.get_games([igdb_id], fields)
        return results[0] if results else None

    def search_games(self, query: str, limit: int = 20, fields: str | None = None) -> list[dict]:
        escaped = query.replace('"', '\\"')
        body = f'search "{escaped}" ; fields {fields or "*"} ; limit {limit} ;'
        return self._post("/games", body)

    def search_games_by_name(
        self, query: str, limit: int = 20, fields: str | None = None
    ) -> list[dict]:
        escaped = query.replace("\\", "\\\\").replace('"', '\\"')
        body = f'fields {fields or "*"} ; where name ~ *"{escaped}"* ; limit {limit} ;'
        return self._post("/games", body)

    def lookup_external_game_ids(self, category: int, external_ids: list[str]) -> dict[str, int]:
        """Map external IDs to IGDB game ids via ``external_games``.

        IGDB ``external_game_source`` categories: 1 = Steam, 26 = Epic, etc.
        """
        if not external_ids:
            return {}
        uid_list = ",".join(f'"{eid}"' for eid in external_ids)
        body = (
            f"fields uid,game ; where external_game_source = {category} "
            f"& uid = ({uid_list}) ; limit {len(external_ids)} ;"
        )
        mapping: dict[str, int] = {}
        for row in self._post("/external_games", body):
            uid, game = row.get("uid"), row.get("game")
            if isinstance(uid, str) and isinstance(game, int):
                mapping[uid] = game
        return mapping

    def lookup_steam_app_ids(self, app_ids: list[int]) -> dict[int, int]:
        str_ids = [str(aid) for aid in app_ids]
        return {int(k): v for k, v in self.lookup_external_game_ids(1, str_ids).items()}

    def lookup_epic_ids(self, epic_ids: list[str]) -> dict[str, int]:
        return self.lookup_external_game_ids(26, epic_ids)


# ── IGDB payload helpers ──────────────────────────────────────────────────


def cover_url(cover) -> str | None:
    """Build the t_1080p IGDB cover URL from a cover dict or bare image_id."""
    if isinstance(cover, dict):
        image_id = cover.get("image_id")
    elif isinstance(cover, str):
        image_id = cover
    else:
        return None
    if not image_id:
        return None
    return f"https://images.igdb.com/igdb/image/upload/t_1080p/{image_id}.jpg"


_PLATFORM_NORMALIZATION = {
    "PC (Microsoft Windows)": "windows",
    "Mac": "macos",
    "Linux": "linux",
    "Windows": "windows",
    "MacOS": "macos",
    "PlayStation 5": "playstation-5",
    "PlayStation 4": "playstation-4",
    "Xbox Series X|S": "xbox-series-x-s",
    "Xbox One": "xbox-one",
    "Nintendo Switch": "nintendo-switch",
    "Android": "android",
    "iOS": "ios",
    "Web browser": "web",
    "VR": "vr",
    "Stadia": "stadia",
}


def platform_slugs(raw: list | None) -> list[str]:
    """Normalize an IGDB ``platforms`` list into Otix platform slugs."""
    out: list[str] = []
    for entry in raw or []:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name", "")
        if isinstance(name, str) and name:
            slug = _PLATFORM_NORMALIZATION.get(name, name.lower())
            if slug not in out:
                out.append(slug)
    return out


def release_year_from_ts(ts) -> int | None:
    """Extract a release year from an IGDB unix-seconds first_release_date."""
    if isinstance(ts, (int, float)):
        try:
            return date.fromtimestamp(float(ts)).year
        except (ValueError, OSError):
            return None
    return None

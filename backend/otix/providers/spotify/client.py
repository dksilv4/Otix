"""Spotify Web API client.

Server-to-server: OAuth2 client-credentials grant, token cached in Redis (~55 min).
User: OAuth2 authorization-code grant, refresh-token rotation handled at auth layer.

Docs: https://developer.spotify.com/documentation/web-api
"""

from __future__ import annotations

import asyncio
from base64 import b64encode

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider, ProviderError

TOKEN_KEY = "spotify:client_token"
TOKEN_TTL = 3300  # 55 min — refresh before 60-min expiry
ACCOUNTS_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"


_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    global _shared_client, _shared_client_loop_id
    try:
        current_loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        current_loop_id = None

    if _shared_client is not None and _shared_client_loop_id != current_loop_id:
        _shared_client = None

    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url=API_BASE,
            timeout=settings.spotify_request_timeout_seconds,
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class SpotifyProvider(BaseProvider):
    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        self._redis = redis
        client = http_client or get_http_client()
        super().__init__(
            name="spotify",
            redis=redis,
            http_client=client,
            rate=settings.spotify_global_rps_limit,
            burst=settings.spotify_global_rps_limit,
        )

    # ── Auth ─────────────────────────────────────────────────────────────

    async def _ensure_token(self) -> str:
        cached = await self._redis.get(TOKEN_KEY)
        if cached:
            return cached.decode() if isinstance(cached, bytes) else cached

        auth = b64encode(f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode()).decode()
        resp = await self.http.request(
            "POST",
            ACCOUNTS_URL,
            data={"grant_type": "client_credentials"},
            headers={"Authorization": f"Basic {auth}"},
        )
        if resp.status_code != 200:
            raise ProviderError(f"Spotify token request failed: {resp.status_code}")
        token = resp.json()["access_token"]
        await self._redis.setex(TOKEN_KEY, TOKEN_TTL, token)
        return token

    async def _auth_headers(self) -> dict:
        token = await self._ensure_token()
        return {"Authorization": f"Bearer {token}"}

    async def _get(self, path: str, params: dict | None = None) -> dict:
        resp = await self._request("GET", f"/{path.lstrip('/')}", params=params, headers=await self._auth_headers())
        if resp.status_code >= 400:
            raise ProviderError(f"Spotify API returned {resp.status_code} for {path}")
        return resp.json()

    # ── Catalog ──────────────────────────────────────────────────────────

    async def get_album(self, spotify_id: str) -> dict:
        return await self._get(f"albums/{spotify_id}")

    async def get_album_tracks(self, spotify_id: str, limit: int = 50, offset: int = 0) -> dict:
        return await self._get(f"albums/{spotify_id}/tracks", {"limit": limit, "offset": offset})

    async def get_artist(self, spotify_id: str) -> dict:
        return await self._get(f"artists/{spotify_id}")

    async def get_artist_albums(
        self,
        spotify_id: str,
        include_groups: str = "album,single,compilation",
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        return await self._get(
            f"artists/{spotify_id}/albums",
            {"include_groups": include_groups, "limit": limit, "offset": offset},
        )

    async def get_related_artists(self, spotify_id: str) -> list[dict]:
        resp = await self._get(f"artists/{spotify_id}/related-artists")
        return resp.get("artists", []) or []

    async def get_track(self, spotify_id: str) -> dict:
        return await self._get(f"tracks/{spotify_id}")

    async def get_audio_features(self, track_id: str) -> dict:
        return await self._get(f"audio-features/{track_id}")

    async def get_audio_features_batch(self, track_ids: list[str]) -> list[dict]:
        resp = await self._get("audio-features", {"ids": ",".join(track_ids)})
        return resp.get("audio_features", []) or []

    async def search(self, query: str, search_type: str = "album", limit: int = 20) -> list[dict]:
        resp = await self._get("search", {
            "q": query,
            "type": search_type,
            "limit": limit,
        })
        key = f"{search_type}s" if not search_type.endswith("s") else search_type
        return resp.get(key, {}).get("items", [])

    async def get_new_releases(self, limit: int = 50) -> list[dict]:
        resp = await self._get("browse/new-releases", {"limit": limit})
        return resp.get("albums", {}).get("items", [])

    # ── User-scoped methods (require user access token) ───────────────────

    async def _user_request(self, access_token: str, path: str, params: dict | None = None) -> dict:
        resp = await self._request(
            "GET", f"/{path.lstrip('/')}",
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code >= 400:
            raise ProviderError(f"Spotify API returned {resp.status_code} for {path}")
        return resp.json()

    async def get_user_profile(self, access_token: str) -> dict:
        return await self._user_request(access_token, "me")

    async def get_user_saved_albums(self, access_token: str, limit: int = 50, offset: int = 0) -> dict:
        return await self._user_request(access_token, "me/albums", {"limit": limit, "offset": offset})

    async def get_user_saved_tracks(self, access_token: str, limit: int = 50, offset: int = 0) -> dict:
        """List liked/saved tracks. Returns: {href, items: [{added_at, track}], ...}"""
        return await self._user_request(access_token, "me/tracks", {"limit": limit, "offset": offset})

    async def get_user_recently_played(
        self, access_token: str, limit: int = 50, after: int | None = None
    ) -> dict:
        """Get the last played tracks for the current user.

        Returns: {items: [{track: TrackObject, played_at: ISO8601, context: ...}], ...}
        ``after`` is a Unix timestamp in milliseconds.
        """
        params: dict[str, int] = {"limit": limit}
        if after is not None:
            params["after"] = after
        return await self._user_request(access_token, "me/player/recently-played", params)

    async def save_user_tracks(self, access_token: str, track_ids: list[str]) -> None:
        """Add tracks to the user's Spotify liked songs."""
        resp = await self._request(
            "PUT",
            "/me/tracks",
            json={"ids": track_ids},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code >= 400:
            raise ProviderError(f"Spotify save tracks failed: {resp.status_code}")



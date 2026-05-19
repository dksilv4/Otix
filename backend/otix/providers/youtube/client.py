"""YouTube Data API v3 client.

User-scoped: all calls use the user's Google access token.
Rate limits: 10,000 units/day quota, playlistItems.list=1, videos.list=1.

Docs: https://developers.google.com/youtube/v3/docs
"""

from __future__ import annotations

import structlog

import httpx

from otix.providers.base import ProviderError

logger = structlog.get_logger()

API_BASE = "https://www.googleapis.com/youtube/v3"

# playlistId=HL is each user's watch history playlist
WATCH_HISTORY_PLAYLIST = "HL"

PAGE_SIZE = 50


class YouTubeClient:
    """Thin async wrapper around the YouTube Data API v3."""

    def __init__(self, access_token: str):
        self._token = access_token

    async def _get(self, path: str, params: dict | None = None, *, debug: bool = False) -> dict:
        url = f"{API_BASE}/{path.lstrip('/')}"
        headers = {"Authorization": f"Bearer {self._token}"}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params, headers=headers)
            if debug:
                logger.info("youtube_api_debug", path=path, params=params, status=resp.status_code, body=resp.text[:2000])
            if resp.status_code >= 400:
                error_text = resp.text
                try:
                    error_data = resp.json()
                    error_msg = error_data.get("error", {}).get("message", error_text)
                except Exception:
                    error_msg = error_text

                if "insufficient authentication scopes" in error_msg.lower():
                    raise ProviderError(
                        "Your Google account needs to be re-linked to access YouTube. "
                        "Please unlink then re-link your Google account in Settings to grant the YouTube permission."
                    )
                raise ProviderError(f"YouTube API returned {resp.status_code} for {path}: {error_msg}")
            return resp.json()

    async def get_watch_history(self, page_token: str | None = None) -> dict:
        """Fetch one page of the user's watch history.

        Returns: {items: [{snippet: {..., resourceId: {videoId}}}, ...], nextPageToken, ...}
        """
        params: dict = {
            "playlistId": WATCH_HISTORY_PLAYLIST,
            "part": "snippet",
            "maxResults": PAGE_SIZE,
        }
        if page_token:
            params["pageToken"] = page_token
        return await self._get("playlistItems", params)

    async def get_watch_later(self, page_token: str | None = None) -> dict:
        """Fetch one page of the user's Watch Later playlist (WL). Useful for diagnostics."""
        params: dict = {
            "playlistId": "WL",
            "part": "snippet",
            "maxResults": PAGE_SIZE,
        }
        if page_token:
            params["pageToken"] = page_token
        return await self._get("playlistItems", params)

    async def get_videos(self, video_ids: list[str]) -> dict:
        """Fetch metadata for up to 50 videos.

        Returns: {items: [{id, snippet: {title, channelTitle, categoryId, ...},
                            topicDetails: {topicCategories: [...]}}, ...]}
        """
        params: dict = {
            "id": ",".join(video_ids),
            "part": "snippet,topicDetails",
            "maxResults": PAGE_SIZE,
        }
        return await self._get("videos", params)

    async def get_channel(self, channel_id: str) -> dict:
        """Fetch channel metadata including verification status.

        Returns: {items: [{id, snippet: {title, ...}, status: {isLinked: ...}}]}

        Pass channel_id="mine" to get the authenticated user's channel.
        """
        params: dict = {"part": "snippet,status"}
        if channel_id == "mine":
            params["mine"] = "true"
        else:
            params["id"] = channel_id
        return await self._get("channels", params)

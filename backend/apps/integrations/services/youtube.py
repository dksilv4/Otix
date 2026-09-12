"""YouTube Data API v3 client (sync urllib leaf).

Port of ``backend/otix/providers/youtube/client.py``. User-scoped calls carry the
user's Google access token; the module-level ``_request`` leaf (patched in tests)
returns ``(status, text)`` so the sync engine can page ``videos.list`` without an
HTTP stack. A non-2xx page that names the "insufficient authentication scopes"
problem raises :class:`YouTubeScopeError` (a re-link is the only remedy); other
non-2xx pages raise :class:`YouTubeError`; network failures propagate as
``urllib.error.URLError``/``TimeoutError``. Either way the sync engine aborts.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

API_BASE = "https://www.googleapis.com/youtube/v3"

_RELINK_MESSAGE = (
    "Your Google account needs to be re-linked to access YouTube. "
    "Please unlink then re-link your Google account in Settings to grant the "
    "YouTube permission."
)


class YouTubeError(Exception):
    """Base for failures the sync engine surfaces to the caller."""


class YouTubeScopeError(YouTubeError):
    """The user's token no longer carries the YouTube scope (re-link needed)."""


def _request(url: str, *, headers: dict | None = None, timeout: float = 30.0):
    """Raw urllib leaf: return ``(status, text)``; URLError/Timeout propagate."""
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")


def _error_for(status: int, path: str, text: str) -> YouTubeError:
    try:
        body = json.loads(text)
        message = (body.get("error") or {}).get("message", text)
    except ValueError:
        message = text
    if "insufficient authentication scopes" in message.lower():
        return YouTubeScopeError(_RELINK_MESSAGE)
    return YouTubeError(f"YouTube API returned {status} for {path}: {message}")


class YouTubeClient:
    """Thin synchronous wrapper around the YouTube Data API v3."""

    def __init__(self, access_token: str) -> None:
        self._token = access_token

    def _get(self, path: str, params: dict | None = None) -> dict:
        """GET *path* with query *params*; return the parsed JSON body."""
        url = f"{API_BASE}/{path.lstrip('/')}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        status, text = _request(
            url, headers={"Authorization": f"Bearer {self._token}"}
        )
        if status >= 400:
            raise _error_for(status, path, text)
        return json.loads(text) if text else {}

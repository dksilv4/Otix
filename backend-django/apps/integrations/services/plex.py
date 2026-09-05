"""Plex integration service — read/playback surface.

Mirrors the read + best-effort-live portion of the legacy ``plex_sync_service``
(per-item connect info, album tracks, library listing) over the user's stored
``UserPlexServer`` / ``UserPlexLibrary`` / ``UserPlexItem`` rows, fetching live
media from the user's Plex server over its base/alternative URLs. Sync, live
sessions, the webhook and SSE surfaces are deferred to the platform wave
(task #6).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from django.conf import settings
from django.db.models import (
    Count,
    DateTimeField,
    IntegerField,
    OuterRef,
    Subquery,
    Value,
)
from django.db.models.functions import Coalesce

from apps.integrations.models import UserPlexItem, UserPlexLibrary, UserPlexServer

CONNECT_INFO_ITEM_NOT_FOUND = "Media item not found in your Plex library"
CONNECT_INFO_SERVER_NOT_FOUND = "Plex server not found"
ALBUM_TRACKS_FETCH_ERROR = "Could not fetch Plex album tracks"


class PlexConnectInfoNotFound(Exception):
    """Raised when a Plex lookup cannot be satisfied; carries the legacy 404
    detail string."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class PlexAlbumTracksFetchError(Exception):
    """Raised when no Plex connection succeeds in serving the album's tracks."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def _plex_tv_base() -> str:
    return (getattr(settings, "PLEX_TV_BASE", "") or "https://plex.tv").rstrip("/")


def _plex_headers() -> dict[str, str]:
    """Common Plex.tv headers: the resources API identifies the calling client."""
    return {
        "Accept": "application/json",
        "X-Plex-Client-Identifier": getattr(settings, "PLEX_CLIENT_IDENTIFIER", "otix-web"),
        "X-Plex-Product": getattr(settings, "PLEX_PRODUCT", "Otix"),
        "X-Plex-Version": getattr(settings, "PLEX_VERSION", "0.1.0"),
    }


def _as_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _connections(resource: dict) -> list[dict]:
    return _as_list(resource.get("connections") or resource.get("Connection"))


def _with_token(url: str, token: str) -> str:
    """Embed ``token`` into ``url`` as an ``X-Plex-Token`` query param.

    Some Plex server / relay configurations only accept the token as a query
    parameter, not as a header (legacy ``_get_json`` behaviour).
    """
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qs(parsed.query)
    query["X-Plex-Token"] = [token]
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query, doseq=True)))


def _get_alternative_plex_urls(server: UserPlexServer, user) -> list[str]:
    """Return alternative base URLs for a server from plex.tv resources.

    Best-effort: any failure (no linked token, network, parse) yields ``[]`` so
    callers fall back to the stored ``base_url`` — mirrors the legacy helper.
    """
    if not user.plex_auth_token:
        return []

    resources_url = f"{_plex_tv_base()}/api/v2/resources?includeHttps=1&includeRelay=1"
    url = _with_token(resources_url, user.plex_auth_token)
    try:
        status, raw = _request(url, headers=_plex_headers())
        if status != 200:
            return []
        data = json.loads(raw)
    except Exception:
        return []

    machine_id = server.machine_identifier
    for resource in _as_list(data):
        client_id = str(
            resource.get("clientIdentifier") or resource.get("machineIdentifier") or ""
        )
        if client_id != machine_id:
            continue
        urls: list[str] = []
        for conn in _connections(resource):
            uri = conn.get("uri")
            if uri and str(uri).rstrip("/") not in urls:
                urls.append(str(uri).rstrip("/"))
        return urls
    return []


def _request(
    url: str,
    *,
    method: str = "GET",
    headers: dict | None = None,
    timeout: float = 15.0,
) -> tuple[int, str]:
    """Return ``(status, body_text)``; raises ``urllib``/``OSError`` on network
    failure (callers here swallow them). Plex tokens travel as a query param in
    ``url`` — see the legacy ``_get_json``."""

    request = urllib.request.Request(url, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:  # provider answered with an error status
        return exc.code, exc.read().decode("utf-8", "replace")


def get_plex_connect_info(user, media_item_id: int) -> dict:
    """Return Plex connect details for the user's copy of a catalog media item.

    Mirrors the legacy response: ``{base_url, base_urls, token, rating_key,
    album_thumb_url}`` where ``base_urls`` is the stored server URL plus any
    alt URLs discovered on plex.tv, and ``album_thumb_url`` is only produced
    when a base URL, a token and a rating key are all present.
    """
    plex_item = (
        UserPlexItem.objects.filter(user=user, media_item_id=media_item_id)
        .select_related("server")
        .first()
    )
    if plex_item is None:
        raise PlexConnectInfoNotFound(CONNECT_INFO_ITEM_NOT_FOUND)
    server = plex_item.server
    if server is None:
        raise PlexConnectInfoNotFound(CONNECT_INFO_SERVER_NOT_FOUND)

    alt_urls = _get_alternative_plex_urls(server, user)
    base_urls = [server.base_url] if server.base_url else []
    for url in alt_urls:
        if url not in base_urls:
            base_urls.append(url)

    token = server.access_token or user.plex_auth_token
    album_thumb_url = None
    if base_urls and token and plex_item.rating_key:
        album_thumb_url = (
            f"{base_urls[0]}/library/metadata/{plex_item.rating_key}/thumb"
            f"?X-Plex-Token={token}"
        )
    return {
        "base_url": base_urls[0] if base_urls else None,
        "base_urls": base_urls,
        "token": token,
        "rating_key": plex_item.rating_key,
        "album_thumb_url": album_thumb_url,
    }


def list_plex_libraries(user) -> list[dict]:
    """Return the user's Plex libraries with item counts + last-synced stamps.

    Each library joins its server for the display name; ``item_count`` is the
    number of scanned ``UserPlexItem`` rows in the library (0 when none) and
    ``last_synced_at`` the newest item ``updated_at`` (or None).
    """
    item_count_subq = (
        UserPlexItem.objects.filter(user=user, library_id=OuterRef("pk"))
        .values("library_id")
        .annotate(item_count=Count("id"))
        .values("item_count")
    )
    last_synced_subq = (
        UserPlexItem.objects.filter(user=user, library_id=OuterRef("pk"))
        .order_by("-updated_at")
        .values("updated_at")[:1]
    )
    libraries = (
        UserPlexLibrary.objects.filter(user=user)
        .select_related("server")
        .annotate(
            item_count=Coalesce(
                Subquery(item_count_subq, output_field=IntegerField()), Value(0)
            ),
            last_synced_at=Subquery(last_synced_subq, output_field=DateTimeField()),
        )
        .order_by("server__name", "title")
    )
    return [
        {
            "id": lib.id,
            "server_id": lib.server_id,
            "server_name": lib.server.name,
            "section_key": lib.section_key,
            "title": lib.title,
            "library_type": lib.library_type,
            "selected": lib.selected,
            "item_count": lib.item_count,
            "last_synced_at": lib.last_synced_at.isoformat()
            if lib.last_synced_at
            else None,
        }
        for lib in libraries
    ]


def _container_items(data: dict) -> list[dict]:
    container = data.get("MediaContainer", data)
    return _as_list(container.get("Metadata") or container.get("Directory"))


def _plex_server_get(server: UserPlexServer, user, path: str) -> tuple[dict, str] | None:
    """GET a Plex server path, trying alternative base URLs on failure.

    Returns ``(data, working_base_url)`` from the first base URL that answers
    200, or ``None`` when no connection (or no token) works.
    """
    token = server.access_token or user.plex_auth_token
    if not token:
        return None

    base_urls = [server.base_url] if server.base_url else []
    for url in _get_alternative_plex_urls(server, user):
        if url not in base_urls:
            base_urls.append(url)

    for base_url in base_urls:
        try:
            status, raw = _request(
                _with_token(f"{base_url}{path}", token),
                headers=_plex_headers(),
                timeout=8.0,
            )
            if status != 200:
                continue
            return json.loads(raw), base_url
        except Exception:
            continue
    return None


def get_plex_album_tracks(user, media_item_id: int) -> dict:
    """Return the user's Plex album tracks for a catalog music media item.

    Mirrors the legacy response: ``{tracks, base_url, token, rating_key,
    album_thumb_url}`` where each track carries ``{rating_key, title, artist,
    track_number, disc_number, duration_ms}``. Raises ``PlexConnectInfoNotFound``
    when the user has no such item/server and ``PlexAlbumTracksFetchError`` when
    every Plex connection fails.
    """
    plex_item = (
        UserPlexItem.objects.filter(user=user, media_item_id=media_item_id)
        .select_related("server")
        .first()
    )
    if plex_item is None:
        raise PlexConnectInfoNotFound(CONNECT_INFO_ITEM_NOT_FOUND)
    server = plex_item.server
    if server is None:
        raise PlexConnectInfoNotFound(CONNECT_INFO_SERVER_NOT_FOUND)

    result = _plex_server_get(
        server, user, f"/library/metadata/{plex_item.rating_key}/children"
    )
    if result is None:
        raise PlexAlbumTracksFetchError(ALBUM_TRACKS_FETCH_ERROR)
    data, working_base_url = result

    token = server.access_token or user.plex_auth_token
    album_thumb_url = None
    if working_base_url and token and plex_item.rating_key:
        album_thumb_url = (
            f"{working_base_url}/library/metadata/{plex_item.rating_key}/thumb"
            f"?X-Plex-Token={token}"
        )

    tracks = [
        {
            "rating_key": str(item.get("ratingKey", "")),
            "title": item.get("title", ""),
            "artist": item.get("grandparentTitle", "") or item.get("originalTitle", ""),
            "track_number": item.get("index", 0),
            "disc_number": item.get("parentIndex", 1),
            "duration_ms": item.get("duration"),
        }
        for item in _container_items(data)
    ]
    return {
        "tracks": tracks,
        "base_url": working_base_url,
        "token": token,
        "rating_key": plex_item.rating_key,
        "album_thumb_url": album_thumb_url,
    }

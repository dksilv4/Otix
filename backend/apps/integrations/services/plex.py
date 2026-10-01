"""Plex integration service — read/playback surface.

Mirrors the read + best-effort-live portion of the legacy ``plex_sync_service``
(per-item connect info, album tracks, library listing) over the user's stored
``UserPlexServer`` / ``UserPlexLibrary`` / ``UserPlexItem`` rows, fetching live
media from the user's Plex server over its base/alternative URLs — plus live
sessions, the inbound webhook, and plex.tv server/library discovery. Library
sync + SSE surfaces are deferred to the platform wave (task #6).
"""

from __future__ import annotations

import json
import logging
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

logger = logging.getLogger(__name__)

CONNECT_INFO_ITEM_NOT_FOUND = "Media item not found in your Plex library"
CONNECT_INFO_SERVER_NOT_FOUND = "Plex server not found"


class PlexConnectInfoNotFound(Exception):
    """Raised when a Plex lookup cannot be satisfied; carries the legacy 404
    detail string."""

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
        client_id = str(resource.get("clientIdentifier") or resource.get("machineIdentifier") or "")
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
            f"{base_urls[0]}/library/metadata/{plex_item.rating_key}/thumb?X-Plex-Token={token}"
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
            item_count=Coalesce(Subquery(item_count_subq, output_field=IntegerField()), Value(0)),
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
            "last_synced_at": lib.last_synced_at.isoformat() if lib.last_synced_at else None,
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


def _to_int(value: Any) -> int | None:
    """Coerce a Plex integer field (may arrive as a string) to ``int``/``None``."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def get_plex_sessions(user) -> list[dict]:
    """Return active playback sessions across the user's selected Plex servers.

    Each selected server with a stored ``base_url``/``access_token`` is asked
    for ``/status/sessions``; servers that error or answer non-200 are skipped.
    Only ``movie``/``episode``/``track`` items are reported (legacy parity), and
    relative thumbnails are made absolute against the serving server + token.
    """
    if not user.plex_auth_token:
        return []

    servers = UserPlexServer.objects.filter(user=user, selected=True, owned=True)
    all_sessions: list[dict] = []
    for server in servers:
        if not server.base_url or not server.access_token:
            continue
        try:
            status, raw = _request(
                _with_token(f"{server.base_url}/status/sessions", server.access_token),
                headers=_plex_headers(),
                timeout=30.0,
            )
            if status != 200:
                continue
            data = json.loads(raw)
        except Exception:
            continue

        container = data.get("MediaContainer", data)
        for item in _as_list(container.get("Metadata", [])):
            media_type = item.get("type", "")
            if media_type not in ("movie", "episode", "track"):
                continue

            user_info = item.get("User") or {}
            player_info = item.get("Player") or {}
            session_info = item.get("Session") or {}
            media_parts = _as_list(item.get("Media", []))
            media_info = media_parts[0] if media_parts else {}
            transcode = item.get("TranscodeSession") or {}

            rating_key = str(item["ratingKey"]) if item.get("ratingKey") is not None else None
            grandparent_rating_key = (
                str(item["grandparentRatingKey"])
                if item.get("grandparentRatingKey") is not None
                else None
            )
            parent_rating_key = (
                str(item["parentRatingKey"]) if item.get("parentRatingKey") is not None else None
            )

            # Bind per-iteration values as defaults (avoids late-binding the
            # loop variable, mirroring the legacy closure).
            def _full_thumb(raw, base_url=server.base_url, token=server.access_token):
                if not raw:
                    return None
                url = str(raw)
                if url.startswith("/"):
                    url = f"{base_url}{url}"
                if token:
                    url = f"{url}{'&' if '?' in url else '?'}X-Plex-Token={token}"
                return url

            all_sessions.append(
                {
                    "session_id": session_info.get("id", str(item.get("ratingKey", ""))),
                    "media_type": media_type,
                    "title": item.get("title", ""),
                    "grandparent_title": item.get("grandparentTitle"),
                    "parent_title": item.get("parentTitle"),
                    "index": _to_int(item.get("index")),
                    "thumb": _full_thumb(item.get("thumb")),
                    "duration": _to_int(item.get("duration")),
                    "view_offset": _to_int(item.get("viewOffset")),
                    "state": player_info.get("state", "paused"),
                    "user_name": user_info.get("title", "Unknown"),
                    "user_thumb": _full_thumb(user_info.get("thumb")),
                    "player_title": player_info.get("title"),
                    "player_device": player_info.get("device") or None,
                    "player_platform": player_info.get("platform") or None,
                    "server_name": server.name,
                    "server_id": server.machine_identifier,
                    "server_owned": server.owned,
                    "rating_key": rating_key,
                    "grandparent_rating_key": grandparent_rating_key,
                    "parent_rating_key": parent_rating_key,
                    "media_item_id": None,
                    "library_section": item.get("librarySectionTitle"),
                    "year": _to_int(item.get("year")),
                    "content_rating": item.get("contentRating"),
                    "summary": item.get("summary"),
                    "video_resolution": media_info.get("videoResolution"),
                    "video_codec": media_info.get("videoCodec"),
                    "audio_codec": media_info.get("audioCodec"),
                    "audio_channels": _to_int(media_info.get("audioChannels")),
                    "bitrate": _to_int(media_info.get("bitrate")),
                    "video_decision": transcode.get("videoDecision") or "direct play",
                    "audio_decision": transcode.get("audioDecision") or "direct play",
                    "transcode_reason": transcode.get("transcodeReason") or None,
                    "throttled": transcode.get("throttled") == "1" if transcode else False,
                }
            )

    # 1. Bulk-match catalog media_item_ids from synced UserPlexItem rows
    rating_keys = {
        s["rating_key"] for s in all_sessions if s.get("rating_key")
    } | {
        s["grandparent_rating_key"] for s in all_sessions if s.get("grandparent_rating_key")
    }
    if rating_keys:
        plex_item_map = {
            row["rating_key"]: row["media_item_id"]
            for row in UserPlexItem.objects.filter(
                user=user, rating_key__in=rating_keys, media_item__isnull=False
            ).values("rating_key", "media_item_id")
        }
        for s in all_sessions:
            if s.get("rating_key") in plex_item_map:
                s["media_item_id"] = plex_item_map[s["rating_key"]]
            elif s.get("grandparent_rating_key") in plex_item_map:
                s["media_item_id"] = plex_item_map[s["grandparent_rating_key"]]

    server_map = {s.machine_identifier: s for s in servers}

    # 2. Match remaining unmatched sessions against existing catalog MediaItem by title + type
    for s in all_sessions:
        if s.get("media_item_id"):
            continue
        m_type = "show" if s.get("media_type") == "episode" else s.get("media_type")
        m_title = s.get("grandparent_title") if s.get("media_type") == "episode" else s.get("title")
        if not m_title:
            continue
        try:
            from apps.media.models import MediaItem

            qs = MediaItem.objects.filter(media_type=m_type, title__iexact=m_title)
            matched_item = None
            if s.get("year"):
                matched_item = qs.filter(release_date__year=s["year"]).first() or qs.first()
            else:
                matched_item = qs.first()

            if matched_item:
                s["media_item_id"] = matched_item.id
                server_obj = server_map.get(s.get("server_id"))
                if server_obj and s.get("rating_key"):
                    UserPlexItem.objects.update_or_create(
                        server=server_obj,
                        rating_key=s["rating_key"],
                        defaults={
                            "user": user,
                            "media_item": matched_item,
                            "title": s.get("title") or m_title,
                            "media_type": s.get("media_type") or m_type,
                            "year": s.get("year"),
                        },
                    )
        except Exception:
            logger.debug("Failed catalog title match for %s", m_title, exc_info=True)

    # 3. If still unmatched, inspect Plex item metadata for TMDB/IMDb Guids and auto-resolve/seed
    for s in all_sessions:
        if s.get("media_item_id"):
            continue
        target_key = s.get("grandparent_rating_key") or s.get("rating_key")
        server_obj = server_map.get(s.get("server_id"))
        if not target_key or not server_obj or not server_obj.base_url or not server_obj.access_token:
            continue
        try:
            m_status, m_raw = _request(
                _with_token(
                    f"{server_obj.base_url}/library/metadata/{target_key}", server_obj.access_token
                ),
                headers=_plex_headers(),
                timeout=5.0,
            )
            if m_status == 200:
                m_data = json.loads(m_raw)
                m_meta = m_data.get("MediaContainer", {}).get("Metadata", [])
                if m_meta:
                    meta_item = m_meta[0]
                    guids_list = meta_item.get("Guid", []) or []
                    tmdb_id = None
                    for g in guids_list:
                        gid = g.get("id", "") if isinstance(g, dict) else str(g)
                        if gid.startswith("tmdb://"):
                            tmdb_id = gid.replace("tmdb://", "").strip()
                            break
                    if tmdb_id and tmdb_id.isdigit():
                        from django.contrib.contenttypes.models import ContentType

                        from apps.media.models import ExternalID, MediaItem

                        ext = ExternalID.objects.filter(
                            provider="tmdb",
                            external_id=tmdb_id,
                            content_type=ContentType.objects.get_for_model(MediaItem),
                        ).first()
                        resolved_id = ext.object_id if ext else None
                        if not resolved_id:
                            from asgiref.sync import async_to_sync

                            from apps.media.services.tmdb_ingest import (
                                fetch_and_seed_movie,
                                fetch_and_seed_show,
                            )

                            m_type = "show" if s.get("media_type") == "episode" else s.get("media_type")
                            if m_type == "show":
                                resolved_id = async_to_sync(fetch_and_seed_show)(int(tmdb_id))
                            else:
                                resolved_id = async_to_sync(fetch_and_seed_movie)(int(tmdb_id))
                        if resolved_id:
                            s["media_item_id"] = resolved_id
                            UserPlexItem.objects.update_or_create(
                                server=server_obj,
                                rating_key=s["rating_key"],
                                defaults={
                                    "user": user,
                                    "media_item_id": resolved_id,
                                    "title": s.get("title") or meta_item.get("title", ""),
                                    "media_type": s.get("media_type") or m_type,
                                    "year": s.get("year"),
                                },
                            )
        except Exception:
            logger.debug(
                "Failed auto-matching plex session %s metadata", s.get("session_id"), exc_info=True
            )

    return all_sessions


def is_plex_admin(user) -> bool:
    """Return whether the user owns at least one connected Plex server."""
    if not user.plex_auth_token:
        return False
    return UserPlexServer.objects.filter(user=user, selected=True, owned=True).exists()


# ── Discovery (GET /integrations/plex/servers) ───────────────────────────

DISCOVER_NO_LINKED_ACCOUNT = "User has no linked Plex account"
DISCOVER_ACCOUNT_REVOKED = (
    "Plex account was disconnected because access was revoked externally. "
    "Please re-link your account."
)
DISCOVER_UNEXPECTED = "Failed to discover Plex servers. Please try again later."


def _http_status_detail(status: int, url: str) -> str:
    return (
        f"Plex returned {status} for {url}. The server may be unreachable or "
        "the connection may need to be refreshed."
    )


def _timeout_detail(url: str) -> str:
    return (
        f"Connection to Plex timed out ({url}). Check that your server is "
        "running and remote access is enabled."
    )


def _connect_detail(url: str) -> str:
    return (
        f"Could not connect to Plex at {url}. Check that your server is "
        "running and remote access is enabled."
    )


class PlexDiscoveryError(Exception):
    """Base class for discovery failures; carries the legacy ``detail``."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class PlexNoLinkedAccount(PlexDiscoveryError):
    """Raised when the user has no ``plex_auth_token`` (→ 400)."""


class PlexDiscoveryAuthRevoked(PlexDiscoveryError):
    """Raised on a 401 from plex.tv; the caller unlinks + returns 410."""


class PlexDiscoveryHttpError(PlexDiscoveryError):
    """Raised when the provider answers with an HTTP error status (→ 502)."""

    def __init__(self, status: int, url: str) -> None:
        self.status = status
        self.url = url
        super().__init__(_http_status_detail(status, url))


class PlexDiscoveryTimeout(PlexDiscoveryError):
    """Raised when an outbound discovery call times out (→ 504)."""

    def __init__(self, url: str) -> None:
        self.url = url
        super().__init__(_timeout_detail(url))


class PlexDiscoveryConnectError(PlexDiscoveryError):
    """Raised when an outbound discovery call cannot connect (→ 502)."""

    def __init__(self, url: str) -> None:
        self.url = url
        super().__init__(_connect_detail(url))


def _best_connection(resource: dict) -> str | None:
    """Pick the best reachable URI for a plex.tv resource.

    Prefer a local HTTPS connection (direct LAN), then any HTTPS, then any
    URI — mirrors the legacy helper. Non-local/relay plex.direct links are slow.
    """
    connections = _connections(resource)
    for conn in connections:
        uri = conn.get("uri")
        if uri and str(uri).startswith("https://") and conn.get("local"):
            return str(uri).rstrip("/")
    for conn in connections:
        uri = conn.get("uri")
        if uri and str(uri).startswith("https://"):
            return str(uri).rstrip("/")
    for conn in connections:
        uri = conn.get("uri")
        if uri:
            return str(uri).rstrip("/")
    return None


def _discovery_json(status: int, raw: str, url: str) -> Any:
    """Parse a discovery payload; a non-JSON provider body → HTTP-level failure."""
    try:
        return json.loads(raw)
    except ValueError:
        raise PlexDiscoveryHttpError(status, url) from None


def _plex_discovery_get(url: str, *, token: str, timeout: float = 15.0) -> tuple[int, str]:
    """Outbound discovery leaf mapping urllib failures to typed errors.

    ``url`` is echoed (token-embedded, as legacy echoed ``request.url``) in the
    raised error details so the caller can tell the user which host failed.
    """
    full = _with_token(url, token)
    try:
        status, raw = _request(full, headers=_plex_headers(), timeout=timeout)
    except TimeoutError:
        raise PlexDiscoveryTimeout(full) from None
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", None) or exc
        if isinstance(reason, TimeoutError):
            raise PlexDiscoveryTimeout(full) from None
        raise PlexDiscoveryConnectError(full) from None
    except OSError:
        raise PlexDiscoveryConnectError(full) from None
    if status >= 400:
        raise PlexDiscoveryHttpError(status, full)
    return status, raw


def discover_plex_servers(user) -> list[UserPlexServer]:
    """Upsert the user's Plex servers from plex.tv and return the full set.

    Raises :class:`PlexNoLinkedAccount` (no token) or a ``PlexDiscovery*``
    network error (plex.tv call failed). DB-only servers that plex.tv did not
    list are appended when they still have a usable ``base_url``.
    """
    if not user.plex_auth_token:
        raise PlexNoLinkedAccount(DISCOVER_NO_LINKED_ACCOUNT)

    resources_url = f"{_plex_tv_base()}/api/v2/resources?includeHttps=1&includeRelay=1"
    try:
        status, raw = _plex_discovery_get(resources_url, token=user.plex_auth_token)
    except PlexDiscoveryHttpError as exc:
        # A 401 from plex.tv means the stored auth token was revoked externally.
        if exc.status == 401:
            raise PlexDiscoveryAuthRevoked(DISCOVER_ACCOUNT_REVOKED) from None
        raise
    resources = _discovery_json(status, raw, resources_url)

    servers: list[UserPlexServer] = []
    seen_machines: set[str] = set()
    for resource in _as_list(resources):
        if "server" not in str(resource.get("provides") or ""):
            continue
        machine_id = str(
            resource.get("clientIdentifier") or resource.get("machineIdentifier") or ""
        )
        if not machine_id:
            continue
        server = UserPlexServer.objects.filter(user=user, machine_identifier=machine_id).first()
        if server is None:
            server = UserPlexServer(user=user, machine_identifier=machine_id, name="Plex Server")
        server.name = str(resource.get("name") or server.name)
        server.product = resource.get("product")
        server.platform = resource.get("platform")
        server.base_url = _best_connection(resource)
        server.access_token = resource.get("accessToken") or user.plex_auth_token
        server.owned = bool(resource.get("owned"))
        server.save()
        seen_machines.add(machine_id)
        servers.append(server)

    # Keep DB-only servers that plex.tv failed to list (e.g. temporarily off).
    for server in UserPlexServer.objects.filter(user=user):
        if server.machine_identifier not in seen_machines and server.base_url:
            servers.append(server)
    return servers


def discover_plex_libraries(user, server: UserPlexServer) -> list[UserPlexLibrary]:
    """Upsert the movie/show/music library sections on one Plex server.

    Returns ``[]`` without a network call when the server has no token or
    ``base_url``; otherwise raises a ``PlexDiscovery*`` network error on failure
    so the caller can mark the server unreachable.
    """
    token = server.access_token or user.plex_auth_token
    if not token or not server.base_url:
        return []
    url = f"{server.base_url}/library/sections"
    status, raw = _plex_discovery_get(url, token=token)
    data = _discovery_json(status, raw, url)

    libraries: list[UserPlexLibrary] = []
    for item in _container_items(data):
        lib_type = item.get("type")
        if lib_type not in {"movie", "show", "artist"}:
            continue
        key = str(item.get("key") or "")
        if not key:
            continue
        library = UserPlexLibrary.objects.filter(user=user, server=server, section_key=key).first()
        if library is None:
            library = UserPlexLibrary(
                user=user,
                server=server,
                section_key=key,
                title=str(item.get("title") or "Plex Library"),
                library_type=lib_type,
            )
        library.title = str(item.get("title") or library.title)
        library.library_type = lib_type
        library.save()
        libraries.append(library)
    return libraries


# ── Stream URL (GET /integrations/plex/stream/{rating_key}) ──────────────


def _signed_stream_url(base_url: str, token: str, data: dict) -> str | None:
    """Build the signed Plex media-file URL from a metadata payload's first part."""
    container = data.get("MediaContainer", data)
    items = _as_list(container.get("Metadata"))
    if not items:
        return None
    media_parts = _as_list(items[0].get("Media"))
    if not media_parts:
        return None
    parts = _as_list(media_parts[0].get("Part"))
    if not parts:
        return None
    part_key = parts[0].get("key")
    if not part_key:
        return None
    url = f"{base_url}{part_key}"
    return f"{url}{'&' if '?' in url else '?'}X-Plex-Token={token}"


def _resolve_stream_url_for_server(server: UserPlexServer, user, rating_key: str) -> str | None:
    """Resolve a stream URL through one Plex server (base URL + alt fallbacks)."""
    token = server.access_token or user.plex_auth_token
    if not token:
        return None
    result = _plex_server_get(server, user, f"/library/metadata/{rating_key}")
    if result is None:
        return None
    data, working_base_url = result
    return _signed_stream_url(working_base_url, token, data)


def resolve_stream_url_for_server_with_base(
    base_url: str, token: str, rating_key: str
) -> str | None:
    """Fast path: resolve a stream URL against one explicit base URL (no discovery).

    Mirrors legacy ``_resolve_stream_url_for_server_with_base`` — any network
    failure, non-200, or missing media part yields ``None`` (caller falls back).
    """
    try:
        status, raw = _request(
            _with_token(f"{base_url}/library/metadata/{rating_key}", token),
            headers=_plex_headers(),
            timeout=8.0,
        )
    except Exception:
        return None
    if status != 200:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    return _signed_stream_url(base_url, token, data)


def get_plex_stream_url(user, rating_key: str) -> str | None:
    """Resolve a Plex ``rating_key`` to a signed browser-streamable URL (or None).

    Prefers the server behind the user's synced ``UserPlexItem`` for the rating
    key, then tries every stored server in turn (legacy ordering).
    """
    plex_item = (
        UserPlexItem.objects.filter(user=user, rating_key=rating_key)
        .select_related("server")
        .first()
    )
    if plex_item is not None and plex_item.server is not None:
        url = _resolve_stream_url_for_server(plex_item.server, user, rating_key)
        if url is not None:
            return url
    for server in UserPlexServer.objects.filter(user=user):
        url = _resolve_stream_url_for_server(server, user, rating_key)
        if url is not None:
            return url
    return None

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
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from django.conf import settings
from django.core.cache import cache
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


def _ordered_connections(resource: dict) -> list[str]:
    """Return all distinct connection URIs for a resource in preferred order:
    1. Local HTTPS (direct LAN with SSL)
    2. Remote direct HTTPS (remote with SSL, non-relay)
    3. Local HTTP (LAN without SSL)
    4. Remote direct HTTP (remote without SSL, non-relay)
    5. Relay HTTPS (Plex relay fallback)
    6. Any other URI
    """
    connections = _connections(resource)
    ordered: list[str] = []

    def _add(condition):
        for c in connections:
            u = c.get("uri")
            if not u:
                continue
            clean = str(u).rstrip("/")
            if clean not in ordered and condition(c, clean):
                ordered.append(clean)

    # 1. Local HTTPS (direct LAN)
    _add(lambda c, u: u.startswith("https://") and c.get("local") and not c.get("relay"))
    # 2. Remote direct HTTPS (remote public IP or custom domain)
    _add(lambda c, u: u.startswith("https://") and not c.get("local") and not c.get("relay"))
    # 3. Local HTTP
    _add(lambda c, u: u.startswith("http://") and c.get("local") and not c.get("relay"))
    # 4. Remote direct HTTP
    _add(lambda c, u: u.startswith("http://") and not c.get("local") and not c.get("relay"))
    # 5. Relay connections
    _add(lambda c, u: bool(c.get("relay")))
    # 6. Any other URI
    _add(lambda c, u: True)

    return ordered


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
        return _ordered_connections(resource)
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


def get_plex_connect_info(
    user,
    media_identifier: str | int,
    season: str | int | None = None,
    episode: str | int | None = None,
    tmdb_id: str | int | None = None,
    title: str | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | None = None,
) -> dict:
    """Return Plex connect details for the user's copy of a catalog media item.

    Mirrors the legacy response with expanded provider-agnostic playback metadata
    including progress percentage, resume offset, episode context, pre-resolved stream
    tracks, and performance timing statistics.
    """
    t_start = time.perf_counter()
    ident = str(media_identifier)
    plex_item = None
    target_media_item = None

    if ident.isdigit():
        plex_item = (
            UserPlexItem.objects.filter(user=user, media_item_id=int(ident))
            .select_related("server")
            .first()
        )
        if plex_item is None:
            from apps.media.models import MediaItem
            target_media_item = MediaItem.objects.filter(id=int(ident)).first()

    if plex_item is None and target_media_item is None:
        from apps.media.models import MediaItem
        target_media_item = MediaItem.objects.filter(slug=ident).first()

    # Plex integration only supports movie/show/music/episode items, NEVER games
    if target_media_item is not None and getattr(target_media_item, "media_type", None) == "game":
        raise PlexConnectInfoNotFound(CONNECT_INFO_ITEM_NOT_FOUND)

    if target_media_item is not None:
        if plex_item is None:
            plex_item = (
                UserPlexItem.objects.filter(user=user, media_item_id=target_media_item.id)
                .select_related("server")
                .first()
            )
        if plex_item is None:
            from django.contrib.contenttypes.models import ContentType

            from apps.media.models import ExternalID

            ct = ContentType.objects.get_for_model(target_media_item.__class__)
            exts = {
                e.provider: e.external_id
                for e in ExternalID.objects.filter(content_type=ct, object_id=target_media_item.id)
            }
            tmdb_ext = exts.get("tmdb")
            imdb_ext = exts.get("imdb")
            tvdb_ext = exts.get("tvdb")

            if tmdb_ext:
                plex_item = (
                    UserPlexItem.objects.filter(user=user, guids__tmdb=str(tmdb_ext))
                    .select_related("server")
                    .first()
                )
            if plex_item is None and tvdb_ext:
                plex_item = (
                    UserPlexItem.objects.filter(user=user, guids__tvdb=str(tvdb_ext))
                    .select_related("server")
                    .first()
                )
            if plex_item is None and imdb_ext:
                plex_item = (
                    UserPlexItem.objects.filter(user=user, guids__imdb=str(imdb_ext))
                    .select_related("server")
                    .first()
                )
            if plex_item is None:
                plex_item = (
                    UserPlexItem.objects.filter(user=user, title__iexact=target_media_item.title)
                    .select_related("server")
                    .first()
                )
            if plex_item is not None and plex_item.media_item_id != target_media_item.id:
                plex_item.media_item = target_media_item
                plex_item.save(update_fields=["media_item"])

    # Query param fallbacks for unified single-roundtrip finding
    if plex_item is None and tmdb_id:
        plex_item = (
            UserPlexItem.objects.filter(user=user, guids__tmdb=str(tmdb_id))
            .select_related("server")
            .first()
        )
    if plex_item is None and tvdb_id:
        plex_item = (
            UserPlexItem.objects.filter(user=user, guids__tvdb=str(tvdb_id))
            .select_related("server")
            .first()
        )
    if plex_item is None and imdb_id:
        plex_item = (
            UserPlexItem.objects.filter(user=user, guids__imdb=str(imdb_id))
            .select_related("server")
            .first()
        )
    if plex_item is None and title:
        plex_item = (
            UserPlexItem.objects.filter(user=user, title__iexact=str(title).strip())
            .select_related("server")
            .first()
        )

    # Ident fallbacks
    if plex_item is None:
        plex_item = (
            UserPlexItem.objects.filter(user=user, guids__tmdb=ident)
            .select_related("server")
            .first()
        )
    if plex_item is None:
        plex_item = (
            UserPlexItem.objects.filter(user=user, guids__tvdb=ident)
            .select_related("server")
            .first()
        )
    if plex_item is None:
        plex_item = (
            UserPlexItem.objects.filter(user=user, guids__imdb=ident)
            .select_related("server")
            .first()
        )
    if plex_item is None:
        plex_item = (
            UserPlexItem.objects.filter(user=user, rating_key=ident)
            .select_related("server")
            .first()
        )
    if plex_item is None:
        plex_item = (
            UserPlexItem.objects.filter(user=user, title__iexact=ident)
            .select_related("server")
            .first()
        )
    if plex_item is not None and target_media_item is not None and plex_item.media_item_id != target_media_item.id:
        plex_item.media_item = target_media_item
        plex_item.save(update_fields=["media_item"])
    if plex_item is None:
        raise PlexConnectInfoNotFound(CONNECT_INFO_ITEM_NOT_FOUND)
    server = plex_item.server
    if server is None:
        raise PlexConnectInfoNotFound(CONNECT_INFO_SERVER_NOT_FOUND)

    db_match_ms = round((time.perf_counter() - t_start) * 1000, 2)

    t_res_start = time.perf_counter()
    alt_urls = _get_alternative_plex_urls(server, user)
    plex_resources_ms = round((time.perf_counter() - t_res_start) * 1000, 2)

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

    # Resolve active playback item (supports shows -> episodes with resume & specific S/E)
    active_rating_key = plex_item.rating_key
    active_title = plex_item.title
    active_media_type = plex_item.media_type
    active_season_num: int | None = None
    active_episode_num: int | None = None
    active_ep_title: str | None = None
    active_offset = int(plex_item.view_offset or 0)
    active_duration = int(plex_item.duration or 0)
    active_viewed = bool(plex_item.viewed)

    target_leaf = None
    t_meta_start = time.perf_counter()

    if plex_item.media_type == "show" or season is not None or episode is not None:
        try:
            leaves_res = _plex_server_get(server, user, f"/library/metadata/{plex_item.rating_key}/allLeaves")
            if leaves_res:
                leaves_data, working_base = leaves_res
                if working_base in base_urls:
                    base_urls.remove(working_base)
                    base_urls.insert(0, working_base)
                leaves = leaves_data.get("MediaContainer", {}).get("Metadata", [])
                selected_leaf = None

                if season is not None and episode is not None:
                    for leaf in leaves:
                        if str(leaf.get("parentIndex")) == str(season) and str(leaf.get("index")) == str(episode):
                            selected_leaf = leaf
                            break
                elif season is not None:
                    for leaf in leaves:
                        if str(leaf.get("parentIndex")) == str(season):
                            selected_leaf = leaf
                            break
                else:
                    # In-progress episode takes precedence for quick resume
                    for leaf in leaves:
                        offset = int(leaf.get("viewOffset") or 0)
                        viewed = int(leaf.get("viewCount") or 0) > 0
                        if offset > 5000 and not viewed:
                            selected_leaf = leaf
                            break
                    # Otherwise find the next unwatched episode
                    if selected_leaf is None:
                        for leaf in leaves:
                            if int(leaf.get("viewCount") or 0) == 0:
                                selected_leaf = leaf
                                break
                    # Fallback to the first episode if all watched
                    if selected_leaf is None and leaves:
                        selected_leaf = leaves[0]

                if selected_leaf:
                    target_leaf = selected_leaf
                    active_rating_key = str(selected_leaf.get("ratingKey"))
                    active_ep_title = selected_leaf.get("title")
                    active_title = active_ep_title or active_title
                    active_media_type = "episode"
                    if selected_leaf.get("parentIndex") is not None:
                        active_season_num = int(selected_leaf.get("parentIndex"))
                    if selected_leaf.get("index") is not None:
                        active_episode_num = int(selected_leaf.get("index"))
                    active_offset = int(selected_leaf.get("viewOffset") or 0)
                    active_duration = int(selected_leaf.get("duration") or 0)
                    active_viewed = int(selected_leaf.get("viewCount") or 0) > 0
        except Exception as e:
            logger.warning("Failed to resolve episode leaves for show %s: %s", plex_item.rating_key, e)
    else:
        try:
            live_res = _plex_server_get(server, user, f"/library/metadata/{plex_item.rating_key}")
            if live_res:
                meta_data, working_base = live_res
                if working_base in base_urls:
                    base_urls.remove(working_base)
                    base_urls.insert(0, working_base)
                meta = meta_data.get("MediaContainer", {}).get("Metadata", [{}])[0]
                target_leaf = meta
                if meta.get("viewOffset") is not None:
                    active_offset = int(meta.get("viewOffset"))
                if meta.get("duration") is not None:
                    active_duration = int(meta.get("duration"))
                if meta.get("viewCount") is not None:
                    active_viewed = int(meta.get("viewCount")) > 0
        except Exception as e:
            logger.debug("Failed to query live movie metadata for %s: %s", plex_item.rating_key, e)

    metadata_ms = round((time.perf_counter() - t_meta_start) * 1000, 2)

    progress_percent = (
        round((active_offset / active_duration) * 100, 1)
        if active_duration and active_offset
        else 0.0
    )

    # Pre-resolve stream specifications for direct browser playback
    audio_tracks: list[dict] = []
    subtitles: list[dict] = []
    part_key: str | None = None
    container: str = "mp4"
    video_codec: str = "h264"
    audio_codec: str = "aac"

    if target_leaf is None and plex_item.raw:
        target_leaf = plex_item.raw

    if target_leaf:
        media_list = _as_list(target_leaf.get("Media"))
        if media_list:
            m_obj = media_list[0]
            container = m_obj.get("container") or "mp4"
            video_codec = m_obj.get("videoCodec") or "h264"
            audio_codec = m_obj.get("audioCodec") or "aac"
            part_list = _as_list(m_obj.get("Part"))
            if part_list:
                part_obj = part_list[0]
                part_key = part_obj.get("key")
                for s in _as_list(part_obj.get("Stream")):
                    stype = s.get("streamType")
                    sid = str(s.get("id", ""))
                    sidx = int(s.get("index", 0))
                    codec = str(s.get("codec") or "")
                    lang = s.get("languageCode") or s.get("language") or "und"
                    disp = s.get("displayTitle") or s.get("title")
                    if stype == 2:  # Audio
                        audio_tracks.append({
                            "id": sid,
                            "index": sidx,
                            "label": disp or f"{lang} ({codec})",
                            "language": lang,
                            "codec": codec,
                            "channels": int(s.get("channels") or 2),
                        })
                    elif stype == 3:  # Subtitle
                        sub_format = (
                            "pgs" if codec == "pgs" else ("ass" if codec == "ass" else ("srt" if codec == "srt" else "vtt"))
                        )
                        sub_key = s.get("key")
                        sub_url = (
                            f"{base_urls[0]}{sub_key}?X-Plex-Token={token}"
                            if (sub_key and base_urls and token)
                            else None
                        )
                        subtitles.append({
                            "id": sid,
                            "index": sidx,
                            "label": disp or lang or "Subtitles",
                            "language": lang,
                            "url": sub_url,
                            "format": sub_format,
                            "is_external": bool(sub_key),
                            "requires_burn_in": codec in ("pgs", "ass"),
                        })

    primary_url = base_urls[0] if base_urls else None
    direct_url = f"{primary_url}{part_key}?X-Plex-Token={token}" if (primary_url and part_key and token) else None
    hls_url = None
    if primary_url and token and active_rating_key:
        encoded_path = urllib.parse.quote(f"/library/metadata/{active_rating_key}", safe="")
        encoded_token = urllib.parse.quote(token, safe="")
        hls_url = (
            f"{primary_url}/video/:/transcode/universal/start.m3u8?"
            f"path={encoded_path}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&hasMDE=1&"
            f"X-Plex-Client-Identifier=otix-web&X-Plex-Product=Otix&X-Plex-Platform=Web&"
            f"X-Plex-Token={encoded_token}"
        )

    total_ms = round((time.perf_counter() - t_start) * 1000, 2)
    server_timings = (
        f'db;dur={db_match_ms};desc="DB Match", '
        f'res;dur={plex_resources_ms};desc="Plex Resources", '
        f'meta;dur={metadata_ms};desc="PMS Metadata", '
        f'total;dur={total_ms};desc="Total"'
    )
    stats = {
        "db_match_ms": db_match_ms,
        "plex_resources_ms": plex_resources_ms,
        "metadata_resolve_ms": metadata_ms,
        "total_ms": total_ms,
    }

    return {
        "base_url": base_urls[0] if base_urls else None,
        "base_urls": base_urls,
        "token": token,
        "rating_key": active_rating_key,
        "album_thumb_url": album_thumb_url,
        "provider": "plex",
        "provider_label": "Plex",
        "server_name": server.name,
        "server_id": server.machine_identifier or str(server.id),
        "media_type": active_media_type,
        "title": active_title,
        "year": plex_item.year,
        "season_number": active_season_num,
        "episode_number": active_episode_num,
        "episode_title": active_ep_title,
        "view_offset": active_offset,
        "duration": active_duration,
        "progress_percent": progress_percent,
        "viewed": active_viewed,
        "view_count": int(plex_item.view_count or 0),
        "audio_tracks": audio_tracks,
        "subtitles": subtitles,
        "container": container,
        "video_codec": video_codec,
        "audio_codec": audio_codec,
        "direct_url": direct_url,
        "hls_url": hls_url,
        "stats": stats,
        "server_timings": server_timings,
    }


def list_plex_libraries(user) -> list[dict]:
    """Return the user's Plex libraries with item counts + last-synced stamps.

    Each library joins its server for the display name; ``item_count`` is the
    number of scanned ``UserPlexItem`` rows in the library (0 when none) and
    ``last_synced_at`` the newest item ``updated_at`` (or None).
    """
    item_count_subq = (
        UserPlexItem.objects.filter(user=user, library_id=OuterRef("pk"))
        .order_by()
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

    working_cache_key = f"plex_server_working_base:{server.pk}"
    cached_working = cache.get(working_cache_key)

    alt_urls = _get_alternative_plex_urls(server, user)
    base_urls: list[str] = []
    if cached_working and (cached_working == server.base_url or cached_working in alt_urls):
        base_urls.append(cached_working)
    if server.base_url and server.base_url not in base_urls:
        base_urls.append(server.base_url)
    for url in alt_urls:
        if url not in base_urls:
            base_urls.append(url)

    for base_url in base_urls:
        try:
            status, raw = _request(
                _with_token(f"{base_url}{path}", token),
                headers=_plex_headers(),
                timeout=3.0,
            )
            if status != 200:
                continue
            cache.set(working_cache_key, base_url, timeout=600)
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


def report_plex_timeline(
    server_url: str,
    token: str,
    rating_key: str,
    state: str = "playing",
    time_ms: int = 0,
    duration_ms: int = 0,
    client_id: str = "otix-web-player",
    session_id: str | None = None,
    local_only: bool = False,
) -> bool:
    """Report playback progress to Plex Media Server timeline.

    Registers active playback in Plex dashboard, Tautulli, and Plex Dash under 'Now Playing',
    and keeps viewOffset / progress up to date.
    When local_only=True, only updates Otix's stored UserPlexItem view offset locally
    without proxying redundant timeline requests from backend to Plex.
    """
    clean_url = server_url.rstrip("/")

    # Also scrobble if stopped and >= 90% watched
    scrobble_url = None
    if state == "stopped" and duration_ms > 0 and time_ms >= duration_ms * 0.9:
        scrobble_url = f"{clean_url}/:/scrobble?key={rating_key}&identifier=com.plexapp.plugins.library"
        if token:
            scrobble_url += f"&X-Plex-Token={token}"

    # Update local UserPlexItem if matching row exists
    try:
        UserPlexItem.objects.filter(rating_key=str(rating_key)).update(
            view_offset=int(time_ms),
            viewed=bool(scrobble_url is not None),
        )
    except Exception:
        pass

    if local_only:
        return True

    params = {
        "ratingKey": str(rating_key),
        "key": f"/library/metadata/{rating_key}",
        "state": state,
        "time": str(int(time_ms)),
        "duration": str(int(duration_ms)),
        "hasMDE": "1",
        "X-Plex-Client-Identifier": client_id,
        "X-Plex-Product": "Otix",
        "X-Plex-Platform": "Web",
        "X-Plex-Platform-Version": "1.0",
        "X-Plex-Device": "Otix Web",
        "X-Plex-Device-Name": "Otix Player",
        "X-Plex-Version": "1.0.0",
    }
    if session_id:
        params["X-Plex-Session-Identifier"] = str(session_id)
        params["X-Plex-Playback-Session-Id"] = str(session_id)
    if token:
        params["X-Plex-Token"] = token

    timeline_url = f"{clean_url}/:/timeline?{urllib.parse.urlencode(params)}"

    headers = _plex_headers()
    if client_id:
        headers["X-Plex-Client-Identifier"] = client_id

    try:
        status, _ = _request(timeline_url, headers=headers, timeout=5.0)
        if scrobble_url:
            _request(scrobble_url, headers=headers, timeout=5.0)
        return status in (200, 201, 204)
    except Exception as exc:
        logger.debug("Failed to report Plex timeline to %s: %s", clean_url, exc)
        return False


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
        if not server.access_token:
            continue
        res = _plex_server_get(server, user, "/status/sessions")
        if not res:
            continue
        data, working_base = res

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
            def _full_thumb(raw, base_url=working_base, token=server.access_token):
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


def get_plex_continue_watching(user) -> list[dict]:
    """Return Continue Watching items across the user's Plex servers.

    Queries PMS live Continue Watching / onDeck endpoints with fallback to stored
    UserPlexItem rows. Items are deduplicated, enriched with catalog MediaItem links,
    and formatted for discover playback.
    """
    if not getattr(user, "plex_auth_token", None) and not getattr(user, "plex_id", None):
        return []

    servers = list(UserPlexServer.objects.filter(user=user, selected=True))
    if not servers:
        servers = list(UserPlexServer.objects.filter(user=user))

    items: list[dict] = []
    seen_rating_keys: set[str] = set()

    for server in servers:
        token = server.access_token or user.plex_auth_token
        if not token or not server.base_url:
            continue

        raw_items: list[dict] = []
        working_base = server.base_url

        for endpoint in (
            "/hubs/continueWatching",
            "/hubs/continueWatching/items",
            "/hubs/home/continueWatching",
            "/library/onDeck",
        ):
            res = _plex_server_get(server, user, endpoint)
            if not res:
                continue
            data, base = res
            working_base = base
            container = data.get("MediaContainer", data)
            leaf_list = []
            if "Metadata" in container:
                leaf_list = _as_list(container.get("Metadata", []))
            elif "Hub" in container:
                for hub in _as_list(container.get("Hub", [])):
                    htype = str(hub.get("type", ""))
                    hident = str(hub.get("hubIdentifier", "")).lower()
                    if htype in ("continueWatching", "onDeck") or "continue" in hident:
                        leaf_list = _as_list(hub.get("Metadata", []))
                        if leaf_list:
                            break

            if leaf_list:
                for leaf in leaf_list:
                    rk = str(leaf.get("ratingKey", ""))
                    if rk and rk not in seen_rating_keys:
                        raw_items.append(leaf)
                        seen_rating_keys.add(rk)
                if raw_items:
                    break

        def _full_thumb(raw, base_url=working_base, tok=token):
            if not raw:
                return None
            url = str(raw)
            if url.startswith("/"):
                url = f"{base_url}{url}"
            if tok:
                url = f"{url}{'&' if '?' in url else '?'}X-Plex-Token={tok}"
            return url

        for leaf in raw_items:
            mtype = leaf.get("type", "")
            if mtype not in ("movie", "episode", "show"):
                continue

            rk = str(leaf["ratingKey"])
            is_episode = mtype == "episode"
            grandparent_rk = (
                str(leaf["grandparentRatingKey"]) if leaf.get("grandparentRatingKey") else None
            )

            title = leaf.get("title", "")
            grandparent_title = leaf.get("grandparentTitle")
            parent_idx = _to_int(leaf.get("parentIndex"))
            ep_idx = _to_int(leaf.get("index"))
            duration = _to_int(leaf.get("duration")) or 0
            view_offset = _to_int(leaf.get("viewOffset")) or 0
            progress_pct = (
                round((view_offset / duration) * 100, 1)
                if duration > 0 and view_offset > 0
                else 0.0
            )

            display_title = grandparent_title if is_episode and grandparent_title else title
            ep_title = title if is_episode else None

            if is_episode:
                if parent_idx is not None and ep_idx is not None:
                    subtitle = (
                        f"S{parent_idx}:E{ep_idx} · {ep_title}"
                        if ep_title
                        else f"S{parent_idx}:E{ep_idx}"
                    )
                else:
                    subtitle = ep_title
            else:
                year_val = _to_int(leaf.get("year"))
                subtitle = str(year_val) if year_val else None

            thumb = _full_thumb(leaf.get("thumb") or leaf.get("grandparentThumb"))
            backdrop = _full_thumb(leaf.get("art") or leaf.get("thumb"))

            items.append(
                {
                    "id": rk,
                    "rating_key": rk,
                    "grandparent_rating_key": grandparent_rk,
                    "media_item_id": None,
                    "media_type": "show" if is_episode else "movie",
                    "title": display_title,
                    "show_title": grandparent_title
                    or (title if mtype in ("show", "episode") else None),
                    "episode_title": ep_title,
                    "season_number": parent_idx,
                    "episode_number": ep_idx,
                    "subtitle": subtitle,
                    "thumb": thumb,
                    "backdrop_url": backdrop,
                    "view_offset": view_offset,
                    "duration": duration,
                    "progress_percent": progress_pct,
                    "year": _to_int(leaf.get("year")),
                    "summary": leaf.get("summary"),
                    "server_id": server.machine_identifier,
                    "server_name": server.name,
                    "server_url": working_base,
                }
            )

    # Fallback to local UserPlexItem if live PMS queries returned nothing
    if not items:
        in_progress_qs = (
            UserPlexItem.objects.filter(
                user=user,
                view_offset__gt=0,
                viewed=False,
            )
            .select_related("server", "media_item")
            .order_by("-last_viewed_at", "-updated_at")[:20]
        )
        for p_item in in_progress_qs:
            dur = p_item.duration or 0
            offset = p_item.view_offset or 0
            pct = round((offset / dur) * 100, 1) if dur > 0 and offset > 0 else 0.0
            srv = p_item.server
            token = srv.access_token if srv else user.plex_auth_token
            base_url = srv.base_url if srv else ""
            t_url = p_item.thumb_url
            if t_url and t_url.startswith("/") and base_url:
                t_url = f"{base_url}{t_url}{'&' if '?' in t_url else '?'}X-Plex-Token={token}"

            media_cat = p_item.media_item
            catalog_backdrop = media_cat.backdrop_url if media_cat else None
            catalog_poster = media_cat.poster_url if media_cat else None

            items.append(
                {
                    "id": p_item.rating_key,
                    "rating_key": p_item.rating_key,
                    "grandparent_rating_key": None,
                    "media_item_id": p_item.media_item_id,
                    "media_type": p_item.media_type,
                    "title": p_item.title,
                    "show_title": p_item.title if p_item.media_type == "show" else None,
                    "episode_title": None,
                    "season_number": None,
                    "episode_number": None,
                    "subtitle": str(p_item.year) if p_item.year else None,
                    "thumb": t_url or catalog_poster,
                    "backdrop_url": catalog_backdrop or t_url,
                    "view_offset": offset,
                    "duration": dur,
                    "progress_percent": pct,
                    "year": p_item.year,
                    "summary": None,
                    "server_id": srv.machine_identifier if srv else "",
                    "server_name": srv.name if srv else "",
                    "server_url": base_url,
                }
            )

    # Bulk-match catalog media_item_ids for all items
    rating_keys = {i["rating_key"] for i in items if i.get("rating_key")} | {
        i["grandparent_rating_key"] for i in items if i.get("grandparent_rating_key")
    }
    if rating_keys:
        plex_item_map = {
            row["rating_key"]: row["media_item_id"]
            for row in UserPlexItem.objects.filter(
                user=user, rating_key__in=rating_keys, media_item__isnull=False
            ).values("rating_key", "media_item_id")
        }
        for item in items:
            if item.get("media_item_id"):
                continue
            if item.get("rating_key") in plex_item_map:
                item["media_item_id"] = plex_item_map[item["rating_key"]]
            elif item.get("grandparent_rating_key") in plex_item_map:
                item["media_item_id"] = plex_item_map[item["grandparent_rating_key"]]

    # Also match remaining by title
    for item in items:
        if item.get("media_item_id"):
            continue
        m_title = item.get("title")
        if not m_title:
            continue
        try:
            from apps.media.models import MediaItem

            m_type = item.get("media_type")
            qs = MediaItem.objects.filter(media_type=m_type, title__iexact=m_title)
            if item.get("year"):
                matched = qs.filter(release_date__year=item["year"]).first() or qs.first()
            else:
                matched = qs.first()
            if matched:
                item["media_item_id"] = matched.id
                if not item.get("backdrop_url") and matched.backdrop_url:
                    item["backdrop_url"] = matched.backdrop_url
                if not item.get("thumb") and matched.poster_url:
                    item["thumb"] = matched.poster_url
        except Exception:
            pass

    return items


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
    """Pick the best reachable URI for a plex.tv resource."""
    ordered = _ordered_connections(resource)
    return ordered[0] if ordered else None


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

        # Keep verified working base URL if cached or present in resource
        cached_working = cache.get(f"plex_server_working_base:{server.pk}") if server.pk else None
        all_ordered = _ordered_connections(resource)
        if cached_working and cached_working in all_ordered:
            server.base_url = cached_working
        elif server.base_url and server.base_url in all_ordered:
            pass  # keep existing working base URL
        else:
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

    Tries the primary base_url, then fails over across alternative connections
    (remote direct HTTPS, custom URLs, local HTTP, or Plex relay) to ensure
    discovery works seamlessly in all environments: local bare metal, Docker
    containers, and remote production VMs.
    """
    token = server.access_token or user.plex_auth_token
    if not token or not server.base_url:
        return []

    working_cache_key = f"plex_server_working_base:{server.pk}"
    cached_working = cache.get(working_cache_key)

    alt_urls = _get_alternative_plex_urls(server, user)
    candidate_urls: list[str] = []
    if cached_working and (cached_working == server.base_url or cached_working in alt_urls):
        candidate_urls.append(cached_working)
    if server.base_url and server.base_url not in candidate_urls:
        candidate_urls.append(server.base_url)
    for url in alt_urls:
        if url not in candidate_urls:
            candidate_urls.append(url)

    last_error: Exception | None = None
    data = None
    working_base: str | None = None

    for candidate in candidate_urls:
        url = f"{candidate}/library/sections"
        try:
            # Responsive timeout per candidate so unreachable LAN IPs
            # in Docker or remote VMs fail over quickly to public/relay IPs.
            status, raw = _plex_discovery_get(url, token=token, timeout=3.5)
            data = _discovery_json(status, raw, url)
            working_base = candidate
            break
        except (PlexDiscoveryHttpError, PlexDiscoveryTimeout, PlexDiscoveryConnectError) as exc:
            last_error = exc
            continue

    if data is None or working_base is None:
        if last_error is not None:
            raise last_error
        return []

    # Update server.base_url in database and cache working base
    if server.base_url != working_base:
        server.base_url = working_base
        server.save(update_fields=["base_url"])
    cache.set(working_cache_key, working_base, timeout=3600)

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

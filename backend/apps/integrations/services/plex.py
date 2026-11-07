"""Plex integration service — read/playback surface.

Mirrors the read + best-effort-live portion of the legacy ``plex_sync_service``
(per-item connect info, album tracks, library listing) over the user's stored
``UserPlexServer`` / ``UserPlexLibrary`` / ``UserPlexItem`` rows, fetching live
media from the user's Plex server over its base/alternative URLs — plus live
sessions, the inbound webhook, and plex.tv server/library discovery. Library
sync + SSE surfaces are deferred to the platform wave (task #6).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
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
from apps.integrations.services import plex_connect

logger = logging.getLogger(__name__)

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


def _ordered_connections(resource: dict) -> list[str]:
    """Return all distinct connection URIs for a resource in preferred order.

    If the server is owned by the user, prioritize direct LAN connections.
    If the server is shared (not owned, e.g. friend's server), prioritize Remote direct HTTPS
    and Remote direct HTTP / Relay before LAN IPs to eliminate 3.5s connection timeouts.
    """
    connections = _connections(resource)
    ordered: list[str] = []
    is_owned = bool(resource.get("owned", False))

    def _add(condition):
        for c in connections:
            u = c.get("uri")
            if not u:
                continue
            clean = str(u).rstrip("/")
            if clean not in ordered and condition(c, clean):
                ordered.append(clean)

    if is_owned:
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
    else:
        # Remote / shared server: LAN IPs will hang/timeout. Prioritize Remote HTTPS & Relay!
        # 1. Remote direct HTTPS
        _add(lambda c, u: u.startswith("https://") and not c.get("local") and not c.get("relay"))
        # 2. Remote direct HTTP
        _add(lambda c, u: u.startswith("http://") and not c.get("local") and not c.get("relay"))
        # 3. Relay connections
        _add(lambda c, u: bool(c.get("relay")))
        # 4. Local HTTPS (in case user is on the same remote LAN)
        _add(lambda c, u: u.startswith("https://") and c.get("local") and not c.get("relay"))
        # 5. Local HTTP
        _add(lambda c, u: u.startswith("http://") and c.get("local") and not c.get("relay"))
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
    Caches the lookup in Django cache to prevent synchronous network latency on every probe.
    """
    if not user or not getattr(user, "plex_auth_token", None):
        return []

    cache_key = f"plex_resources_alt_urls:{user.pk}:{server.machine_identifier}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    resources_cache_key = f"plex_resources_raw:{user.pk}"
    data = cache.get(resources_cache_key)
    if data is None:
        resources_url = f"{_plex_tv_base()}/api/v2/resources?includeHttps=1&includeRelay=1"
        url = _with_token(resources_url, user.plex_auth_token)
        try:
            status, raw = _request(url, headers=_plex_headers(), timeout=5.0)
            if status == 200:
                data = json.loads(raw)
                cache.set(resources_cache_key, data, timeout=300)
        except Exception:
            return []

    if not data:
        return []

    machine_id = server.machine_identifier
    for resource in _as_list(data):
        client_id = str(resource.get("clientIdentifier") or resource.get("machineIdentifier") or "")
        if client_id != machine_id:
            continue
        ordered = _ordered_connections(resource)
        cache.set(cache_key, ordered, timeout=300)
        return ordered
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


def _normalize_title(val: str | None) -> str:
    """Normalize a title string for fuzzy comparison."""
    if not val:
        return ""
    norm = unicodedata.normalize("NFKD", str(val))
    norm = "".join(c for c in norm if not unicodedata.combining(c))
    norm = norm.lower().strip()
    norm = re.sub(r"\s*\(\d{4}\)$", "", norm)
    norm = re.sub(r"[\':;.,!?_\-\\/()[\]{}]", " ", norm)
    norm = re.sub(r"\s+", " ", norm).strip()
    for article in ("the ", "a ", "an "):
        if norm.startswith(article):
            norm = norm[len(article) :].strip()
            break
    return norm


def _are_titles_compatible(
    title_a: str | None, title_b: str | None, min_ratio: float = 0.60
) -> bool:
    """Check whether two titles are sufficiently compatible to represent the same work."""
    n1 = _normalize_title(title_a)
    n2 = _normalize_title(title_b)
    if not n1 or not n2:
        return False
    if n1 == n2:
        return True
    if (len(n1) >= 4 and n1 in n2) or (len(n2) >= 4 and n2 in n1):
        return True
    main1 = _normalize_title(str(title_a).split(":")[0].split(" - ")[0])
    main2 = _normalize_title(str(title_b).split(":")[0].split(" - ")[0])
    if (
        main1
        and main2
        and (main1 == main2 or (len(main1) >= 4 and (main1 in main2 or main2 in main1)))
    ):
        return True
    return SequenceMatcher(None, n1, n2).ratio() >= min_ratio


def _is_compatible_plex_match(
    plex_item: UserPlexItem | None,
    target_media_item=None,
    target_media_type: str | None = None,
    target_year: int | None = None,
    has_guid_match: bool = False,
    req_tmdb_id: str | int | None = None,
    req_imdb_id: str | None = None,
    req_tvdb_id: str | None = None,
) -> bool:
    """Validate that a candidate Plex item is genuinely compatible with the target.

    Prevents wrong matching where a 1994 movie (Forrest Gump) matches a 2026 title (The Odyssey),
    or TV show Baby Reindeer matches movie Alice Through the Looking Glass due to TMDB ID collisions,
    or remakes from different decades match each other.
    """
    if plex_item is None:
        return False

    p_type = getattr(plex_item, "media_type", None) or ""
    expected_type = getattr(target_media_item, "media_type", None) or target_media_type or ""

    # 1. Media type strict isolation
    if expected_type == "game":
        return False
    if expected_type == "movie" and p_type != "movie":
        return False
    if expected_type in ("show", "series", "tv") and p_type not in ("show", "episode"):
        return False
    if expected_type in ("album", "music") and p_type not in ("music", "track", "album", "artist"):
        return False
    if p_type == "movie" and expected_type and expected_type != "movie":
        return False
    if (
        p_type in ("show", "episode")
        and expected_type
        and expected_type not in ("show", "series", "tv", "season", "episode")
    ):
        return False

    # 2. Check GUID conflict
    p_guids = plex_item.guids if isinstance(plex_item.guids, dict) else {}
    if req_tmdb_id and "tmdb" in p_guids and str(p_guids["tmdb"]) != str(req_tmdb_id):
        return False
    if req_imdb_id and "imdb" in p_guids and str(p_guids["imdb"]) != str(req_imdb_id):
        return False
    if req_tvdb_id and "tvdb" in p_guids and str(p_guids["tvdb"]) != str(req_tvdb_id):
        return False

    if target_media_item is not None:
        from django.contrib.contenttypes.models import ContentType

        from apps.media.models import ExternalID

        ct = ContentType.objects.get_for_model(target_media_item.__class__)
        exts = {
            e.provider: e.external_id
            for e in ExternalID.objects.filter(content_type=ct, object_id=target_media_item.id)
        }
        for prov in ("imdb", "tmdb", "tvdb"):
            if prov in p_guids and prov in exts:
                if str(p_guids[prov]) != str(exts[prov]):
                    return False

    # 3. Year compatibility
    c_year = (
        target_media_item.release_date.year
        if (target_media_item and getattr(target_media_item, "release_date", None))
        else target_year
    )
    p_year = getattr(plex_item, "year", None)
    if c_year and p_year:
        max_diff = 2 if has_guid_match else 1
        if abs(c_year - p_year) > max_diff:
            return False

    # 4. Title compatibility
    target_title = getattr(target_media_item, "title", None)
    plex_title = getattr(plex_item, "title", None)
    if not has_guid_match:
        if (
            target_title
            and plex_title
            and not _are_titles_compatible(target_title, plex_title, min_ratio=0.60)
        ):
            return False
    else:
        # If years are missing on both sides, guard against zero-similarity GUID collisions
        if not c_year and not p_year:
            if (
                target_title
                and plex_title
                and not _are_titles_compatible(target_title, plex_title, min_ratio=0.30)
            ):
                return False

    return True


def cleanup_corrupted_plex_matches(user=None) -> int:
    """Scan UserPlexItem rows with media_item set and disassociate any incompatible links.

    Returns the count of cleaned up rows.
    """
    from django.contrib.contenttypes.models import ContentType

    from apps.media.models import ExternalID

    qs = UserPlexItem.objects.filter(media_item__isnull=False).select_related("media_item")
    if user is not None:
        qs = qs.filter(user=user)

    cleaned = 0
    for item in qs:
        has_guid = False
        m = item.media_item
        ct = ContentType.objects.get_for_model(m.__class__)
        exts = {
            e.provider: e.external_id
            for e in ExternalID.objects.filter(content_type=ct, object_id=m.id)
        }
        p_guids = item.guids if isinstance(item.guids, dict) else {}
        for prov in ("tmdb", "imdb", "tvdb"):
            if prov in p_guids and prov in exts and str(p_guids[prov]) == str(exts[prov]):
                has_guid = True
                break

        if not _is_compatible_plex_match(item, m, has_guid_match=has_guid):
            item.media_item = None
            item.save(update_fields=["media_item"])
            cleaned += 1
            logger.warning(
                "Cleaned up corrupted Plex link: Plex item %s ('%s', %s, %s) was wrongly linked to Otix %s ('%s', %s)",
                item.id,
                item.title,
                item.year,
                item.media_type,
                m.id,
                m.title,
                m.media_type,
            )
    return cleaned


def _resolve_show_playable_item(
    server: UserPlexServer,
    user,
    plex_item: UserPlexItem,
    season: str | int | None = None,
    episode: str | int | None = None,
) -> tuple[dict | None, str | None]:
    """Resolve a specific playable episode for a TV show without unbounded /allLeaves traversal.

    1. If specific season and episode are requested:
       Query show seasons (/children) -> find season -> query season episodes (/children) -> find episode.
    2. If specific season requested (no episode):
       Query show seasons (/children) -> find season -> query season episodes (/children) -> find first unwatched/active.
    3. If neither season nor episode requested:
       Try PMS /onDeck for this show. If on-deck episode returned, use it directly.
       If onDeck is empty, query Season 1 directly via /children and pick first unwatched/active.
    """
    selected_leaf: dict | None = None
    working_base: str | None = None

    def _extract_items(payload: dict | None) -> list[dict]:
        if not payload or not isinstance(payload, dict):
            return []
        mc = payload.get("MediaContainer") or {}
        items = mc.get("Metadata") or mc.get("Directory") or []
        return _as_list(items)

    def _pick_best_episode(episodes: list[dict], target_ep: str | int | None = None) -> dict | None:
        if not episodes:
            return None
        if target_ep is not None:
            for ep in episodes:
                if str(ep.get("index")) == str(target_ep):
                    return ep
            return None
        # In-progress episode takes precedence for quick resume
        for ep in episodes:
            offset = int(ep.get("viewOffset") or 0)
            viewed = int(ep.get("viewCount") or 0) > 0
            if offset > 5000 and not viewed:
                return ep
        # Otherwise find next unwatched episode
        for ep in episodes:
            if int(ep.get("viewCount") or 0) == 0:
                return ep
        # Fallback to first episode
        return episodes[0]

    # Path 1: Specific season requested
    if season is not None:
        seasons_res = _plex_server_get(
            server, user, f"/library/metadata/{plex_item.rating_key}/children"
        )
        if seasons_res:
            seasons_data, working_base = seasons_res
            seasons = _extract_items(seasons_data)
            matching_season = None
            for s in seasons:
                if str(s.get("index")) == str(season):
                    matching_season = s
                    break
            if matching_season and matching_season.get("ratingKey"):
                ep_res = _plex_server_get(
                    server, user, f"/library/metadata/{matching_season['ratingKey']}/children"
                )
                if ep_res:
                    ep_data, ep_base = ep_res
                    working_base = ep_base or working_base
                    episodes = _extract_items(ep_data)
                    selected_leaf = _pick_best_episode(episodes, episode)

    # Path 2: Default playback (no season/episode specified) -> try onDeck first for zero-latency resume
    if selected_leaf is None and season is None and episode is None:
        ondeck_res = _plex_server_get(
            server, user, f"/library/metadata/{plex_item.rating_key}/onDeck"
        )
        if ondeck_res:
            ondeck_data, working_base = ondeck_res
            ondeck_items = _extract_items(ondeck_data)
            if ondeck_items:
                selected_leaf = ondeck_items[0]

    # Path 3: Fallback when onDeck is empty or season lookup didn't match -> query Season 1 directly
    if selected_leaf is None:
        seasons_res = _plex_server_get(
            server, user, f"/library/metadata/{plex_item.rating_key}/children"
        )
        if seasons_res:
            seasons_data, working_base = seasons_res
            seasons = _extract_items(seasons_data)
            target_season = None
            for s in seasons:
                if str(s.get("index")) in ("1", 1):
                    target_season = s
                    break
            if target_season is None and seasons:
                target_season = seasons[0]
            if target_season and target_season.get("ratingKey"):
                ep_res = _plex_server_get(
                    server, user, f"/library/metadata/{target_season['ratingKey']}/children"
                )
                if ep_res:
                    ep_data, ep_base = ep_res
                    working_base = ep_base or working_base
                    episodes = _extract_items(ep_data)
                    selected_leaf = _pick_best_episode(episodes, episode)

    return selected_leaf, working_base


def get_plex_connect_info(
    user,
    media_identifier: str | int,
    season: str | int | None = None,
    episode: str | int | None = None,
    tmdb_id: str | int | None = None,
    title: str | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | None = None,
    year: str | int | None = None,
    media_type: str | None = None,
) -> dict:
    """Return Plex connect details for the user's copy of a catalog media item.

    Mirrors the legacy response with expanded provider-agnostic playback metadata
    including progress percentage, resume offset, episode context, pre-resolved stream
    tracks, and performance timing statistics. Cached for 60s per user/item.
    """
    safe_ident = urllib.parse.quote(str(media_identifier), safe="")
    safe_title = urllib.parse.quote(str(title), safe="") if title else ""
    cache_key = f"plex_connect_info:{user.pk}:{safe_ident}:{season}:{episode}:{tmdb_id}:{safe_title}:{year}:{media_type}"
    is_testing = getattr(settings, "TESTING", False) or "test" in sys.argv
    if not is_testing:
        cached_info = cache.get(cache_key)
        if cached_info is not None:
            return cached_info

    t_start = time.perf_counter()
    ident = str(media_identifier).strip()

    # 1. Resolve catalog media item and reject non-media (e.g. games)
    target_media_item = plex_connect.resolve_target_media_item(
        ident, tmdb_id=tmdb_id, imdb_id=imdb_id, tvdb_id=tvdb_id
    )
    if target_media_item is not None and getattr(target_media_item, "media_type", None) == "game":
        raise PlexConnectInfoNotFound(CONNECT_INFO_ITEM_NOT_FOUND)

    # 2. Resolve matching UserPlexItem through priority-based cascading fallback
    plex_item = plex_connect.resolve_user_plex_item(
        user,
        target_media_item,
        ident,
        tmdb_id=tmdb_id,
        imdb_id=imdb_id,
        tvdb_id=tvdb_id,
        title=title,
        year=year,
        media_type=media_type,
    )
    if plex_item is None:
        raise PlexConnectInfoNotFound(CONNECT_INFO_ITEM_NOT_FOUND)

    server = plex_item.server
    if server is None:
        raise PlexConnectInfoNotFound(CONNECT_INFO_SERVER_NOT_FOUND)

    db_match_ms = round((time.perf_counter() - t_start) * 1000, 2)

    # 3. Resolve connection URLs and server token
    t_res_start = time.perf_counter()
    alt_urls = _get_alternative_plex_urls(server, user)
    plex_resources_ms = round((time.perf_counter() - t_res_start) * 1000, 2)

    base_urls = [server.base_url] if server.base_url else []
    for url in alt_urls:
        if url not in base_urls:
            base_urls.append(url)

    token = server.access_token or (getattr(user, "plex_auth_token", None) if user else None)
    album_thumb_url = None
    if base_urls and token and plex_item.rating_key:
        album_thumb_url = (
            f"{base_urls[0]}/library/metadata/{plex_item.rating_key}/thumb?X-Plex-Token={token}"
        )

    # 4. Resolve active playback item & user watch progress
    t_meta_start = time.perf_counter()
    playback, target_leaf = plex_connect.resolve_active_playback_item(
        server, user, plex_item, base_urls, season=season, episode=episode
    )
    metadata_ms = round((time.perf_counter() - t_meta_start) * 1000, 2)

    active_duration = playback["active_duration"]
    active_offset = playback["active_offset"]
    progress_percent = (
        round((active_offset / active_duration) * 100, 1)
        if active_duration and active_offset
        else 0.0
    )

    # 5. Extract stream specifications (codecs, tracks, subtitles, direct/HLS URLs)
    streams = plex_connect.extract_stream_specs(
        target_leaf, plex_item, base_urls, token, playback["active_rating_key"]
    )

    # 6. Performance timings & stats
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

    result = {
        "base_url": base_urls[0] if base_urls else None,
        "base_urls": base_urls,
        "token": token,
        "rating_key": playback["active_rating_key"],
        "album_thumb_url": album_thumb_url,
        "provider": "plex",
        "provider_label": "Plex",
        "server_name": server.name,
        "server_id": server.machine_identifier or str(server.id),
        "is_shared_server": not server.owned,
        "media_type": playback["active_media_type"],
        "title": playback["active_title"],
        "year": plex_item.year,
        "season_number": playback["active_season_num"],
        "episode_number": playback["active_episode_num"],
        "episode_title": playback["active_ep_title"],
        "view_offset": active_offset,
        "duration": active_duration,
        "progress_percent": progress_percent,
        "viewed": playback["active_viewed"],
        "view_count": int(plex_item.view_count or 0),
        "audio_tracks": streams["audio_tracks"],
        "subtitles": streams["subtitles"],
        "container": streams["container"],
        "video_codec": streams["video_codec"],
        "audio_codec": streams["audio_codec"],
        "direct_url": streams["direct_url"],
        "hls_url": streams["hls_url"],
        "stats": stats,
        "server_timings": server_timings,
    }
    if not is_testing:
        cache.set(cache_key, result, timeout=60)
    return result


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


def _plex_server_get(
    server: UserPlexServer, user, path: str, extra_headers: dict | None = None
) -> tuple[dict, str] | None:
    """GET a Plex server path, trying alternative base URLs on failure.

    Returns ``(data, working_base_url)`` from the first base URL that answers
    200, or ``None`` when no connection (or no token) works.
    """
    token = server.access_token or (getattr(user, "plex_auth_token", None) if user else None)
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

    req_headers = _plex_headers()
    if extra_headers:
        req_headers.update(extra_headers)

    for base_url in base_urls:
        try:
            status, raw = _request(
                _with_token(f"{base_url}{path}", token),
                headers=req_headers,
                timeout=3.0,
            )
            if status != 200:
                continue
            cache.set(working_cache_key, base_url, timeout=600)
            return json.loads(raw), base_url
        except Exception:
            continue
    return None


def get_plex_album_tracks(user, media_identifier: str | int) -> dict:
    """Return the user's Plex album tracks for a catalog music media item."""
    ident = str(media_identifier).strip()
    plex_item = None
    if ident.isdigit():
        plex_item = (
            UserPlexItem.objects.filter(user=user, media_item_id=int(ident))
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

    token = server.access_token or getattr(user, "plex_auth_token", None)
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
            "artist": item.get("grandparentTitle", "") or item.get("originalTitle", "") or item.get("parentTitle", ""),
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


def get_plex_music_sections(user) -> list[dict]:
    """Return all music libraries configured on user's Plex servers."""
    libraries = (
        UserPlexLibrary.objects.filter(user=user, library_type__in=["artist", "music"])
        .select_related("server")
        .order_by("server__name", "title")
    )
    return [
        {
            "id": lib.id,
            "server_id": lib.server.id if lib.server else None,
            "server_name": lib.server.name if lib.server else "",
            "section_key": lib.section_key,
            "title": lib.title,
            "library_type": lib.library_type,
        }
        for lib in libraries
    ]


def browse_plex_music(
    user,
    library_id: int | str,
    browse_type: str = "albums",
    query: str = "",
    artist_rating_key: str = "",
    limit: int = 60,
    offset: int = 0,
) -> dict:
    """Browse artists, albums, playlists, or tracks from a specific Plex music library."""
    lib = (
        UserPlexLibrary.objects.filter(user=user, id=int(library_id))
        .select_related("server")
        .first()
    )
    if lib is None or not lib.server:
        raise PlexConnectInfoNotFound("Plex music library not found")

    server = lib.server
    query_hash = hashlib.md5(f"{query}:{artist_rating_key}".encode()).hexdigest()
    cache_key = f"plex_music_browse:{lib.id}:{browse_type}:{offset}:{limit}:{query_hash}"
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        return cached_result

    type_map = {
        "artists": 8,
        "albums": 9,
        "tracks": 10,
    }
    p_type = type_map.get(browse_type, 9)

    raw_items: list[dict] = []
    working_base_url: str | None = None
    token = server.access_token or getattr(user, "plex_auth_token", None)
    container_meta: dict = {}

    extra_headers = {
        "X-Plex-Container-Start": str(offset),
        "X-Plex-Container-Size": str(limit),
    }

    if artist_rating_key:
        # Direct drilldown for an artist: children gives albums
        sub_path = f"/library/metadata/{artist_rating_key}/children?X-Plex-Container-Start={offset}&X-Plex-Container-Size={limit}"
        res = _plex_server_get(server, user, sub_path, extra_headers=extra_headers)
        if res:
            data, working_base_url = res
            container_meta = data.get("MediaContainer", {})
            raw_items = _container_items(data)
    elif browse_type == "playlists":
        sub_path = f"/playlists?X-Plex-Container-Start={offset}&X-Plex-Container-Size={limit}"
        res = _plex_server_get(server, user, sub_path, extra_headers=extra_headers)
        if res:
            data, working_base_url = res
            container_meta = data.get("MediaContainer", {})
            raw_items = _container_items(data)
    elif query:
        encoded_query = urllib.parse.quote(query)
        # 1. Use /hubs/search for full-text, fuzzy, artist-aware music search
        hub_res = _plex_server_get(
            server,
            user,
            f"/hubs/search?query={encoded_query}&sectionId={lib.section_key}&limit={limit}",
            extra_headers=extra_headers,
        )
        if hub_res:
            data, working_base_url = hub_res
            container_meta = data.get("MediaContainer", {})
            hubs = container_meta.get("Hub", [])
            target_hub_type = (
                "album"
                if browse_type == "albums"
                else ("artist" if browse_type == "artists" else "track")
            )
            for h in hubs:
                h_type = h.get("type") or h.get("hubIdentifier")
                if h_type == target_hub_type:
                    for meta in h.get("Metadata", []):
                        meta_section = str(meta.get("librarySectionID", ""))
                        if not meta_section or meta_section == str(lib.section_key):
                            raw_items.append(meta)

        # 2. Fallback to /all?title%=... (contains) if hub search returned no items
        if not raw_items:
            sub_path = f"/library/sections/{lib.section_key}/all?type={p_type}&title%={encoded_query}&X-Plex-Container-Start={offset}&X-Plex-Container-Size={limit}"
            res = _plex_server_get(server, user, sub_path, extra_headers=extra_headers)
            if res:
                data, working_base_url = res
                container_meta = data.get("MediaContainer", {})
                raw_items = _container_items(data)

        # 3. Fallback to exact title match
        if not raw_items:
            sub_path = f"/library/sections/{lib.section_key}/all?type={p_type}&title={encoded_query}&X-Plex-Container-Start={offset}&X-Plex-Container-Size={limit}"
            res = _plex_server_get(server, user, sub_path, extra_headers=extra_headers)
            if res:
                data, working_base_url = res
                container_meta = data.get("MediaContainer", {})
                raw_items = _container_items(data)
    else:
        sub_path = f"/library/sections/{lib.section_key}/all?type={p_type}&X-Plex-Container-Start={offset}&X-Plex-Container-Size={limit}"
        res = _plex_server_get(server, user, sub_path, extra_headers=extra_headers)
        if res:
            data, working_base_url = res
            container_meta = data.get("MediaContainer", {})
            raw_items = _container_items(data)

    if working_base_url is None:
        working_base_url = (server.base_url or "").rstrip("/")

    total_count = len(raw_items)
    if container_meta:
        total_size = container_meta.get("totalSize")
        if total_size is not None:
            try:
                total_count = int(total_size)
            except (ValueError, TypeError):
                total_count = len(raw_items)
        elif "size" in container_meta:
            try:
                total_count = max(len(raw_items), int(container_meta["size"]))
            except (ValueError, TypeError):
                total_count = len(raw_items)

    items = []
    for item in raw_items:
        rkey = str(item.get("ratingKey", ""))
        thumb_path = item.get("thumb") or item.get("parentThumb")
        thumb_url = (
            f"{working_base_url}{thumb_path}?X-Plex-Token={token}"
            if (thumb_path and working_base_url and token)
            else None
        )
        part_key = (
            item.get("Media", [{}])[0].get("Part", [{}])[0].get("key", "")
            if item.get("Media")
            else ""
        )

        items.append({
            "rating_key": rkey,
            "title": item.get("title", ""),
            "artist": (
                item.get("parentTitle", "")
                or item.get("grandparentTitle", "")
                or item.get("originalTitle", "")
            ),
            "thumb_url": thumb_url,
            "year": item.get("year"),
            "track_count": item.get("leafCount") or item.get("childCount"),
            "duration_ms": item.get("duration"),
            "type": item.get("type", browse_type),
            "part_key": part_key,
        })

    result = {
        "items": items,
        "total_count": total_count,
        "offset": offset,
        "limit": limit,
        "base_url": working_base_url,
        "token": token,
        "server_id": server.id,
        "library_id": lib.id,
    }
    cache.set(cache_key, result, timeout=300)
    return result


def get_plex_artist_details(user, server_id: int | str, rating_key: str) -> dict:
    """Return artist info, albums, and tracks for an artist directly from Plex."""
    server = UserPlexServer.objects.filter(user=user, id=int(server_id)).first()
    if not server:
        server = UserPlexServer.objects.filter(user=user).first()
    if not server:
        raise PlexConnectInfoNotFound(CONNECT_INFO_SERVER_NOT_FOUND)

    cache_key = f"plex_music_artist_details:{server.id}:{rating_key}"
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        return cached_result

    # Fetch artist metadata, albums, and tracks concurrently using ThreadPoolExecutor(max_workers=3)
    with ThreadPoolExecutor(max_workers=3) as executor:
        future_art = executor.submit(_plex_server_get, server, user, f"/library/metadata/{rating_key}")
        future_alb = executor.submit(_plex_server_get, server, user, f"/library/metadata/{rating_key}/children")
        future_trk = executor.submit(_plex_server_get, server, user, f"/library/metadata/{rating_key}/allLeaves")

        art_res = future_art.result()
        alb_res = future_alb.result()
        trk_res = future_trk.result()

    if art_res is None:
        raise PlexAlbumTracksFetchError("Could not fetch artist from Plex")
    art_data, working_base_url = art_res
    token = server.access_token or getattr(user, "plex_auth_token", None)
    artist_items = _container_items(art_data)
    art_meta = artist_items[0] if artist_items else {}

    thumb_path = art_meta.get("thumb")
    art_path = art_meta.get("art")
    thumb_url = (
        f"{working_base_url}{thumb_path}?X-Plex-Token={token}"
        if (thumb_path and working_base_url and token)
        else None
    )
    art_url = (
        f"{working_base_url}{art_path}?X-Plex-Token={token}"
        if (art_path and working_base_url and token)
        else None
    )

    artist_name = art_meta.get("title", "")
    artist_info = {
        "rating_key": rating_key,
        "name": artist_name,
        "summary": art_meta.get("summary", ""),
        "thumb_url": thumb_url,
        "art_url": art_url,
    }

    albums = []
    if alb_res:
        alb_data, _ = alb_res
        for item in _container_items(alb_data):
            alb_thumb = item.get("thumb") or item.get("parentThumb")
            alb_thumb_url = (
                f"{working_base_url}{alb_thumb}?X-Plex-Token={token}"
                if (alb_thumb and working_base_url and token)
                else None
            )
            albums.append({
                "rating_key": str(item.get("ratingKey", "")),
                "title": item.get("title", ""),
                "artist": item.get("parentTitle", "") or artist_name,
                "year": item.get("year"),
                "track_count": item.get("leafCount"),
                "thumb_url": alb_thumb_url,
                "type": "album",
            })

    tracks = []
    if trk_res:
        trk_data, _ = trk_res
        for item in _container_items(trk_data):
            part_key = (
                item.get("Media", [{}])[0].get("Part", [{}])[0].get("key", "")
                if item.get("Media")
                else ""
            )
            tracks.append({
                "rating_key": str(item.get("ratingKey", "")),
                "title": item.get("title", ""),
                "artist": item.get("grandparentTitle", "") or artist_name,
                "album_name": item.get("parentTitle", ""),
                "track_number": item.get("index", 0),
                "disc_number": item.get("parentIndex", 1),
                "duration_ms": item.get("duration"),
                "part_key": part_key,
            })

    result = {
        "artist": artist_info,
        "albums": albums,
        "tracks": tracks,
        "base_url": working_base_url,
        "token": token,
        "server_id": server.id,
    }
    cache.set(cache_key, result, timeout=600)
    return result


def get_plex_artist_tracks_by_rating_key(user, server_id: int | str, rating_key: str) -> dict:
    """Return all tracks for an artist rating key directly from the target Plex server."""
    details = get_plex_artist_details(user, server_id, rating_key)
    return {
        "tracks": details["tracks"],
        "base_url": details["base_url"],
        "token": details["token"],
        "artist": details["artist"],
    }


def get_plex_album_tracks_by_rating_key(user, server_id: int | str, rating_key: str) -> dict:
    """Return tracks for an album rating key directly from the target Plex server."""
    server = UserPlexServer.objects.filter(user=user, id=int(server_id)).first()
    if not server:
        # Fallback to any connected server for this user
        server = UserPlexServer.objects.filter(user=user).first()
    if not server:
        raise PlexConnectInfoNotFound(CONNECT_INFO_SERVER_NOT_FOUND)

    cache_key = f"plex_music_album_tracks:{server.id}:{rating_key}"
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        return cached_result

    result = _plex_server_get(server, user, f"/library/metadata/{rating_key}/children")
    if result is None:
        raise PlexAlbumTracksFetchError(ALBUM_TRACKS_FETCH_ERROR)
    data, working_base_url = result
    token = server.access_token or getattr(user, "plex_auth_token", None)

    album_thumb_url = f"{working_base_url}/library/metadata/{rating_key}/thumb?X-Plex-Token={token}" if (working_base_url and token) else None

    tracks = [
        {
            "rating_key": str(item.get("ratingKey", "")),
            "title": item.get("title", ""),
            "artist": item.get("grandparentTitle", "") or item.get("originalTitle", "") or item.get("parentTitle", ""),
            "track_number": item.get("index", 0),
            "disc_number": item.get("parentIndex", 1),
            "duration_ms": item.get("duration"),
            "part_key": (
                item.get("Media", [{}])[0].get("Part", [{}])[0].get("key", "")
                if item.get("Media")
                else ""
            ),
        }
        for item in _container_items(data)
    ]
    res_data = {
        "tracks": tracks,
        "base_url": working_base_url,
        "token": token,
        "rating_key": rating_key,
        "album_thumb_url": album_thumb_url,
    }
    cache.set(cache_key, res_data, timeout=600)
    return res_data


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
    user=None,
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
        scrobble_url = (
            f"{clean_url}/:/scrobble?key={rating_key}&identifier=com.plexapp.plugins.library"
        )
        if token:
            scrobble_url += f"&X-Plex-Token={token}"

    # Update local UserPlexItem strictly for this specific user to eliminate cross-user progress collisions
    if user is not None:
        try:
            UserPlexItem.objects.filter(user=user, rating_key=str(rating_key)).update(
                view_offset=int(time_ms),
                viewed=bool(scrobble_url is not None),
            )
            from apps.media.services.interaction import set_interaction

            p_item = UserPlexItem.objects.filter(user=user, rating_key=str(rating_key)).first()
            if p_item and p_item.media_item_id:
                if scrobble_url is not None or (duration_ms > 0 and time_ms >= duration_ms * 0.9):
                    set_interaction(
                        user,
                        p_item.media_item_id,
                        "watched",
                        {
                            "source": "plex",
                            "view_offset": time_ms,
                            "duration": duration_ms,
                        },
                    )
                elif time_ms > 0:
                    set_interaction(
                        user,
                        p_item.media_item_id,
                        "started",
                        {
                            "source": "plex",
                            "view_offset": time_ms,
                            "duration": duration_ms,
                        },
                    )
        except Exception:
            logger.debug("Failed updating local interaction for timeline", exc_info=True)

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
    if not user or not getattr(user, "plex_auth_token", None):
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
    rating_keys = {s["rating_key"] for s in all_sessions if s.get("rating_key")} | {
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
                matched_item = qs.filter(release_date__year=s["year"]).first()
                if not matched_item:
                    matched_item = qs.filter(
                        release_date__year__gte=s["year"] - 1,
                        release_date__year__lte=s["year"] + 1,
                    ).first()
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
        if (
            not target_key
            or not server_obj
            or not server_obj.base_url
            or not server_obj.access_token
        ):
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

                            m_type = (
                                "show" if s.get("media_type") == "episode" else s.get("media_type")
                            )
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
        token = server.access_token or (getattr(user, "plex_auth_token", None) if user else None)
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
                matched = qs.filter(release_date__year=item["year"]).first()
                if not matched:
                    matched = qs.filter(
                        release_date__year__gte=item["year"] - 1,
                        release_date__year__lte=item["year"] + 1,
                    ).first()
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


def _resolve_plex_servers_for_action(
    user, rating_key: str, server_id: str | None = None
) -> list[UserPlexServer]:
    if server_id:
        srv = UserPlexServer.objects.filter(user=user, machine_identifier=server_id).first()
        if srv:
            return [srv]
    p_item = (
        UserPlexItem.objects.filter(user=user, rating_key=str(rating_key))
        .select_related("server")
        .first()
    )
    if p_item and p_item.server:
        return [p_item.server]

    servers = list(UserPlexServer.objects.filter(user=user, selected=True))
    if not servers:
        servers = list(UserPlexServer.objects.filter(user=user))
    return servers


def _plex_server_action(
    server: UserPlexServer,
    user,
    path: str,
    method: str = "GET",
    timeout: float = 5.0,
) -> bool:
    token = server.access_token or (getattr(user, "plex_auth_token", None) if user else None)
    if not token:
        return False

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
            url = _with_token(f"{base_url}{path}", token)
            status, _ = _request(
                url,
                method=method,
                headers=_plex_headers(),
                timeout=timeout,
            )
            if status in (200, 201, 204):
                cache.set(working_cache_key, base_url, timeout=600)
                return True
        except Exception:
            continue
    return False


def scrobble_plex_item(
    user,
    rating_key: str,
    watched: bool = True,
    server_id: str | None = None,
) -> bool:
    """Mark a media item as watched (scrobble) or unwatched (unscrobble) on Plex.

    Sends /:/scrobble or /:/unscrobble to the relevant PMS instance, updates
    local UserPlexItem rows, and synchronises local Otix catalog interactions
    if a matched media item is present.
    """
    action_path = (
        f"/:/scrobble?key={rating_key}&identifier=com.plexapp.plugins.library"
        if watched
        else f"/:/unscrobble?key={rating_key}&identifier=com.plexapp.plugins.library"
    )
    servers = _resolve_plex_servers_for_action(user, rating_key, server_id)
    success = False
    for srv in servers:
        if _plex_server_action(srv, user, action_path, method="GET"):
            success = True
            break

    try:
        p_items = list(UserPlexItem.objects.filter(user=user, rating_key=str(rating_key)))
        for p_item in p_items:
            p_item.viewed = watched
            if watched:
                p_item.view_offset = p_item.duration or 0
                p_item.view_count = (p_item.view_count or 0) + 1
            else:
                p_item.view_offset = 0
            p_item.save(update_fields=["viewed", "view_offset", "view_count", "updated_at"])

            if p_item.media_item_id:
                from apps.media.services.interaction import set_interaction, remove_interaction

                if watched:
                    set_interaction(user, p_item.media_item_id, "watched", {"source": "plex"})
                else:
                    remove_interaction(user, p_item.media_item_id, "watched")
    except Exception:
        logger.debug("Failed updating local interaction after plex scrobble", exc_info=True)

    return success


def remove_plex_continue_watching(
    user,
    rating_key: str,
    server_id: str | None = None,
) -> bool:
    """Remove a media item from the Continue Watching hub on Plex.

    Uses PUT /actions/removeFromContinueWatching?ratingKey=... and clears the
    local view_offset on matching UserPlexItem rows.
    """
    action_path = f"/actions/removeFromContinueWatching?ratingKey={rating_key}"
    servers = _resolve_plex_servers_for_action(user, rating_key, server_id)
    success = False
    for srv in servers:
        if _plex_server_action(srv, user, action_path, method="PUT"):
            success = True
            break

    try:
        UserPlexItem.objects.filter(user=user, rating_key=str(rating_key)).update(view_offset=0)
    except Exception:
        logger.debug("Failed clearing local view_offset for continue-watching removal", exc_info=True)

    return success


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
    cache.set(f"plex_resources_raw:{user.pk}", resources, timeout=300)

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
        cache.set(f"plex_resources_alt_urls:{user.pk}:{machine_id}", all_ordered, timeout=300)
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
    token = server.access_token or (getattr(user, "plex_auth_token", None) if user else None)
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
        if lib_type not in {"movie", "show", "artist", "music"}:
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
                library_type="artist" if lib_type == "music" else lib_type,
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
    token = server.access_token or (getattr(user, "plex_auth_token", None) if user else None)
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


def _parse_iso_date(val: Any):
    """Safely parse a date string or timestamp into a date object."""
    if not val:
        return None
    try:
        from datetime import datetime

        return datetime.strptime(str(val)[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def hydrate_show_seasons_from_plex(
    media_item_or_id: Any,
    user=None,
    server: UserPlexServer | None = None,
    plex_item: UserPlexItem | None = None,
) -> bool:
    """Hydrate seasons and episodes for a TV show from connected Plex server(s).

    Fetches /library/metadata/{rating_key}/children to retrieve seasons, and
    for each season fetches /library/metadata/{season_rating_key}/children to
    retrieve episodes. Populates Season, Episode, Show counts, and viewed episode
    interactions. Returns True if seasons/episodes were populated.
    """
    from apps.media.models import Episode, MediaItem, Season, Show
    from apps.social.models import UserEpisodeInteraction

    if isinstance(media_item_or_id, MediaItem):
        item = media_item_or_id
    else:
        try:
            item = MediaItem.objects.filter(id=int(media_item_or_id), media_type="show").first()
        except (TypeError, ValueError):
            return False

    if item is None or item.media_type != "show":
        return False

    if plex_item is None:
        qs = UserPlexItem.objects.filter(media_item=item).select_related("server", "user")
        if user is not None and getattr(user, "is_authenticated", False):
            plex_item = qs.filter(user=user).first() or qs.first()
        else:
            plex_item = qs.first()

    if plex_item is None or not plex_item.rating_key:
        cand = (
            UserPlexItem.objects.filter(title__iexact=item.title, media_type="show")
            .select_related("server", "user")
            .first()
        )
        if cand and cand.rating_key:
            plex_item = cand
            if cand.media_item_id is None:
                cand.media_item = item
                cand.save(update_fields=["media_item"])

    if plex_item is None or not plex_item.rating_key:
        return False

    server = server or plex_item.server
    if server is None:
        return False

    user = user if (user is not None and getattr(user, "is_authenticated", False)) else plex_item.user
    token = server.access_token or (getattr(user, "plex_auth_token", None) if user else None)
    base_url = (server.base_url or "").rstrip("/")

    res = _plex_server_get(server, user, f"/library/metadata/{plex_item.rating_key}/children")
    if not res:
        logger.warning(
            "Could not fetch seasons from Plex for show %s (ratingKey=%s)",
            item.id,
            plex_item.rating_key,
        )
        return False

    seasons_data, working_base = res
    working_base = (working_base or base_url).rstrip("/")
    season_items = _container_items(seasons_data)
    if not season_items:
        return False

    show, _ = Show.objects.get_or_create(media_item=item)

    total_episodes_found = 0
    for s in season_items:
        s_idx = s.get("index")
        if s_idx is None:
            continue
        try:
            s_idx = int(s_idx)
        except (TypeError, ValueError):
            continue

        s_thumb = s.get("thumb")
        s_poster = None
        if s_thumb:
            clean_s_thumb = s_thumb if str(s_thumb).startswith("/") else f"/{s_thumb}"
            s_poster = f"{working_base}{clean_s_thumb}"
            if token:
                s_poster = f"{s_poster}?X-Plex-Token={token}"

        season, _ = Season.objects.update_or_create(
            show=show,
            season_number=s_idx,
            defaults={
                "name": s.get("title") or f"Season {s_idx}",
                "overview": s.get("summary") or "",
                "poster_url": s_poster,
                "air_date": _parse_iso_date(s.get("originallyAvailableAt")),
            },
        )

        s_rating_key = s.get("ratingKey")
        if not s_rating_key:
            continue

        ep_res = _plex_server_get(server, user, f"/library/metadata/{s_rating_key}/children")
        if not ep_res:
            continue

        ep_data, ep_base = ep_res
        ep_working_base = (ep_base or working_base).rstrip("/")
        ep_items = _container_items(ep_data)

        for e in ep_items:
            e_idx = e.get("index")
            if e_idx is None:
                continue
            try:
                e_idx = int(e_idx)
            except (TypeError, ValueError):
                continue

            dur_ms = e.get("duration")
            runtime = None
            if dur_ms:
                try:
                    runtime = int(int(dur_ms) / 60000)
                except (TypeError, ValueError):
                    pass

            e_thumb = e.get("thumb")
            e_still = None
            if e_thumb:
                clean_e_thumb = e_thumb if str(e_thumb).startswith("/") else f"/{e_thumb}"
                e_still = f"{ep_working_base}{clean_e_thumb}"
                if token:
                    e_still = f"{e_still}?X-Plex-Token={token}"

            episode, _ = Episode.objects.update_or_create(
                season=season,
                episode_number=e_idx,
                defaults={
                    "name": e.get("title") or f"Episode {e_idx}",
                    "overview": e.get("summary") or "",
                    "runtime": runtime,
                    "air_date": _parse_iso_date(e.get("originallyAvailableAt")),
                    "still_url": e_still,
                },
            )
            total_episodes_found += 1

            if user and int(e.get("viewCount") or 0) > 0:
                try:
                    UserEpisodeInteraction.objects.get_or_create(user=user, episode=episode)
                except Exception:
                    pass

    show.number_of_seasons = Season.objects.filter(show=show, season_number__gt=0).count()
    show.number_of_episodes = Episode.objects.filter(season__show=show).count()
    show.save(update_fields=["number_of_seasons", "number_of_episodes"])

    # Invalidate media detail cache
    cache.delete_many([
        f"media:detail:show:{item.id}:anon:dark",
        f"media:detail:show:{item.id}:anon:light",
        f"media:detail:show:{item.slug}:anon:dark",
        f"media:detail:show:{item.slug}:anon:light",
    ])
    if user and getattr(user, "id", None):
        cache.delete_many([
            f"media:detail:show:{item.id}:{user.id}:dark",
            f"media:detail:show:{item.id}:{user.id}:light",
            f"media:detail:show:{item.slug}:{user.id}:dark",
            f"media:detail:show:{item.slug}:{user.id}:light",
        ])

    logger.info(
        "Hydrated Plex seasons for show %s (%s): %s seasons, %s episodes",
        item.id,
        item.title,
        show.number_of_seasons,
        show.number_of_episodes,
    )
    return total_episodes_found > 0 or show.number_of_seasons > 0


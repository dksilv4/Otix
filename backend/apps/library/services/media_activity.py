"""Media activity aggregation across owned and friend-shared Otix nodes.

Aggregates:
- Processing (actively downloading / in queue with progress %)
- Available (downloaded files on disk or matched in Plex libraries)
- Requested (monitored items without downloaded files)

Enforces Owned-First Priority:
Owned node status always takes precedence over friend-shared nodes.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from django.core.cache import cache

from apps.integrations.models import UserPlexItem
from apps.library.models import UserNode, UserNodeShare
from apps.library.services.node import (
    radarr_get_movies,
    radarr_get_queue,
    sonarr_get_queue,
    sonarr_get_series,
)

logger = logging.getLogger(__name__)

QUEUE_CACHE_TTL = 5  # 5 seconds cache for queue/downloads
CATALOG_CACHE_TTL = 30  # 30 seconds cache for full movie/series lists


def _activity_key(media_type: str, identifier: str | int) -> str:
    """Canonical map key for an item (e.g. 'tmdb:movie:550', 'tmdb:show:1399')."""
    return f"tmdb:{media_type}:{identifier}"


def _normalize_title_key(title: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]", "", str(title or "").lower())


def _resolve_tmdb_id_for_show(tvdb_id: str | int | None, title: str | None = None) -> str | None:
    """Resolve TMDb ID for a show using TVDB external ID or title from the local database."""
    if not tvdb_id and not title:
        return None
    try:
        from apps.media.models import ExternalID, MediaItem
        if tvdb_id:
            ext = ExternalID.objects.filter(provider="tvdb", external_id=str(tvdb_id)).first()
            if ext and ext.object_id:
                tmdb_ext = ExternalID.objects.filter(provider="tmdb", object_id=ext.object_id).first()
                if tmdb_ext and tmdb_ext.external_id:
                    return str(tmdb_ext.external_id)
        if title:
            item = MediaItem.objects.filter(title__iexact=str(title).strip()).first()
            if item:
                tmdb_ext = ExternalID.objects.filter(provider="tmdb", object_id=item.id).first()
                if tmdb_ext and tmdb_ext.external_id:
                    return str(tmdb_ext.external_id)
    except Exception:
        pass
    return None


def _get_cached_or_fetch(
    cache_key: str, ttl: int, fetch_fn: callable
) -> tuple[int, dict | list | None]:
    cached = cache.get(cache_key)
    if cached is not None:
        return 200, cached
    try:
        status_code, data = fetch_fn()
        if status_code == 200 and data is not None:
            cache.set(cache_key, data, timeout=ttl)
            return status_code, data
        return status_code, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch node media activity data for %s: %s", cache_key, exc)
        return 500, None


def _parse_queue_record(record: dict, media_type: str) -> dict[str, Any] | None:
    """Extract progress, speed, ETA, and identifiers from an Arr queue record."""
    if not isinstance(record, dict):
        return None

    size = float(record.get("size") or 0)
    size_left = float(
        record.get("sizeleft")
        if record.get("sizeleft") is not None
        else record.get("size_left") or 0
    )
    progress = 0.0
    if size > 0:
        progress = max(0.0, min(100.0, ((size - size_left) / size) * 100.0))

    timeleft = str(record.get("timeleft") or record.get("estimated_completion_time") or "").strip()
    status_str = str(record.get("status") or "Downloading").strip()
    tracked_status = str(
        record.get("trackedDownloadStatus") or record.get("tracked_download_status") or ""
    ).strip().lower()
    queue_id = record.get("id")

    is_complete = (
        (progress >= 100.0 and size_left <= 0)
        or status_str.lower() in ("completed", "downloaded", "imported")
        or (tracked_status in ("completed", "ok") and size > 0 and size_left <= 0)
    )
    item_status = "available" if is_complete else "processing"

    # Radarr queue
    if media_type == "movie":
        movie = record.get("movie") or {}
        tmdb_id = movie.get("tmdbId") or movie.get("tmdb_id") or record.get("movieId")
        title = movie.get("title") or record.get("title") or "Movie"
        year = movie.get("year")
        if not tmdb_id:
            return None
        return {
            "queue_id": queue_id,
            "status": item_status,
            "media_type": "movie",
            "tmdb_id": str(tmdb_id),
            "title": str(title),
            "year": int(year) if year else None,
            "progress": round(progress, 1),
            "size": int(size),
            "size_left": int(size_left),
            "timeleft": timeleft or None,
            "queue_status": status_str,
        }

    # Sonarr queue
    series = record.get("series") or {}
    tmdb_id = series.get("tmdbId") or series.get("tmdb_id")
    tvdb_id = series.get("tvdbId") or series.get("tvdb_id")
    title = series.get("title") or record.get("title") or "Show"
    year = series.get("year")
    primary_id = tmdb_id or tvdb_id
    if not primary_id:
        return None

    episode = record.get("episode") or {}
    season_num = episode.get("seasonNumber")
    ep_num = episode.get("episodeNumber")

    return {
        "queue_id": queue_id,
        "status": item_status,
        "media_type": "show",
        "tmdb_id": str(tmdb_id) if tmdb_id else None,
        "tvdb_id": str(tvdb_id) if tvdb_id else None,
        "title": str(title),
        "year": int(year) if year else None,
        "progress": round(progress, 1),
        "size": int(size),
        "size_left": int(size_left),
        "timeleft": timeleft or None,
        "queue_status": status_str,
        "episode_label": f"S{season_num:02d}E{ep_num:02d}" if season_num and ep_num else None,
    }


def _collect_accessible_nodes(user, include_friends: bool = True) -> list[tuple[UserNode, bool, bool, dict[str, Any]]]:
    """Collect accessible owned nodes and friend-shared nodes for polling."""
    owned_servers = list(
        UserNode.objects.filter(user=user, is_active=True).select_related("user")
    )
    friend_shares = []
    if include_friends:
        friend_shares = list(
            UserNodeShare.objects.filter(shared_with=user, node__is_active=True).select_related(
                "node", "node__user"
            )
        )

    nodes_to_poll: list[tuple[UserNode, bool, bool, dict[str, Any]]] = []
    for server in owned_servers:
        owner_dict = {
            "id": user.id,
            "username": user.username,
            "display_name": getattr(user, "display_name", None) or user.username,
        }
        nodes_to_poll.append((server, True, True, owner_dict))

    for share in friend_shares:
        node = share.node
        if any(n[0].id == node.id for n in nodes_to_poll):
            continue
        owner_user = node.user
        owner_dict = {
            "id": owner_user.id if owner_user else 0,
            "username": owner_user.username if owner_user else "Friend",
            "display_name": getattr(owner_user, "display_name", None)
            or (owner_user.username if owner_user else "Friend"),
        }
        can_manage = share.permission == "admin"
        nodes_to_poll.append((node, False, can_manage, owner_dict))

    return nodes_to_poll


def _apply_item_to_map(
    target_map: dict[str, dict[str, Any]], key: str, item: dict[str, Any]
) -> None:
    """Apply item to map honoring priority: available > processing > requested."""
    existing = target_map.get(key)
    if not existing:
        target_map[key] = item
    elif existing.get("status") == "requested":
        target_map[key] = item
    elif item.get("status") == "available":
        target_map[key] = item
    elif existing.get("status") == "processing" and item.get("status") == "processing":
        if (item.get("progress") or 0) > (existing.get("progress") or 0):
            target_map[key] = item


def _index_item_in_map(
    target_map: dict[str, dict[str, Any]], item: dict[str, Any]
) -> None:
    """Index an item into target map under tmdb, tvdb, and normalized title keys."""
    m_type = item.get("media_type") or "movie"
    tmdb_id = item.get("tmdb_id")
    tvdb_id = item.get("tvdb_id")
    title = item.get("title")

    if m_type == "show" and not tmdb_id and (tvdb_id or title):
        resolved_tmdb = _resolve_tmdb_id_for_show(tvdb_id, title)
        if resolved_tmdb:
            tmdb_id = resolved_tmdb
            item["tmdb_id"] = str(resolved_tmdb)

    keys: list[str] = []
    if tmdb_id:
        keys.append(f"tmdb:{m_type}:{tmdb_id}")
        keys.append(str(tmdb_id))
    if tvdb_id:
        keys.append(f"tvdb:{m_type}:{tvdb_id}")
        keys.append(str(tvdb_id))
        keys.append(f"tmdb:{m_type}:{tvdb_id}")
    if title:
        norm = _normalize_title_key(title)
        if norm:
            keys.append(f"{m_type}:title:{norm}")

    for k in keys:
        _apply_item_to_map(target_map, k, item)


def _fetch_all_node_payloads(
    nodes_to_poll: list[tuple[UserNode, bool, bool, dict[str, Any]]],
    queue_only: bool,
) -> dict[tuple[int, str], tuple[int, Any]]:
    """Concurrently fetch queue and catalog payloads from all online accessible nodes."""
    fetch_tasks = {}
    with ThreadPoolExecutor(max_workers=min(16, max(len(nodes_to_poll) * 4, 1))) as executor:
        for server, _, _, _ in nodes_to_poll:
            target_url = server.primary_url or server.local_url or ""
            if not server.is_online or not target_url or target_url.startswith("otix://"):
                continue

            q_cache_key_r = f"media_activity:node:{server.id}:radarr:queue"
            fetch_tasks[(server.id, "radarr_q")] = executor.submit(
                _get_cached_or_fetch,
                q_cache_key_r,
                QUEUE_CACHE_TTL,
                lambda s=server: radarr_get_queue(s, page=1, page_size=50),
            )

            q_cache_key_s = f"media_activity:node:{server.id}:sonarr:queue"
            fetch_tasks[(server.id, "sonarr_q")] = executor.submit(
                _get_cached_or_fetch,
                q_cache_key_s,
                QUEUE_CACHE_TTL,
                lambda s=server: sonarr_get_queue(s, page=1, page_size=50),
            )

            if not queue_only:
                cat_cache_key_m = f"media_activity:node:{server.id}:radarr:movies"
                fetch_tasks[(server.id, "radarr_movies")] = executor.submit(
                    _get_cached_or_fetch,
                    cat_cache_key_m,
                    CATALOG_CACHE_TTL,
                    lambda s=server: radarr_get_movies(s),
                )

                cat_cache_key_s = f"media_activity:node:{server.id}:sonarr:series"
                fetch_tasks[(server.id, "sonarr_series")] = executor.submit(
                    _get_cached_or_fetch,
                    cat_cache_key_s,
                    CATALOG_CACHE_TTL,
                    lambda s=server: sonarr_get_series(s),
                )

    node_results = {}
    for task_key, future in fetch_tasks.items():
        try:
            node_results[task_key] = future.result()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Error fetching %s: %s", task_key, exc)
            node_results[task_key] = (500, None)
    return node_results


def _process_node_payloads(
    nodes_to_poll: list[tuple[UserNode, bool, bool, dict[str, Any]]],
    node_results: dict[tuple[int, str], tuple[int, Any]],
    owned_items: dict[str, dict[str, Any]],
    friend_items: dict[str, dict[str, Any]],
    queue_only: bool,
) -> None:
    """Process node queues and library catalogs into tiered activity maps."""
    for server, is_owned, can_manage, owner_dict in nodes_to_poll:
        target_map = owned_items if is_owned else friend_items
        server_meta = {
            "node_id": server.id,
            "node_name": server.name,
            "is_owned": is_owned,
            "can_manage": can_manage,
            "owner": owner_dict,
        }

        # Radarr Queue
        status_code, radarr_q = node_results.get((server.id, "radarr_q"), (500, None))
        if status_code == 200 and isinstance(radarr_q, dict):
            for record in radarr_q.get("records") or []:
                item = _parse_queue_record(record, "movie")
                if item and item.get("tmdb_id"):
                    item.update(server_meta)
                    _index_item_in_map(target_map, item)

        # Sonarr Queue
        status_code, sonarr_q = node_results.get((server.id, "sonarr_q"), (500, None))
        if status_code == 200 and isinstance(sonarr_q, dict):
            for record in sonarr_q.get("records") or []:
                item = _parse_queue_record(record, "show")
                if item:
                    item.update(server_meta)
                    _index_item_in_map(target_map, item)

        if queue_only:
            continue

        # Radarr Movies Catalog
        status_code, movies = node_results.get((server.id, "radarr_movies"), (500, None))
        if status_code == 200 and isinstance(movies, list):
            for m in movies:
                if not isinstance(m, dict):
                    continue
                tmdb_id = m.get("tmdbId") or m.get("tmdb_id")
                if not tmdb_id:
                    continue
                has_file = bool(
                    m.get("hasFile")
                    or m.get("has_file")
                    or m.get("movieFile")
                    or m.get("movie_file")
                )
                item_data = {
                    "status": "available" if has_file else "requested",
                    "media_type": "movie",
                    "tmdb_id": str(tmdb_id),
                    "title": str(m.get("title") or "Movie"),
                    "year": m.get("year"),
                    "size_on_disk": m.get("sizeOnDisk") or m.get("size_on_disk"),
                    "is_partial": False,
                    **server_meta,
                }
                _index_item_in_map(target_map, item_data)

        # Sonarr Series Catalog
        status_code, series_list = node_results.get((server.id, "sonarr_series"), (500, None))
        if status_code == 200 and isinstance(series_list, list):
            for s in series_list:
                if not isinstance(s, dict):
                    continue
                tmdb_id = s.get("tmdbId") or s.get("tmdb_id")
                tvdb_id = s.get("tvdbId") or s.get("tvdb_id")
                title = str(s.get("title") or "Show")
                if not tmdb_id and not tvdb_id and not title:
                    continue
                stats = s.get("statistics") or {}
                file_count = stats.get("episodeFileCount") or stats.get("episode_file_count") or 0
                total_episodes = (
                    stats.get("totalEpisodeCount")
                    or stats.get("total_episode_count")
                    or stats.get("episodeCount")
                    or 0
                )
                percent_episodes = float(stats.get("percentOfEpisodes") or stats.get("percent_of_episodes") or 0)
                size_on_disk = float(stats.get("sizeOnDisk") or stats.get("size_on_disk") or 0)
                has_files = file_count > 0 or size_on_disk > 0 or percent_episodes > 0 or bool(s.get("hasFile"))
                is_partial = has_files and (
                    total_episodes > 0 and file_count < total_episodes and percent_episodes < 100.0
                )

                item_data = {
                    "status": "available" if has_files else "requested",
                    "media_type": "show",
                    "tmdb_id": str(tmdb_id) if tmdb_id else None,
                    "tvdb_id": str(tvdb_id) if tvdb_id else None,
                    "title": title,
                    "year": s.get("year"),
                    "episode_count": file_count,
                    "total_episodes": total_episodes,
                    "is_partial": is_partial,
                    **server_meta,
                }
                _index_item_in_map(target_map, item_data)


def _process_plex_fallback_items(user, owned_items: dict[str, dict[str, Any]]) -> None:
    """Index direct available movie/show entries from user's connected Plex library."""
    plex_items = UserPlexItem.objects.filter(user=user).select_related("media_item")[:500]
    for pi in plex_items:
        m_type = "movie" if pi.media_type == "movie" else "show"
        tmdb_id = getattr(pi.media_item, "tmdb_id", None)
        ident = tmdb_id or pi.rating_key
        if not ident:
            continue
        item_data = {
            "status": "available",
            "media_type": m_type,
            "tmdb_id": str(tmdb_id) if tmdb_id else None,
            "title": pi.title,
            "year": pi.year,
            "is_partial": False,
            "node_id": None,
            "node_name": "Plex Server",
            "is_owned": True,
            "can_manage": False,
            "owner": {
                "id": user.id,
                "username": user.username,
                "display_name": getattr(user, "display_name", None) or user.username,
            },
        }
        _index_item_in_map(owned_items, item_data)


def _merge_and_summarize(
    owned_items: dict[str, dict[str, Any]],
    friend_items: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Merge tiered items with Owned-First priority and calculate deduplicated summary totals."""
    final_items = dict(owned_items)
    for key, friend_item in friend_items.items():
        if key not in final_items:
            final_items[key] = friend_item

    unique_items = {id(v): v for v in final_items.values()}.values()
    return {
        "items": final_items,
        "summary": {
            "total_processing": sum(1 for v in unique_items if v.get("status") == "processing"),
            "total_requested": sum(1 for v in unique_items if v.get("status") == "requested"),
            "total_available": sum(1 for v in unique_items if v.get("status") == "available"),
        },
    }


def get_user_media_activity(
    user, include_friends: bool = True, queue_only: bool = False
) -> dict[str, Any]:
    """Compile aggregated media activity for the given user.

    Applies Owned-First Priority:
    - Owned nodes are processed first.
    - Friend-shared nodes only supply data for items not found on owned nodes.
    - Within each tier, priority is Available > Processing > Requested.
    """
    if not user or not user.is_authenticated:
        return {
            "items": {},
            "summary": {"total_processing": 0, "total_requested": 0, "total_available": 0},
        }

    nodes_to_poll = _collect_accessible_nodes(user, include_friends=include_friends)
    owned_items: dict[str, dict[str, Any]] = {}
    friend_items: dict[str, dict[str, Any]] = {}

    node_results = _fetch_all_node_payloads(nodes_to_poll, queue_only)
    _process_node_payloads(nodes_to_poll, node_results, owned_items, friend_items, queue_only)

    if not queue_only:
        _process_plex_fallback_items(user, owned_items)

    return _merge_and_summarize(owned_items, friend_items)

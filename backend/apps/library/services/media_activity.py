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
from typing import Any

from django.core.cache import cache

from apps.integrations.models import UserPlexItem
from apps.library.models import UserGameServer, UserNodeShare
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
    queue_id = record.get("id")

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
            "status": "processing",
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
        "status": "processing",
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

    # 1. Collect accessible nodes
    owned_servers = list(
        UserGameServer.objects.filter(user=user, is_active=True).select_related("user")
    )

    friend_shares = []
    if include_friends:
        friend_shares = list(
            UserNodeShare.objects.filter(shared_with=user, node__is_active=True).select_related(
                "node", "node__user"
            )
        )

    # Node descriptors tuple: (node, is_owned, can_manage, owner_dict)
    nodes_to_poll: list[tuple[UserGameServer, bool, bool, dict[str, Any]]] = []

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
            continue  # don't duplicate if user also somehow owned it
        owner_user = node.user
        owner_dict = {
            "id": owner_user.id if owner_user else 0,
            "username": owner_user.username if owner_user else "Friend",
            "display_name": getattr(owner_user, "display_name", None)
            or (owner_user.username if owner_user else "Friend"),
        }
        can_manage = share.permission == "admin"
        nodes_to_poll.append((node, False, can_manage, owner_dict))

    # Activity maps separated into owned and friend tiers
    owned_items: dict[str, dict[str, Any]] = {}
    friend_items: dict[str, dict[str, Any]] = {}

    for server, is_owned, can_manage, owner_dict in nodes_to_poll:
        target_map = owned_items if is_owned else friend_items
        server_meta = {
            "node_id": server.id,
            "node_name": server.name,
            "is_owned": is_owned,
            "can_manage": can_manage,
            "owner": owner_dict,
        }

        # --- A. Radarr Queue (Processing) ---
        q_cache_key = f"media_activity:node:{server.id}:radarr:queue"
        status_code, radarr_q = _get_cached_or_fetch(
            q_cache_key, QUEUE_CACHE_TTL, lambda s=server: radarr_get_queue(s, page=1, page_size=50)
        )
        if status_code == 200 and isinstance(radarr_q, dict):
            for record in radarr_q.get("records") or []:
                item = _parse_queue_record(record, "movie")
                if item and item.get("tmdb_id"):
                    key = _activity_key("movie", item["tmdb_id"])
                    item.update(server_meta)
                    # Processing overrides Requested; Available overrides Processing
                    existing = target_map.get(key)
                    if not existing or existing["status"] == "requested":
                        target_map[key] = item

        # --- B. Sonarr Queue (Processing) ---
        q_cache_key = f"media_activity:node:{server.id}:sonarr:queue"
        status_code, sonarr_q = _get_cached_or_fetch(
            q_cache_key, QUEUE_CACHE_TTL, lambda s=server: sonarr_get_queue(s, page=1, page_size=50)
        )
        if status_code == 200 and isinstance(sonarr_q, dict):
            for record in sonarr_q.get("records") or []:
                item = _parse_queue_record(record, "show")
                if item:
                    ident = item.get("tmdb_id") or item.get("tvdb_id")
                    if ident:
                        key = _activity_key("show", ident)
                        item.update(server_meta)
                        existing = target_map.get(key)
                        if not existing or existing["status"] == "requested":
                            target_map[key] = item

        if queue_only:
            continue

        # --- C. Radarr Movies Catalog (Available vs Requested) ---
        cat_cache_key = f"media_activity:node:{server.id}:radarr:movies"
        status_code, movies = _get_cached_or_fetch(
            cat_cache_key, CATALOG_CACHE_TTL, lambda s=server: radarr_get_movies(s)
        )
        if status_code == 200 and isinstance(movies, list):
            for m in movies:
                if not isinstance(m, dict):
                    continue
                tmdb_id = m.get("tmdbId") or m.get("tmdb_id")
                if not tmdb_id:
                    continue
                key = _activity_key("movie", tmdb_id)
                has_file = bool(
                    m.get("hasFile")
                    or m.get("has_file")
                    or m.get("movieFile")
                    or m.get("movie_file")
                )
                item_status = "available" if has_file else "requested"

                item_data = {
                    "status": item_status,
                    "media_type": "movie",
                    "tmdb_id": str(tmdb_id),
                    "title": str(m.get("title") or "Movie"),
                    "year": m.get("year"),
                    "size_on_disk": m.get("sizeOnDisk") or m.get("size_on_disk"),
                    "is_partial": False,
                    **server_meta,
                }

                existing = target_map.get(key)
                if not existing:
                    target_map[key] = item_data
                elif existing["status"] == "requested" and item_status == "available":
                    target_map[key] = item_data
                elif existing["status"] == "processing" and item_status == "available":
                    target_map[key] = item_data

        # --- D. Sonarr Series Catalog (Available vs Requested) ---
        cat_cache_key = f"media_activity:node:{server.id}:sonarr:series"
        status_code, series_list = _get_cached_or_fetch(
            cat_cache_key, CATALOG_CACHE_TTL, lambda s=server: sonarr_get_series(s)
        )
        if status_code == 200 and isinstance(series_list, list):
            for s in series_list:
                if not isinstance(s, dict):
                    continue
                tmdb_id = s.get("tmdbId") or s.get("tmdb_id")
                tvdb_id = s.get("tvdbId") or s.get("tvdb_id")
                ident = tmdb_id or tvdb_id
                if not ident:
                    continue
                key = _activity_key("show", ident)
                stats = s.get("statistics") or {}
                file_count = stats.get("episodeFileCount") or stats.get("episode_file_count") or 0
                total_episodes = (
                    stats.get("totalEpisodeCount")
                    or stats.get("total_episode_count")
                    or stats.get("episodeCount")
                    or 0
                )
                has_files = file_count > 0 or bool(s.get("hasFile"))
                item_status = "available" if has_files else "requested"
                is_partial = has_files and total_episodes > 0 and file_count < total_episodes

                item_data = {
                    "status": item_status,
                    "media_type": "show",
                    "tmdb_id": str(tmdb_id) if tmdb_id else None,
                    "tvdb_id": str(tvdb_id) if tvdb_id else None,
                    "title": str(s.get("title") or "Show"),
                    "year": s.get("year"),
                    "episode_count": file_count,
                    "total_episodes": total_episodes,
                    "is_partial": is_partial,
                    **server_meta,
                }

                existing = target_map.get(key)
                if not existing:
                    target_map[key] = item_data
                elif existing["status"] == "requested" and item_status == "available":
                    target_map[key] = item_data
                elif existing["status"] == "processing" and item_status == "available":
                    target_map[key] = item_data

    # --- E. Fallback: User's Connected Plex Items (Direct Available Items) ---
    if not queue_only:
        plex_items = UserPlexItem.objects.filter(user=user).select_related("media_item")[:500]
        for pi in plex_items:
            m_type = "movie" if pi.media_type == "movie" else "show"
            tmdb_id = getattr(pi.media_item, "tmdb_id", None)
            ident = tmdb_id or pi.rating_key
            if not ident:
                continue
            key = _activity_key(m_type, ident)
            if key not in owned_items:
                owned_items[key] = {
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

    # --- F. Merge with Owned-First Priority ---
    # Owned items take unconditional precedence. Friend items only fill missing slots.
    final_items = dict(owned_items)
    for key, friend_item in friend_items.items():
        if key not in final_items:
            final_items[key] = friend_item

    total_processing = sum(1 for v in final_items.values() if v.get("status") == "processing")
    total_requested = sum(1 for v in final_items.values() if v.get("status") == "requested")
    total_available = sum(1 for v in final_items.values() if v.get("status") == "available")

    return {
        "items": final_items,
        "summary": {
            "total_processing": total_processing,
            "total_requested": total_requested,
            "total_available": total_available,
        },
    }

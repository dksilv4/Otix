"""Plex watched media sync — provider→catalog watch state engine.

Fetches the user's watched movies, shows, and episodes from their connected Plex
servers (and existing UserPlexItem rows), resolves or seeds catalog MediaItems,
and records the `watched` interaction for movies/shows and `UserEpisodeInteraction`
for episodes. Returns ``{total, matched, seeded, episodes}``.
"""

from __future__ import annotations

import logging
from typing import Any

from apps.integrations.models import UserPlexItem, UserPlexLibrary, UserPlexServer
from apps.integrations.services import plex as _plex
from apps.integrations.services.plex_sync import _media_type, _page_json, _upsert_item
from apps.integrations.services.plex_watchlist import (
    _dt_from_plex,
    _find_or_seed_media,
    _media_content_type,
    extract_guids,
)
from apps.media.models import Episode, MediaItem, Season
from apps.media.services.episodes import set_episode_watched, set_show_watched
from apps.media.services.interaction import set_interaction

logger = logging.getLogger(__name__)

_PAGE_SIZE = 200


def _get_working_base(server: UserPlexServer, user) -> str | None:
    """Resolve a reachable base URL for the Plex server."""
    if server.base_url:
        return server.base_url
    alt_urls = _plex._get_alternative_plex_urls(server, user)
    return alt_urls[0] if alt_urls else None


def _fetch_library_watched_items(
    server: UserPlexServer,
    library: UserPlexLibrary,
    token: str,
    base_url: str,
    media_kind: str,
) -> list[dict]:
    """Fetch watched items for a section. Tries unwatched=0 filter with fallback."""
    items: list[dict] = []
    prefix = f"{base_url}/library/sections/{library.section_key}/all"

    # First attempt: unwatched=0 filter
    filter_param = "unwatched=0&" if media_kind == "movie" else ""
    first_url = (
        f"{prefix}?includeGuids=1&{filter_param}"
        f"X-Plex-Container-Start=0&X-Plex-Container-Size={_PAGE_SIZE}"
    )
    data = _page_json(
        first_url,
        token,
        extra_headers={
            "X-Plex-Container-Start": "0",
            "X-Plex-Container-Size": str(_PAGE_SIZE),
        },
    )

    if data is None and filter_param:
        # Fallback without unwatched filter
        first_url = (
            f"{prefix}?includeGuids=1&"
            f"X-Plex-Container-Start=0&X-Plex-Container-Size={_PAGE_SIZE}"
        )
        data = _page_json(
            first_url,
            token,
            extra_headers={
                "X-Plex-Container-Start": "0",
                "X-Plex-Container-Size": str(_PAGE_SIZE),
            },
        )

    if data is None:
        return []

    container = data.get("MediaContainer", data)
    page = _plex._container_items(data)
    items.extend(page)
    total_size = int(container.get("totalSize", len(page)))
    offset = _PAGE_SIZE

    while offset < total_size and page:
        url = (
            f"{prefix}?includeGuids=1&{filter_param}"
            f"X-Plex-Container-Start={offset}&X-Plex-Container-Size={_PAGE_SIZE}"
        )
        data = _page_json(
            url,
            token,
            extra_headers={
                "X-Plex-Container-Start": str(offset),
                "X-Plex-Container-Size": str(_PAGE_SIZE),
            },
        )
        if data is None:
            break
        container = data.get("MediaContainer", data)
        page = _plex._container_items(data)
        items.extend(page)
        offset += _PAGE_SIZE

    return items


def _fetch_library_watched_episodes(
    server: UserPlexServer,
    library: UserPlexLibrary,
    token: str,
    base_url: str,
) -> list[dict]:
    """Fetch watched episode leafs for a TV show library."""
    prefix = f"{base_url}/library/sections/{library.section_key}/all"
    url = (
        f"{prefix}?type=4&unwatched=0&includeGuids=1&"
        f"X-Plex-Container-Start=0&X-Plex-Container-Size={_PAGE_SIZE}"
    )
    data = _page_json(
        url,
        token,
        extra_headers={
            "X-Plex-Container-Start": "0",
            "X-Plex-Container-Size": str(_PAGE_SIZE),
        },
    )
    if data is None:
        return []

    container = data.get("MediaContainer", data)
    episodes = _plex._container_items(data)
    total_size = int(container.get("totalSize", len(episodes)))
    offset = _PAGE_SIZE

    while offset < total_size and episodes:
        p_url = (
            f"{prefix}?type=4&unwatched=0&includeGuids=1&"
            f"X-Plex-Container-Start={offset}&X-Plex-Container-Size={_PAGE_SIZE}"
        )
        data = _page_json(
            p_url,
            token,
            extra_headers={
                "X-Plex-Container-Start": str(offset),
                "X-Plex-Container-Size": str(_PAGE_SIZE),
            },
        )
        if data is None:
            break
        container = data.get("MediaContainer", data)
        page = _plex._container_items(data)
        episodes.extend(page)
        offset += _PAGE_SIZE

    return episodes


def sync_plex_watched(user) -> dict:
    """Fetch user's Plex watched movies/shows/episodes and set catalog interactions.

    Returns ``{"total": total, "matched": matched, "seeded": seeded, "episodes": episodes}``.
    Never raises; returns zeros on missing credentials.
    """
    if not getattr(user, "plex_auth_token", None) and not getattr(user, "plex_id", None):
        return {"total": 0, "matched": 0, "seeded": 0, "episodes": 0}

    # Ensure servers and libraries are discovered
    servers = list(UserPlexServer.objects.filter(user=user, selected=True))
    if not servers:
        try:
            servers = _plex.discover_plex_servers(user)
        except Exception:
            logger.warning("plex server discovery failed during watched sync user=%s", user.id)
            servers = list(UserPlexServer.objects.filter(user=user))

    media_ct = _media_content_type()
    total = matched = seeded = episodes_synced = 0
    seen_media_ids: set[int] = set()

    for server in servers:
        token = server.access_token or user.plex_auth_token
        if not token:
            continue
        base_url = _get_working_base(server, user)
        if not base_url:
            continue

        libraries = list(UserPlexLibrary.objects.filter(server=server, selected=True))
        if not libraries:
            try:
                libraries = _plex.discover_plex_libraries(user, server)
            except Exception:
                logger.warning(
                    "plex library discovery failed server=%s user=%s", server.name, user.id
                )
                continue

        for library in libraries:
            kind = library.library_type
            if kind not in ("movie", "show"):
                continue

            try:
                items = _fetch_library_watched_items(server, library, token, base_url, kind)
            except Exception:
                logger.exception(
                    "failed fetching watched items library=%s server=%s", library.title, server.name
                )
                items = []

            for item in items:
                plex_type = _media_type(item, kind)
                if not plex_type:
                    continue

                view_count = int(item.get("viewCount") or 0)
                leaf_count = int(item.get("leafCount") or 0)
                viewed_leaf_count = int(item.get("viewedLeafCount") or 0)

                is_watched = (
                    (plex_type == "movie" and view_count > 0)
                    or (plex_type == "show" and (
                        view_count > 0 or (leaf_count > 0 and viewed_leaf_count == leaf_count)
                    ))
                )
                is_started = not is_watched and (viewed_leaf_count > 0 or bool(item.get("viewOffset")))

                if not is_watched and not is_started:
                    continue

                plex_guid = str(item["guid"]) if item.get("guid") is not None else None
                guids = extract_guids(item)

                media_item_id, was_matched = _find_or_seed_media(
                    media_ct, item, plex_type, plex_guid, guids
                )
                _upsert_item(user, server, library, item, plex_type, media_item_id, guids)

                total += 1
                if was_matched:
                    matched += 1
                else:
                    from apps.integrations.models import SyncJob
                    from apps.media.services.catalog_resolve import resolve_canonical_id

                    ids = dict(guids)
                    if plex_guid:
                        ids["plex"] = plex_guid
                    ref = resolve_canonical_id(plex_type, ids=ids)
                    if (
                        ref is not None
                        and SyncJob.objects.filter(
                            provider=ref.provider,
                            entity_type=ref.entity_type,
                            external_id=ref.external_id,
                            status__in=("pending", "running"),
                        ).exists()
                    ):
                        seeded += 1

                if media_item_id is not None:
                    last_viewed_at = _dt_from_plex(item.get("lastViewedAt"))
                    extra_data: dict[str, Any] = {
                        "source": "plex",
                        "view_count": max(1, view_count),
                    }
                    if last_viewed_at:
                        extra_data["last_viewed_at"] = last_viewed_at.isoformat()

                    if is_watched:
                        set_interaction(user, media_item_id, "watched", extra_data)
                        if plex_type == "show":
                            set_show_watched(user, media_item_id)
                        seen_media_ids.add(media_item_id)
                    elif is_started:
                        set_interaction(user, media_item_id, "started", extra_data)

            # For show libraries, also fetch episode-level watch history
            if kind == "show":
                try:
                    ep_items = _fetch_library_watched_episodes(server, library, token, base_url)
                except Exception:
                    logger.warning(
                        "could not fetch episode watched history library=%s server=%s",
                        library.title,
                        server.name,
                    )
                    ep_items = []

                for ep_item in ep_items:
                    ep_vc = int(ep_item.get("viewCount") or 0)
                    if ep_vc <= 0:
                        continue
                    parent_idx = ep_item.get("parentIndex")
                    ep_idx = ep_item.get("index")
                    grandparent_key = str(ep_item.get("grandparentRatingKey") or "")
                    grandparent_title = ep_item.get("grandparentTitle")

                    show_mid = None
                    if grandparent_key:
                        show_item = UserPlexItem.objects.filter(
                            server=server, rating_key=grandparent_key, user=user
                        ).first()
                        if show_item and show_item.media_item_id:
                            show_mid = show_item.media_item_id
                    if not show_mid and grandparent_title:
                        cat_show = MediaItem.objects.filter(
                            title__iexact=str(grandparent_title).strip(), media_type="show"
                        ).first()
                        if cat_show:
                            show_mid = cat_show.id

                    if show_mid and parent_idx is not None and ep_idx is not None:
                        try:
                            season = Season.objects.filter(
                                show_id=show_mid, season_number=int(parent_idx)
                            ).first()
                            if season:
                                episode = Episode.objects.filter(
                                    season=season, episode_number=int(ep_idx)
                                ).first()
                                if episode:
                                    set_episode_watched(user, episode.id)
                                    episodes_synced += 1
                        except (TypeError, ValueError):
                            pass

    # Ensure existing viewed UserPlexItem rows have their watched interaction set
    stored_viewed = UserPlexItem.objects.filter(user=user, viewed=True).exclude(
        media_item__isnull=True
    )
    for p_item in stored_viewed:
        if p_item.media_item_id not in seen_media_ids:
            seen_media_ids.add(p_item.media_item_id)
            total += 1
            matched += 1
            set_interaction(
                user,
                p_item.media_item_id,
                "watched",
                {"source": "plex", "view_count": max(1, p_item.view_count)},
            )
            if p_item.media_type == "show":
                set_show_watched(user, p_item.media_item_id)

    logger.info(
        "plex watched sync user=%s total=%s matched=%s seeded=%s episodes=%s",
        user.id,
        total,
        matched,
        seeded,
        episodes_synced,
    )
    return {
        "total": total,
        "matched": matched,
        "seeded": seeded,
        "episodes": episodes_synced,
    }

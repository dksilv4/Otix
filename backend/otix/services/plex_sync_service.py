from __future__ import annotations

import re
import urllib.parse
from datetime import datetime, timezone
from collections.abc import Callable, Coroutine
from typing import Any

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import ExternalID, MediaItem, Movie, Show, UserPlexItem, UserPlexLibrary, UserPlexServer
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.lib.slug import slugify

logger = structlog.get_logger()

PLEX_TV_BASE = "https://plex.tv"

ProgressCallback = Callable[[str, Any], Coroutine[Any, Any, None]]


async def _safe_progress(p: ProgressCallback | None, event_type: str, **data: Any) -> None:
    """Call the progress callback, swallowing errors so they never crash the sync."""
    if p is not None:
        try:
            await p(event_type, **data)
        except Exception:
            logger.warning("plex sync progress callback failed", event_type=event_type, exc_info=True)


def _as_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _container_items(data: dict) -> list[dict]:
    container = data.get("MediaContainer", data)
    return _as_list(container.get("Metadata") or container.get("Directory"))


def _connections(resource: dict) -> list[dict]:
    return _as_list(resource.get("connections") or resource.get("Connection"))


def _best_connection(resource: dict) -> str | None:
    connections = _connections(resource)
    for conn in connections:
        uri = conn.get("uri")
        if uri and str(uri).startswith("https://"):
            return str(uri).rstrip("/")
    for conn in connections:
        uri = conn.get("uri")
        if uri:
            return str(uri).rstrip("/")
    return None


def _parse_guid_id(value: str) -> tuple[str, str] | None:
    lower = value.lower()
    patterns = [
        ("imdb", r"(tt\d+)"),
        ("tmdb", r"tmdb://(\d+)|themoviedb://(\d+)"),
        ("tvdb", r"tvdb://(\d+)"),
    ]
    for provider, pattern in patterns:
        match = re.search(pattern, lower)
        if match:
            external_id = next(group for group in match.groups() if group)
            return provider, external_id
    return None


def extract_guids(item: dict) -> dict[str, str]:
    result: dict[str, str] = {}
    values = [item.get("guid")]
    values.extend(g.get("id") for g in _as_list(item.get("Guid")))
    for value in values:
        if not value:
            continue
        parsed = _parse_guid_id(str(value))
        if parsed:
            provider, external_id = parsed
            result[provider] = external_id
    return result


def _media_type(item: dict, library_type: str | None = None) -> str | None:
    plex_type = item.get("type") or library_type
    if plex_type == "movie":
        return "movie"
    if plex_type in {"show", "season", "episode"}:
        return "show"
    return None


def _dt_from_plex(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


async def _get_json(url: str, token: str) -> dict:
    """Make a GET request to a Plex server or plex.tv, passing the token as a URL param.

    Some Plex server / relay configurations only accept the token as a query parameter
    (``?X-Plex-Token=...``), not as a header, so we embed it in the URL.
    ``plex.tv`` endpoints also require client-identification headers.
    """
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qs(parsed.query)
    query["X-Plex-Token"] = [token]
    url_with_token = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query, doseq=True)))
    headers = {
        "Accept": "application/json",
        "X-Plex-Client-Identifier": settings.plex_client_identifier,
        "X-Plex-Product": settings.plex_product,
        "X-Plex-Version": settings.plex_version,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url_with_token, headers=headers)
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            logger.error("plex returned non-json response", url=url, status=resp.status_code, body=resp.text[:500])
            raise RuntimeError(f"Plex server at {url} returned an unexpected response")


async def discover_plex_servers(
    db: AsyncSession,
    user: User,
    progress: ProgressCallback | None = None,
) -> list[UserPlexServer]:
    if not user.plex_auth_token:
        raise ValueError("User has no linked Plex account")

    data = await _get_json(f"{PLEX_TV_BASE}/api/v2/resources?includeHttps=1&includeRelay=1", user.plex_auth_token)
    resources = _as_list(data)
    servers: list[UserPlexServer] = []
    for resource in resources:
        provides = str(resource.get("provides") or "")
        if "server" not in provides:
            continue
        machine_id = str(resource.get("clientIdentifier") or resource.get("machineIdentifier") or "")
        if not machine_id:
            continue
        server = await db.scalar(
            select(UserPlexServer).where(
                UserPlexServer.user_id == user.id,
                UserPlexServer.machine_identifier == machine_id,
            )
        )
        if server is None:
            server = UserPlexServer(user_id=user.id, machine_identifier=machine_id, name=str(resource.get("name") or "Plex Server"))
            db.add(server)
        server.name = str(resource.get("name") or server.name)
        server.product = resource.get("product")
        server.platform = resource.get("platform")
        server.base_url = _best_connection(resource)
        server.access_token = resource.get("accessToken") or user.plex_auth_token
        server.owned = bool(resource.get("owned"))
        servers.append(server)
        await _safe_progress(progress, "server_found", server_name=server.name, machine_id=machine_id)
    await db.flush()

    # Include DB-only servers that plex.tv didn't return (e.g., temporarily unlisted)
    seen_ids = {s.machine_identifier for s in servers}
    db_servers = (await db.scalars(
        select(UserPlexServer).where(UserPlexServer.user_id == user.id)
    )).all()
    for s in db_servers:
        if s.machine_identifier not in seen_ids and s.base_url:
            servers.append(s)
            await _safe_progress(progress, "server_from_db", server_name=s.name, machine_id=s.machine_identifier)

    return servers


async def discover_plex_libraries(
    db: AsyncSession,
    user: User,
    server: UserPlexServer,
    progress: ProgressCallback | None = None,
) -> list[UserPlexLibrary]:
    token = server.access_token or user.plex_auth_token
    if not token or not server.base_url:
        return []
    data = await _get_json(f"{server.base_url}/library/sections", token)
    libraries: list[UserPlexLibrary] = []
    for item in _container_items(data):
        lib_type = item.get("type")
        if lib_type not in {"movie", "show"}:
            continue
        key = str(item.get("key") or "")
        if not key:
            continue
        library = await db.scalar(
            select(UserPlexLibrary).where(
                UserPlexLibrary.server_id == server.id,
                UserPlexLibrary.section_key == key,
            )
        )
        if library is None:
            library = UserPlexLibrary(user_id=user.id, server_id=server.id, section_key=key, title=str(item.get("title") or "Plex Library"), library_type=lib_type)
            db.add(library)
        library.title = str(item.get("title") or library.title)
        library.library_type = lib_type
        libraries.append(library)
        await _safe_progress(progress, "library_found", server_name=server.name, library_name=library.title, library_type=library.library_type)
    await db.flush()
    return libraries


async def _find_or_seed_media(db: AsyncSession, item: dict, media_type: str, guids: dict[str, str]) -> str:
    # Return existing resolved media if any GUID already matches
    for provider, external_id in guids.items():
        existing = await db.scalar(
            select(ExternalID).where(ExternalID.provider == provider, ExternalID.external_id == external_id)
        )
        if existing and existing.media_item_id is not None:
            return existing.media_item_id

    # Create a stub MediaItem — the TMDB sync task will backfill details later
    title = str(item.get("title") or "Untitled")
    year = item.get("year")
    slug = slugify(f"{title}-{year}") if year else slugify(title)
    media = MediaItem(
        media_type=media_type,
        title=title,
        slug=slug,
        overview=item.get("summary"),
        poster_url=item.get("thumb"),
        release_date=None,
        completeness_score=0.15,
    )
    db.add(media)
    await db.flush()
    if media_type == "movie":
        db.add(Movie(media_item_id=media.id))
    else:
        db.add(Show(media_item_id=media.id))

    # Upsert ExternalIDs: update existing stubs, insert new ones
    for provider, external_id in guids.items():
        ext = await db.scalar(
            select(ExternalID).where(ExternalID.provider == provider, ExternalID.external_id == external_id)
        )
        if ext is not None:
            ext.media_item_id = media.id
        else:
            db.add(ExternalID(provider=provider, external_id=external_id, media_item_id=media.id))
    await db.flush()

    return media.id


async def _upsert_interaction(db: AsyncSession, user_id: str, media_item_id: str, interaction_type: str, extra_data: dict) -> None:
    # Use __table__ (core Table) to bypass ORM attribute resolution — "metadata" is
    # a reserved name on every ORM model and would resolve to MetaData, not the column.
    stmt = pg_insert(UserMediaInteraction.__table__).values({
        "user_id": user_id,
        "media_item_id": media_item_id,
        "interaction_type": interaction_type,
        "metadata": extra_data,
    }).on_conflict_do_update(
        index_elements=["user_id", "media_item_id", "interaction_type"],
        set_={"metadata": extra_data},
    )
    await db.execute(stmt)


async def sync_plex_library(
    db: AsyncSession,
    user: User,
    server: UserPlexServer,
    library: UserPlexLibrary,
    progress: ProgressCallback | None = None,
) -> dict:
    token = server.access_token or user.plex_auth_token
    if not token or not server.base_url:
        return {"total": 0, "matched": 0, "seeded": 0}

    data = await _get_json(f"{server.base_url}/library/sections/{library.section_key}/all?includeGuids=1", token)
    items = [it for it in _container_items(data) if _media_type(it, library.library_type) in {"movie", "show"}]
    items_total = len(items)
    await _safe_progress(progress, "syncing_library", server_name=server.name, library_name=library.title, items_total=items_total)

    total = matched = seeded = 0
    for i, item in enumerate(items):
        media_type = _media_type(item, library.library_type)
        total += 1
        guids = extract_guids(item)
        before = await db.scalar(select(ExternalID).where(
            ExternalID.provider.in_(list(guids.keys()) or ["__none__"]),
            ExternalID.external_id.in_(list(guids.values()) or ["__none__"]),
        ))
        media_item_id = await _find_or_seed_media(db, item, media_type, guids)
        if before:
            matched += 1
        else:
            seeded += 1

        view_count = int(item.get("viewCount") or 0)
        view_offset = item.get("viewOffset")
        viewed = view_count > 0
        stmt = pg_insert(UserPlexItem).values(
            user_id=user.id,
            server_id=server.id,
            library_id=library.id,
            media_item_id=media_item_id,
            rating_key=str(item.get("ratingKey")),
            guid=item.get("guid"),
            media_type=media_type,
            title=str(item.get("title") or "Untitled"),
            year=item.get("year"),
            thumb_url=item.get("thumb"),
            viewed=viewed,
            view_count=view_count,
            view_offset=view_offset,
            duration=item.get("duration"),
            last_viewed_at=_dt_from_plex(item.get("lastViewedAt")),
            guids=guids,
            raw=item,
        ).on_conflict_do_update(
            constraint="uq_user_plex_item",
            set_={
                "library_id": library.id,
                "media_item_id": media_item_id,
                "title": str(item.get("title") or "Untitled"),
                "viewed": viewed,
                "view_count": view_count,
                "view_offset": view_offset,
                "last_viewed_at": _dt_from_plex(item.get("lastViewedAt")),
                "guids": guids,
                "raw": item,
            },
        )
        await db.execute(stmt)
        if media_item_id:
            if viewed:
                await _upsert_interaction(db, user.id, media_item_id, "watched", {"source": "plex", "view_count": view_count})
            if view_offset:
                await _upsert_interaction(db, user.id, media_item_id, "started", {"source": "plex", "view_offset": view_offset, "duration": item.get("duration")})

        if (i + 1) % 5 == 0:
            await _safe_progress(progress, "library_progress", server_name=server.name, library_name=library.title, items_processed=i + 1, items_total=items_total)

    await db.flush()
    await _safe_progress(progress, "library_complete", server_name=server.name, library_name=library.title, total=total, matched=matched, seeded=seeded)
    return {"total": total, "matched": matched, "seeded": seeded}


async def sync_plex_watchlist(
    db: AsyncSession,
    user: User,
    progress: ProgressCallback | None = None,
) -> dict:
    if not user.plex_auth_token:
        return {"total": 0, "matched": 0, "seeded": 0}

    await _safe_progress(progress, "watchlist_sync_start")
    
    url = "https://discover.provider.plex.tv/library/sections/watchlist/all?includeGuids=1"
    try:
        data = await _get_json(url, user.plex_auth_token)
    except Exception as e:
        logger.error("Failed to fetch plex watchlist", user_id=user.id, error=str(e))
        return {"total": 0, "matched": 0, "seeded": 0}

    total = matched = seeded = 0
    items = _container_items(data)
    items_total = len(items)
    
    for i, item in enumerate(items):
        media_type = _media_type(item)
        if media_type not in {"movie", "show"}:
            continue
        total += 1
        guids = extract_guids(item)
        before = await db.scalar(select(ExternalID).where(
            ExternalID.provider.in_(list(guids.keys()) or ["__none__"]),
            ExternalID.external_id.in_(list(guids.values()) or ["__none__"]),
        ))
        media_item_id = await _find_or_seed_media(db, item, media_type, guids)
        if before:
            matched += 1
        else:
            seeded += 1

        added_at = _dt_from_plex(item.get("addedAt"))
        extra_data = {"source": "plex"}
        if added_at:
            extra_data["added_at"] = added_at.isoformat()
            
        await _upsert_interaction(db, user.id, media_item_id, "watchlisted", extra_data)

        if (i + 1) % 5 == 0:
            await _safe_progress(progress, "watchlist_progress", items_processed=i + 1, items_total=items_total)

    await db.flush()
    await _safe_progress(progress, "watchlist_complete", total=total, matched=matched, seeded=seeded)
    return {"total": total, "matched": matched, "seeded": seeded}


async def sync_plex(
    db: AsyncSession,
    user: User,
    progress: ProgressCallback | None = None,
) -> dict:
    servers = await discover_plex_servers(db, user, progress=progress)
    logger.info("plex sync discovered servers", count=len(servers), names=[s.name for s in servers])
    summary = {"servers": len(servers), "libraries": 0, "total": 0, "matched": 0, "seeded": 0}
    failed_servers: list[str] = []
    for server in servers:
        logger.info("plex sync processing server", name=server.name, base_url=server.base_url)
        try:
            libraries = await discover_plex_libraries(db, user, server, progress=progress)
        except Exception:
            logger.warning("plex server unreachable, skipping",
                           server_name=server.name, machine_id=server.machine_identifier, exc_info=True)
            failed_servers.append(server.name)
            continue
        summary["libraries"] += len(libraries)
        for library in libraries:
            if not library.selected:
                continue
            try:
                result = await sync_plex_library(db, user, server, library, progress=progress)
            except Exception:
                logger.warning("plex library sync failed, skipping",
                               server_name=server.name, library_title=library.title, exc_info=True)
                await db.rollback()
                continue
            for key in ("total", "matched", "seeded"):
                summary[key] += result[key]

    wl_result = await sync_plex_watchlist(db, user, progress=progress)
    for key in ("total", "matched", "seeded"):
        summary[key] += wl_result[key]

    logger.info("plex sync complete", summary=summary)
    if failed_servers:
        summary["failed_servers"] = failed_servers

    await db.commit()
    logger.info("plex sync completed", user_id=user.id, **summary)
    await _safe_progress(progress, "sync_complete", **summary)
    return summary


async def get_plex_sessions(
    db: AsyncSession,
    user: User,
) -> list[dict]:
    """Return active playback sessions across all of a user's Plex servers."""
    if not user.plex_auth_token:
        return []

    servers_result = await db.scalars(
        select(UserPlexServer).where(
            UserPlexServer.user_id == user.id,
            UserPlexServer.selected == True,
        )
    )
    servers = list(servers_result)

    all_sessions: list[dict] = []
    for server in servers:
        if not server.base_url or not server.access_token:
            continue
        try:
            data = await _get_json(
                f"{server.base_url}/status/sessions",
                server.access_token,
            )
        except Exception:
            logger.warning("failed to fetch plex sessions", server_name=server.name)
            continue

        container = data.get("MediaContainer", data)
        items = _as_list(container.get("Metadata", []))
        for item in items:
            media_type = item.get("type", "")
            if media_type not in ("movie", "episode", "track"):
                continue

            user_info = item.get("User") or {}
            player_info = item.get("Player") or {}
            session_info = item.get("Session") or {}

            def _full_thumb(raw: str | None) -> str | None:
                if not raw:
                    return None
                url = raw
                if url.startswith("/"):
                    url = f"{server.base_url}{url}"
                if server.access_token:
                    url = f"{url}{'&' if '?' in url else '?'}X-Plex-Token={server.access_token}"
                return url

            # Extract stream/transcode info from first Media part
            media_parts = _as_list(item.get("Media", []))
            media_info = media_parts[0] if media_parts else {}
            transcode = item.get("TranscodeSession") or {}
            transcode_reason = transcode.get("transcodeReason") or None

            all_sessions.append({
                "session_id": session_info.get("id", str(item.get("ratingKey", ""))),
                "media_type": media_type,
                "title": item.get("title", ""),
                "grandparent_title": item.get("grandparentTitle"),
                "parent_title": item.get("parentTitle"),
                "index": item.get("index"),
                "thumb": _full_thumb(item.get("thumb")),
                "duration": item.get("duration"),
                "view_offset": item.get("viewOffset"),
                "state": player_info.get("state", "paused"),
                "user_name": user_info.get("title", "Unknown"),
                "user_thumb": _full_thumb(user_info.get("thumb")),
                "player_title": player_info.get("title"),
                "player_device": player_info.get("device") or None,
                "player_platform": player_info.get("platform") or None,
                "server_name": server.name,
                "server_id": server.machine_identifier,
                "library_section": item.get("librarySectionTitle"),
                "year": item.get("year"),
                "content_rating": item.get("contentRating"),
                "summary": item.get("summary"),
                "video_resolution": media_info.get("videoResolution"),
                "video_codec": media_info.get("videoCodec"),
                "audio_codec": media_info.get("audioCodec"),
                "audio_channels": media_info.get("audioChannels"),
                "bitrate": media_info.get("bitrate"),
                "video_decision": transcode.get("videoDecision") or "direct play",
                "audio_decision": transcode.get("audioDecision") or "direct play",
                "transcode_reason": transcode_reason,
                "throttled": transcode.get("throttled") == "1" if transcode else False,
            })

    return all_sessions

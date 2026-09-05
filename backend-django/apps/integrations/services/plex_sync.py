"""Plex library user-sync engine (registered under provider ``plex``).

Port of the legacy ``plex_sync_service.sync_plex`` / ``sync_plex_library``
orchestration, reusing the already-ported discovery (``apps.integrations...plex``)
and match/seed helpers (``apps.integrations...plex_watchlist``). Two entry modes
keyed off the ``SyncJob``: a full-user sync (``entity_type="user"``) discovers
the user's servers + selected libraries and scans each; a single-library sync
(``entity_type="library"``, ``external_id`` = ``UserPlexLibrary`` pk) scans just
that library off its stored server row.

Per library it fetches the section's items with ``X-Plex-Container-Start/Size``
paging, then for each movie/show/album either resolves an existing catalog
``MediaItem`` (via the recorded plex guid, then third-party guids) or seeds a
stub subtype row, upserts the raw ``UserPlexItem`` row, and writes the user
interactions the library implies (movie ``watched``, any ``started`` on a
view offset, music ``listened`` for actual listens). Each library runs in its
own transaction so a bad library never rolls the job back; ``library_id`` /
single-server failure is caught and surfaced on the summary. Episodes are never
returned by a section ``/all`` fetch (it filters to movie/show/music), so they
are skipped here.

Interactions mirror the legacy behaviour. Catalog-depth enrichment the
legacy folded into the loop — album metadata hydration, person/genre/label
creation, plex ``userRating`` -> ratings, Track backfill, and the final
episode-driven show ``watched`` recompute — is deferred: the match/seed layer
reuses the stub-seeding convention from the watchlist route (completeness 0.15,
`next_sync_at`), and raw plex payloads are preserved in ``UserPlexItem.raw`` for
later backfill. The watchlist is *not* re-synced here — Django exposes it as its
own POST route.
"""

from __future__ import annotations

import json
import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.integrations.models import SyncJob, UserPlexItem, UserPlexLibrary
from apps.integrations.services import plex as _plex
from apps.integrations.services.plex_watchlist import (
    _dt_from_plex,
    _find_media_id,
    _media_content_type,
    _parse_plex_date,
    _upsert_external,
    extract_guids,
)
from apps.integrations.services.sync import register_sync_engine
from apps.media.models import Album, MediaItem, Movie, Show
from apps.media.services.interaction import set_interaction
from core import progress as progress_lib

logger = logging.getLogger(__name__)

User = get_user_model()

NO_PLEX_TOKEN_ERROR = "No valid Plex token. Please reconnect your Plex account."
LIBRARY_NOT_FOUND_ERROR = "Plex library not found"

_PLEX_PAGE_SIZE = 200


def _media_type(item: dict, library_type: str | None = None) -> str | None:
    """Map a Plex item/library type onto an Otix ``media_type`` (``None`` if unknown)."""
    plex_type = item.get("type") or library_type
    if plex_type == "movie":
        return "movie"
    if plex_type in {"show", "season", "episode"}:
        return "show"
    if plex_type in {"track", "album", "artist"}:
        return "music"
    return None


def _child_count(item: dict) -> int | None:
    if not item.get("childCount"):
        return None
    try:
        return int(item["childCount"])
    except (TypeError, ValueError):
        return None


def _match_or_seed(
    item: dict,
    media_type: str,
    guids: dict[str, str],
    plex_guid: str | None,
    *,
    child_count: int | None = None,
) -> tuple[int, bool]:
    """Resolve a Plex item to a ``MediaItem`` id, seeding a stub subtype if new.

    Returns ``(media_item_id, was_matched)`` — True when the item resolved to an
    existing catalog entry (recorded plex guid, then third-party guids), False
    when a new stub row was created. Mirrors the watchlist seed helper but also
    creates the ``Album`` subtype for music.
    """
    media_ct = _media_content_type()
    if plex_guid:
        media_id = _find_media_id(media_ct, "plex", plex_guid, media_type=None)
        if media_id is not None:
            return media_id, True

    for provider, external_id in guids.items():
        media_id = _find_media_id(media_ct, provider, external_id, media_type=media_type)
        if media_id is not None:
            if plex_guid:
                _upsert_external(media_ct, media_id, "plex", plex_guid, None)
            return media_id, True

    title = str(item.get("title") or "Untitled").strip()
    year = item.get("year")
    slug = slugify(f"{title}-{year}") if year else slugify(title)
    media = MediaItem.objects.create(
        media_type=media_type,
        title=title,
        slug=slug or slugify(media_type),
        overview=item.get("summary"),
        release_date=_parse_plex_date(item.get("originallyAvailableAt")),
        completeness_score=0.15,
        next_sync_at=timezone.now(),
    )
    if media_type == "movie":
        Movie.objects.create(media_item=media)
    elif media_type == "music":
        Album.objects.create(media_item=media, track_count=child_count or 0)
    else:
        Show.objects.create(media_item=media)
    for provider, external_id in guids.items():
        _upsert_external(media_ct, media.pk, provider, external_id, media_type)
    if plex_guid:
        _upsert_external(media_ct, media.pk, "plex", plex_guid, None)
    return media.pk, False


def _page_json(url: str, token: str) -> dict | None:
    """GET one Plex page, returning parsed JSON (``None`` on any failure)."""
    try:
        status, raw = _plex._request(
            _plex._with_token(url, token),
            headers=_plex._plex_headers(),
            timeout=60.0,
        )
    except Exception:  # noqa: BLE001 - a fetch failure just skips the library
        return None
    if status != 200:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def _fetch_library_items(
    user, server, library, token: str
) -> list[dict] | None:
    """Fetch one library's movie/show/music items via paged section ``/all``."""
    if not token or not server.base_url:
        return None
    prefix = f"{server.base_url}/library/sections/{library.section_key}/all"
    extra = "&type=9" if library.library_type == "artist" else ""
    all_items: list[dict] = []
    offset = 0
    while True:
        url = (
            f"{prefix}?includeGuids=1{extra}"
            f"&X-Plex-Container-Start={offset}"
            f"&X-Plex-Container-Size={_PLEX_PAGE_SIZE}"
        )
        data = _page_json(url, token)
        if data is None:
            return None
        container = data.get("MediaContainer", data)
        page = _plex._container_items(data)
        all_items.extend(page)
        total_size = int(container.get("totalSize", 0))
        offset += _PLEX_PAGE_SIZE
        if offset >= total_size or not page:
            break
    return [
        item
        for item in all_items
        if _media_type(item, library.library_type) in {"movie", "show", "music"}
    ]


def _upsert_item(user, server, library, item, media_type, media_item_id, guids) -> None:
    UserPlexItem.objects.update_or_create(
        server=server,
        rating_key=str(item.get("ratingKey")),
        defaults={
            "user": user,
            "library": library,
            "media_item_id": media_item_id,
            "guid": item.get("guid"),
            "media_type": media_type,
            "title": str(item.get("title") or "Untitled"),
            "year": item.get("year"),
            "thumb_url": item.get("thumb"),
            "viewed": int(item.get("viewCount") or 0) > 0,
            "view_count": int(item.get("viewCount") or 0),
            "view_offset": item.get("viewOffset"),
            "duration": item.get("duration"),
            "last_viewed_at": _dt_from_plex(item.get("lastViewedAt")),
            "guids": guids,
            "raw": item,
        },
    )


def _apply_interactions(user, item, media_type, media_item_id) -> None:
    """Write the user interactions a library item implies (plex ``source``)."""
    view_count = int(item.get("viewCount") or 0)
    view_offset = item.get("viewOffset")

    if media_type == "music":
        last_listened = item.get("lastViewedAt")
        if view_count > 0 or last_listened is not None:
            extra: dict = {"source": "plex", "view_count": view_count}
            listened_dt = _dt_from_plex(last_listened)
            if listened_dt:
                extra["last_played_at"] = listened_dt.isoformat()
            added_dt = _dt_from_plex(item.get("addedAt"))
            if added_dt:
                extra["added_to_library_at"] = added_dt.isoformat()
            parent_title = item.get("parentTitle")
            if parent_title:
                extra["artist_name"] = parent_title
            set_interaction(user, media_item_id, "listened", extra)
    elif media_type == "movie" and view_count > 0:
        set_interaction(
            user, media_item_id, "watched", {"source": "plex", "view_count": view_count}
        )

    if view_offset:
        set_interaction(
            user,
            media_item_id,
            "started",
            {"source": "plex", "view_offset": view_offset, "duration": item.get("duration")},
        )


def _sync_library(user, server, library, token: str, emit) -> dict:
    """Scan one library: seed/match items, upsert rows, write interactions."""
    items = _fetch_library_items(user, server, library, token)
    if items is None:
        return {"total": 0, "matched": 0, "seeded": 0}

    emit(
        "syncing_library",
        server_name=server.name,
        library_name=library.title,
        items_total=len(items),
    )

    total = matched = seeded = 0
    with transaction.atomic():
        for i, item in enumerate(items):
            media_type = _media_type(item, library.library_type)
            if media_type is None or item.get("type") == "episode":
                # Episodes are never returned by a section /all fetch; they are
                # handled by watch-history scans, not this library walk.
                continue
            total += 1
            plex_guid = str(item["guid"]) if item.get("guid") is not None else None
            guids = extract_guids(item)
            media_item_id, was_matched = _match_or_seed(
                item,
                media_type,
                guids,
                plex_guid,
                child_count=_child_count(item),
            )
            if was_matched:
                matched += 1
            else:
                seeded += 1
            _upsert_item(user, server, library, item, media_type, media_item_id, guids)
            _apply_interactions(user, item, media_type, media_item_id)
            if (i + 1) % 5 == 0:
                emit(
                    "library_progress",
                    server_name=server.name,
                    library_name=library.title,
                    items_processed=i + 1,
                    items_total=len(items),
                )

    emit(
        "library_complete",
        server_name=server.name,
        library_name=library.title,
        total=total,
        matched=matched,
        seeded=seeded,
    )
    return {"total": total, "matched": matched, "seeded": seeded}


@register_sync_engine("plex")
def sync_plex_engine(job: SyncJob) -> dict:
    """Run a Plex sync job end to end; return its summary or a handled error.

    A full-user job discovers servers + selected libraries; a single-library job
    (``entity_type="library"``) scans just the ``UserPlexLibrary`` whose pk is in
    ``external_id``. Each library sync is isolated so one failure never fails the
    job; failures are counted on the summary. Returns ``{"error": ...}`` only
    when the job cannot proceed at all (no user, no token, unreachable discovery,
    library gone) — the orchestrator turns that into an ``error`` terminal frame.
    """
    task_id = str(job.pk)
    progress = progress_lib.plex_progress

    def emit(event_type: str, **data) -> None:
        progress.publish(task_id, event_type, **data)
        progress.store_progress(task_id, event_type, **data)

    single = job.entity_type == "library"
    if single:
        library = (
            UserPlexLibrary.objects.select_related("server__user")
            .filter(pk=job.external_id)
            .first()
        )
        if library is None:
            return {"error": LIBRARY_NOT_FOUND_ERROR}
        user = library.server.user
    else:
        user = User.objects.filter(pk=job.external_id).first()
        library = None

    if user is None:
        return {"error": NO_PLEX_TOKEN_ERROR}

    summary: dict = {"servers": 0, "libraries": 0, "total": 0, "matched": 0, "seeded": 0}
    plans: list = []

    if single:
        token = library.server.access_token or user.plex_auth_token
        if not token:
            return {"error": NO_PLEX_TOKEN_ERROR}
        summary["servers"] = 1
        summary["libraries"] = 1
        plans = [(library.server, library, token)]
    else:
        if not user.plex_auth_token:
            return {"error": NO_PLEX_TOKEN_ERROR}
        try:
            servers = _plex.discover_plex_servers(user)
        except Exception as exc:  # noqa: BLE001 - surface the typed discovery error
            logger.exception("plex engine discovery failed user=%s", user.id)
            return {"error": str(exc)}
        summary["servers"] = len(servers)
        failed_servers: list[str] = []
        for server in servers:
            try:
                libs = _plex.discover_plex_libraries(user, server)
            except Exception:  # noqa: BLE001 - one unreachable server shouldn't abort
                logger.warning("plex engine could not list libraries server=%s", server.name)
                failed_servers.append(server.name)
                continue
            summary["libraries"] += len(libs)
            for lib in libs:
                if lib.selected:
                    plans.append((server, lib, server.access_token or user.plex_auth_token))
        if failed_servers:
            summary["failed_servers"] = failed_servers

    for server, lib, token in plans:
        try:
            result = _sync_library(user, server, lib, token, emit)
        except Exception:  # noqa: BLE001 - one library failure must not fail the job
            logger.exception(
                "plex engine library failed server=%s library=%s",
                server.name,
                lib.title,
            )
            continue
        for key in ("total", "matched", "seeded"):
            summary[key] += result[key]

    return summary

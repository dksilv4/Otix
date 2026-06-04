from __future__ import annotations

import asyncio
import re
import urllib.parse
from datetime import date, datetime, timezone
from collections.abc import Callable, Coroutine
from typing import Any
from uuid import uuid4

import httpx
import structlog
from sqlalchemy import select, or_, and_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.company import Company, InvolvedCompany
from otix.domain.episode_interaction import UserEpisodeInteraction
from otix.domain.genre import Genre, MediaGenre
from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import Album, Episode, ExternalID, MediaItem, Movie, Season, Show, Track, UserPlexItem, UserPlexLibrary, UserPlexServer
from otix.domain.people import MediaCredit, Person
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
    # Prefer non-local (public/relay) HTTPS connections — Docker containers often
    # cannot reach local-network IPs embedded in .plex.direct hostnames.
    for conn in connections:
        uri = conn.get("uri")
        if uri and str(uri).startswith("https://") and not conn.get("local"):
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


def _parse_guid_id(value: str) -> tuple[str, str] | None:
    lower = value.lower()
    patterns = [
        ("imdb", r"(tt\d+)"),
        ("tmdb", r"tmdb://(\d+)|themoviedb://(\d+)"),
        ("tvdb", r"tvdb://(\d+)"),
        ("musicbrainz", r"mbid://([a-f0-9-]{36})"),
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
    if plex_type in {"track", "album", "artist"}:
        return "music"
    return None


def _dt_from_plex(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


async def _get_json(url: str, token: str, timeout: float = 30.0) -> dict:
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
    async with httpx.AsyncClient(timeout=timeout) as client:
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
        if lib_type not in {"movie", "show", "artist"}:
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


def _parse_date(value: Any) -> date | None:
    """Parse a Plex date string (YYYY-MM-DD) into a Python date."""
    if value is None:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _resolve_plex_thumb(raw: str | None, base_url: str | None) -> str | None:
    """Convert a Plex-relative thumb path to an absolute URL (no token)."""
    if not raw or not base_url:
        return raw
    if raw.startswith("/"):
        return f"{base_url}{raw}"
    return raw


async def _fuzzy_match_album(
    db: AsyncSession,
    title: str,
    artist_name: str | None,
    guids: dict[str, str],
) -> str | None:
    """Try to find an existing music album by title + artist similarity.

    Uses pg_trgm similarity on title and MediaCredit role='primary' for the
    artist match. Returns the media_item_id if a confident match is found,
    or None if no match exceeds the threshold.
    """
    from sqlalchemy import func, or_

    # Don't match based on very short or generic titles
    if len(title) < 3:
        return None

    # If we have a musicbrainz GUID, trust it directly (should've been caught
    # by the GUID check above, but double-check here for safety)
    mbid = guids.get("musicbrainz")
    if mbid:
        existing = await db.scalar(
            select(ExternalID).where(
                ExternalID.provider == "musicbrainz",
                ExternalID.external_id == mbid,
            )
        )
        if existing and existing.media_item_id is not None:
            return existing.media_item_id

    # Build candidate query: music items with similar titles
    similarity_threshold = 0.35
    candidates_query = (
        select(MediaItem.id, MediaItem.title, Person.name, func.similarity(MediaItem.title, title).label("sim"))
        .join(Album, Album.media_item_id == MediaItem.id)
        .outerjoin(MediaCredit, (MediaCredit.media_item_id == MediaItem.id) & (MediaCredit.role == "primary"))
        .outerjoin(Person, Person.id == MediaCredit.person_id)
        .where(
            MediaItem.media_type == "music",
            func.similarity(MediaItem.title, title) >= similarity_threshold,
        )
        .order_by(func.similarity(MediaItem.title, title).desc())
        .limit(10)
    )

    result = await db.execute(candidates_query)
    rows = result.all()

    if not rows:
        return None

    best_id: str | None = None
    best_score: float = 0.0

    for row in rows:
        candidate_id, candidate_title, candidate_artist, sim = row

        # Score: title similarity weighted + artist match bonus
        score = sim

        if artist_name and candidate_artist:
            # Case-insensitive artist comparison
            if artist_name.lower() == candidate_artist.lower():
                score += 0.4  # exact artist match
            elif artist_name.lower() in candidate_artist.lower() or candidate_artist.lower() in artist_name.lower():
                score += 0.2  # partial artist match

        if score > best_score:
            best_score = score
            best_id = candidate_id

    # Require a high combined score for auto-match
    # 0.75 = near-exact title match + exact artist, or very close title + partial artist
    if best_id and best_score >= 0.70:
        logger.info(
            "plex fuzzy matched album",
            plex_title=title,
            plex_artist=artist_name,
            matched_id=best_id,
            score=round(best_score, 3),
        )
        return best_id

    return None


async def _find_or_seed_media(
    db: AsyncSession,
    item: dict,
    media_type: str,
    guids: dict[str, str],
    *,
    release_date_str: str | None = None,
    child_count: int | None = None,
    plex_guid: str | None = None,
    artist_name: str | None = None,
) -> str:
    eid_svc = ExternalIDService(db)
    # Check Plex GUID first — fast path for re-syncs
    if plex_guid:
        existing = await db.scalar(
            select(ExternalID).where(
                ExternalID.provider == "plex",
                ExternalID.external_id == plex_guid,
                or_(
                    ExternalID.entity_type == "media_item",
                    and_(
                        ExternalID.entity_type.is_(None),
                        ExternalID.media_type.in_(["movie", "show", "game", "music"]),
                    ),
                ),
            )
        )
        if existing and existing.media_item_id is not None:
            return existing.media_item_id

    # Return existing resolved media if any GUID already matches
    for provider, external_id in guids.items():
        existing = await db.scalar(
            select(ExternalID).where(
                ExternalID.provider == provider,
                ExternalID.external_id == external_id,
                or_(
                    ExternalID.entity_type == "media_item",
                    and_(
                        ExternalID.entity_type.is_(None),
                        ExternalID.media_type.in_(["movie", "show", "game", "music"]),
                    ),
                ),
            )
        )
        if existing and existing.media_item_id is not None:
            return existing.media_item_id

    # For music: try fuzzy title+artist match against existing catalog before
    # creating a stub. This prevents duplicates when Plex provides no GUIDs.
    title = str(item.get("title") or "Untitled")
    if media_type == "music" and title != "Untitled":
        match_id = await _fuzzy_match_album(db, title, artist_name, guids)
        if match_id is not None:
            # Link this Plex item to the existing catalog entry
            if plex_guid:
                await eid_svc.upsert("plex", plex_guid, "media_item", match_id)
            # Also link any GUIDs we didn't already have
            for provider, external_id in guids.items():
                await eid_svc.upsert(provider, external_id, "media_item", match_id)
            await db.flush()
            return match_id

    # Create a stub MediaItem — the catalog hydration cycle will backfill details
    year = item.get("year")
    slug = slugify(f"{title}-{year}") if year else slugify(title)
    release_date = _parse_date(release_date_str or item.get("originallyAvailableAt"))
    media = MediaItem(
        media_type=media_type,
        title=title,
        slug=slug,
        overview=item.get("summary"),
        release_date=release_date,
        completeness_score=0.15,
        next_sync_at=datetime.now(timezone.utc),
    )
    db.add(media)
    await db.flush()
    if media_type == "movie":
        db.add(Movie(media_item_id=media.id))
    elif media_type == "music":
        mbid = guids.get("musicbrainz")
        db.add(Album(
            media_item_id=media.id,
            musicbrainz_id=mbid,
            track_count=child_count or 0,
        ))
    else:
        db.add(Show(media_item_id=media.id))

    # Upsert ExternalIDs: update existing stubs, insert new ones
    for provider, external_id in guids.items():
        await eid_svc.upsert(provider, external_id, "media_item", media.id)

    # Stamp a Plex ExternalID so this item is discoverable via the standard
    # external_ids table (enables cross-platform overlap queries, etc.)
    if plex_guid:
        await eid_svc.upsert("plex", plex_guid, "media_item", media.id)

    await db.flush()

    return media.id


def _tag_list(item: dict, key: str) -> list[str]:
    """Extract Plex tag objects like Genre, Mood, Style into a list of tag names."""
    tags = _as_list(item.get(key))
    return [t["tag"] for t in tags if isinstance(t, dict) and t.get("tag")]


def _make_oti_id() -> str:
    return f"oti_{uuid4().hex[:12]}"


async def _get_or_create_person_by_name(db: AsyncSession, name: str) -> Person:
    """Find or create a Person by name (case-insensitive). Used for Plex-sourced artists."""
    from sqlalchemy import func as sa_func

    person = await db.scalar(
        select(Person).where(sa_func.lower(Person.name) == name.lower())
    )
    if person is not None:
        return person
    person = Person(id=_make_oti_id(), name=name)
    db.add(person)
    await db.flush()
    return person


async def _get_or_create_genre_by_name(db: AsyncSession, name: str) -> Genre:
    """Get or create a Genre, safe for concurrent Plex syncs."""
    genre_slug = slugify(name)
    genre = await db.scalar(select(Genre).where(Genre.slug == genre_slug))
    if genre is not None:
        return genre
    await db.execute(
        pg_insert(Genre).values(id=_make_oti_id(), name=name, slug=genre_slug)
        .on_conflict_do_nothing(constraint="genres_slug_key")
    )
    return await db.scalar(select(Genre).where(Genre.slug == genre_slug))


async def _get_or_create_label(db: AsyncSession, name: str) -> Company:
    """Get or create a Company (label), safe for concurrent Plex syncs."""
    label_slug = slugify(name)
    company = await db.scalar(select(Company).where(Company.slug == label_slug))
    if company is not None:
        return company
    await db.execute(
        pg_insert(Company).values(id=_make_oti_id(), name=name, slug=label_slug)
        .on_conflict_do_nothing(constraint="companies_slug_key")
    )
    return await db.scalar(select(Company).where(Company.slug == label_slug))


async def _hydrate_album_from_plex(
    db: AsyncSession,
    media_item_id: str,
    item: dict,
) -> None:
    """Extract and persist all available music metadata from a Plex album item.

    Covers: artist (parentTitle), genres/moods/styles, studio/label, duration.
    Uses check-then-insert so concurrent syncs won't duplicate data.
    """
    # ── Artist ──────────────────────────────────────────────────────
    parent_title = item.get("parentTitle")
    if parent_title and isinstance(parent_title, str) and parent_title.strip():
        person = await _get_or_create_person_by_name(db, parent_title.strip())
        exists = await db.scalar(
            select(MediaCredit).where(
                MediaCredit.media_item_id == media_item_id,
                MediaCredit.person_id == person.id,
                MediaCredit.role == "primary",
            )
        )
        if not exists:
            db.add(MediaCredit(
                id=_make_oti_id(),
                media_item_id=media_item_id,
                person_id=person.id,
                role="primary",
            ))

    # ── Genres / Moods / Styles ─────────────────────────────────────
    all_tags: list[str] = []
    for tag_key in ("Genre", "Mood", "Style"):
        all_tags.extend(_tag_list(item, tag_key))

    seen_slugs: set[str] = set()
    for tag_name in all_tags:
        gen_slug = slugify(tag_name)
        if gen_slug in seen_slugs:
            continue
        seen_slugs.add(gen_slug)
        genre = await _get_or_create_genre_by_name(db, tag_name)
        exists = await db.scalar(
            select(MediaGenre).where(
                MediaGenre.media_item_id == media_item_id,
                MediaGenre.genre_id == genre.id,
            )
        )
        if not exists:
            db.add(MediaGenre(media_item_id=media_item_id, genre_id=genre.id))

    # ── Studio / Label ──────────────────────────────────────────────
    studio = item.get("studio")
    if studio and isinstance(studio, str) and studio.strip():
        company = await _get_or_create_label(db, studio.strip())
        exists = await db.scalar(
            select(InvolvedCompany).where(
                InvolvedCompany.media_item_id == media_item_id,
                InvolvedCompany.company_id == company.id,
            )
        )
        if not exists:
            db.add(InvolvedCompany(
                id=_make_oti_id(),
                media_item_id=media_item_id,
                company_id=company.id,
                production=True,
            ))

    # ── Album duration ──────────────────────────────────────────────
    duration = item.get("duration")
    if duration is not None:
        try:
            duration_ms = int(duration)
            if duration_ms > 0:
                album = await db.get(Album, media_item_id)
                if album and not album.duration_ms:
                    album.duration_ms = duration_ms
        except (TypeError, ValueError):
            pass

    # ── Bump completeness score ─────────────────────────────────────
    media = await db.get(MediaItem, media_item_id)
    if media and media.completeness_score < 0.5:
        media.completeness_score = 0.5

    await db.flush()


async def _hydrate_album_tracks_from_plex(
    db: AsyncSession,
    user: User,
    server: UserPlexServer,
    media_item_id: str,
) -> int:
    """Fetch track children from Plex and create Track records.

    Returns the number of tracks created.
    """
    # Skip if album already has tracks populated.
    existing_track = await db.scalar(
        select(Track).where(Track.album_id == media_item_id).limit(1)
    )
    if existing_track is not None:
        return 0

    token = server.access_token or user.plex_auth_token
    if not token or not server.base_url:
        return 0

    plex_item = await db.scalar(
        select(UserPlexItem).where(
            UserPlexItem.user_id == user.id,
            UserPlexItem.media_item_id == media_item_id,
            UserPlexItem.media_type == "music",
        )
    )
    if plex_item is None:
        return 0

    try:
        data = await asyncio.wait_for(
            _get_json(
                f"{server.base_url}/library/metadata/{plex_item.rating_key}/children",
                token,
            ),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        logger.warning("timed out fetching plex album children", rating_key=plex_item.rating_key)
        return 0
    except Exception:
        logger.warning("failed to fetch plex album children", rating_key=plex_item.rating_key, exc_info=True)
        return 0

    # Batch-load existing tracks for this album to avoid N+1 per-track queries
    existing_tracks = (await db.scalars(
        select(Track).where(Track.album_id == media_item_id)
    )).all()
    existing_by_key = {(t.disc_number, t.track_number): t for t in existing_tracks}

    created = 0
    for idx, child in enumerate(_container_items(data)):
        track_number = child.get("index")
        if track_number is None:
            track_number = idx + 1
        try:
            track_number = int(track_number)
        except (TypeError, ValueError):
            continue

        title = str(child.get("title") or f"Track {track_number}")
        disc_number = int(child.get("parentIndex") or 1)
        duration = child.get("duration")

        key = (disc_number, track_number)
        existing = existing_by_key.get(key)
        if existing is not None:
            if not existing.duration_ms and duration:
                existing.duration_ms = int(duration)
            continue

        track = Track(
            id=_make_oti_id(),
            album_id=media_item_id,
            track_number=track_number,
            disc_number=disc_number,
            title=title,
            duration_ms=int(duration) if duration else None,
        )
        db.add(track)
        existing_by_key[key] = track
        created += 1

    if created:
        await db.flush()
        # Update album track count
        album = await db.get(Album, media_item_id)
        if album:
            result = await db.execute(
                select(Track).where(Track.album_id == media_item_id)
            )
            album.track_count = len(list(result.scalars().all()))

    return created


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


async def _upsert_episode_interaction(db: AsyncSession, user_id: str, episode_id: str) -> None:
    stmt = pg_insert(UserEpisodeInteraction.__table__).values({
        "user_id": user_id,
        "episode_id": episode_id,
    }).on_conflict_do_nothing()
    await db.execute(stmt)


async def _resolve_episode(
    db: AsyncSession,
    grandparent_guids: dict[str, str],
    parent_index: int,
    episode_index: int,
) -> tuple[str | None, str | None]:
    """Resolve a Plex episode to a catalog Episode and its parent show MediaItem.

    Returns (episode_id, show_media_item_id) or (None, None).
    """
    # Find the show via grandparent GUIDs
    show_media_id = None
    for provider, external_id in grandparent_guids.items():
        ext = await db.scalar(
            select(ExternalID).where(
                ExternalID.provider == provider,
                ExternalID.external_id == external_id,
            )
        )
        if ext and ext.media_item_id:
            show_media_id = ext.media_item_id
            break

    if show_media_id is None:
        return None, None

    # Find the season
    season = await db.scalar(
        select(Season).where(
            Season.show_id == show_media_id,
            Season.season_number == parent_index,
        )
    )
    if season is None:
        return None, show_media_id

    # Find the episode
    episode = await db.scalar(
        select(Episode).where(
            Episode.season_id == season.id,
            Episode.episode_number == episode_index,
        )
    )
    if episode is None:
        from otix.domain.base import gen_otix_id
        episode = Episode(
            id=gen_otix_id(),
            season_id=season.id,
            episode_number=episode_index,
            name=None,
            overview=None,
            runtime=None,
            air_date=None,
            still_url=None,
        )
        db.add(episode)
        await db.flush()

    return episode.id, show_media_id


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

    # Music libraries return artists by default; use type=9 to get albums directly
    extra_params = "&type=9" if library.library_type == "artist" else ""
    data = await _get_json(f"{server.base_url}/library/sections/{library.section_key}/all?includeGuids=1{extra_params}", token)
    items = [it for it in _container_items(data) if _media_type(it, library.library_type) in {"movie", "show", "music"}]
    items_total = len(items)
    await _safe_progress(progress, "syncing_library", server_name=server.name, library_name=library.title, items_total=items_total)

    total = matched = seeded = 0
    for i, item in enumerate(items):
        media_type = _media_type(item, library.library_type)
        total += 1
        guids = extract_guids(item)

        plex_item_type = item.get("type")

        # Episode handling: resolve to catalog hierarchy and track per-episode
        if plex_item_type == "episode" and user.plex_watch_history_enabled:
            grandparent_guid_str = item.get("grandparentGuid")
            grandparent_guids = extract_guids({"guid": grandparent_guid_str, "Guid": item.get("GrandparentGuid")} if grandparent_guid_str else {})
            parent_index = item.get("parentIndex")
            episode_index = item.get("index")

            if grandparent_guids and parent_index is not None and episode_index is not None:
                episode_id, show_media_id = await _resolve_episode(
                    db, grandparent_guids, int(parent_index), int(episode_index)
                )
                if episode_id and show_media_id:
                    view_count = int(item.get("viewCount") or 0)
                    if view_count > 0:
                        await _upsert_episode_interaction(db, user.id, episode_id)
                    matched += 1

                    # Track in UserPlexItem under the show's MediaItem
                    stmt = pg_insert(UserPlexItem).values(
                        user_id=user.id,
                        server_id=server.id,
                        library_id=library.id,
                        media_item_id=show_media_id,
                        rating_key=str(item.get("ratingKey")),
                        guid=item.get("guid"),
                        media_type="show",
                        title=str(item.get("grandparentTitle") or item.get("title") or "Untitled"),
                        year=item.get("year"),
                        thumb_url=item.get("thumb"),
                        viewed=view_count > 0,
                        view_count=view_count,
                        view_offset=item.get("viewOffset"),
                        duration=item.get("duration"),
                        last_viewed_at=_dt_from_plex(item.get("lastViewedAt")),
                        guids=grandparent_guids,
                        raw=item,
                    ).on_conflict_do_update(
                        constraint="uq_user_plex_item",
                        set_={
                            "library_id": library.id,
                            "media_item_id": show_media_id,
                            "title": str(item.get("grandparentTitle") or item.get("title") or "Untitled"),
                            "viewed": view_count > 0,
                            "view_count": view_count,
                            "view_offset": item.get("viewOffset"),
                            "last_viewed_at": _dt_from_plex(item.get("lastViewedAt")),
                            "guids": grandparent_guids,
                            "raw": item,
                        },
                    )
                    await db.execute(stmt)

                    if (i + 1) % 5 == 0:
                        await _safe_progress(progress, "library_progress", server_name=server.name, library_name=library.title, items_processed=i + 1, items_total=items_total)
                    continue
            # Fall through to normal handling if episode resolution failed

        before = await db.scalar(select(ExternalID).where(
            ExternalID.provider.in_(list(guids.keys()) or ["__none__"]),
            ExternalID.external_id.in_(list(guids.values()) or ["__none__"]),
        ))
        child_count = int(item.get("childCount")) if item.get("childCount") else None
        # Don't pass Plex thumb URL as poster_url — Plex URLs require auth
        # tokens that browser <img> tags cannot send. The hydration pipeline
        # (TMDB / Fanart / MusicBrainz) will provide publicly-accessible URLs.
        media_item_id = await _find_or_seed_media(
            db, item, media_type, guids,
            child_count=child_count,
            plex_guid=item.get("guid"),
            artist_name=item.get("parentTitle") if media_type == "music" else None,
        )
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
            if media_type == "music":
                parent_title = item.get("parentTitle")
                last_listened = item.get("lastViewedAt")
                added_at = _dt_from_plex(item.get("addedAt"))
                listened = view_count > 0 or last_listened is not None
                if listened:
                    extra = {
                        "source": "plex",
                        "view_count": view_count,
                    }
                    if last_listened:
                        dt = _dt_from_plex(last_listened)
                        if dt:
                            extra["last_played_at"] = dt.isoformat()
                    if added_at:
                        extra["added_to_library_at"] = added_at.isoformat()
                    if parent_title:
                        extra["artist_name"] = parent_title
                    await _upsert_interaction(db, user.id, media_item_id, "listened", extra)

                user_rating = item.get("userRating")
                if user_rating is not None:
                    try:
                        rating_val = float(user_rating)
                        await _upsert_interaction(db, user.id, media_item_id, "rated", {
                            "source": "plex",
                            "score": rating_val,
                        })
                    except (TypeError, ValueError):
                        pass

                # Hydrate album metadata from Plex (artist, genres, label, duration)
                await _hydrate_album_from_plex(db, media_item_id, item)
                # Fetch track listing from Plex for albums with no tracks
                await _hydrate_album_tracks_from_plex(db, user, server, media_item_id)
            else:
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
        media_item_id = await _find_or_seed_media(db, item, media_type, guids, plex_guid=item.get("guid"))
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


async def _get_alternative_plex_urls(
    server: UserPlexServer,
    user: User,
) -> list[str]:
    """Return alternative base URLs for a Plex server, fetched from plex.tv resources."""
    if not user.plex_auth_token:
        return []
    try:
        data = await _get_json(
            f"{PLEX_TV_BASE}/api/v2/resources?includeHttps=1&includeRelay=1",
            user.plex_auth_token,
        )
    except Exception:
        return []

    machine_id = server.machine_identifier
    for resource in _as_list(data):
        if str(resource.get("clientIdentifier") or resource.get("machineIdentifier") or "") != machine_id:
            continue
        urls: list[str] = []
        for conn in _connections(resource):
            uri = conn.get("uri")
            if uri and str(uri).rstrip("/") not in urls:
                urls.append(str(uri).rstrip("/"))
        return urls
    return []


async def _plex_server_get(
    server: UserPlexServer,
    user: User,
    path: str,
) -> tuple[dict, str] | None:
    """Make a GET request to a Plex server path, trying alternative base URLs on failure.

    Returns (data, working_base_url) or None if all connections fail.
    """
    token = server.access_token or user.plex_auth_token
    if not token:
        return None

    primary_url = server.base_url
    urls_to_try: list[str] = []
    if primary_url:
        urls_to_try.append(primary_url)
    alt_urls = await _get_alternative_plex_urls(server, user)
    for alt in alt_urls:
        if alt not in urls_to_try:
            urls_to_try.append(alt)

    for base_url in urls_to_try:
        try:
            data = await _get_json(f"{base_url}{path}", token, timeout=8.0)
            return data, base_url
        except Exception:
            continue

    return None


async def _resolve_stream_url_for_server_with_base(
    base_url: str,
    token: str,
    rating_key: str,
) -> str | None:
    """Resolve a stream URL using a specific base URL (fast path, no discovery)."""
    try:
        data = await _get_json(f"{base_url}/library/metadata/{rating_key}", token, timeout=8.0)
    except Exception:
        return None

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
    url = f"{url}{'&' if '?' in url else '?'}X-Plex-Token={token}"
    return url


async def _resolve_stream_url_for_server(
    server: UserPlexServer,
    user: User,
    rating_key: str,
) -> str | None:
    """Try to resolve a stream URL through a specific Plex server."""
    token = server.access_token or user.plex_auth_token
    if not token:
        return None

    result = await _plex_server_get(server, user, f"/library/metadata/{rating_key}")
    if result is None:
        return None

    data, working_base_url = result

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

    url = f"{working_base_url}{part_key}"
    url = f"{url}{'&' if '?' in url else '?'}X-Plex-Token={token}"
    return url


async def get_plex_stream_url(
    db: AsyncSession,
    user: User,
    rating_key: str,
) -> str | None:
    """Resolve a Plex rating_key to a signed stream URL.

    Returns a URL the browser can stream directly from the Plex server,
    or None if the item/server/token is unavailable.
    """
    # First try to find the server through UserPlexItem (for synced items)
    plex_item = await db.scalar(
        select(UserPlexItem).where(
            UserPlexItem.user_id == user.id,
            UserPlexItem.rating_key == rating_key,
        )
    )
    if plex_item is not None:
        server = await db.get(UserPlexServer, plex_item.server_id)
        if server is not None:
            url = await _resolve_stream_url_for_server(server, user, rating_key)
            if url is not None:
                return url

    # Fall back to trying all the user's Plex servers
    servers_result = await db.execute(
        select(UserPlexServer).where(UserPlexServer.user_id == user.id)
    )
    for server in servers_result.scalars().all():
        url = await _resolve_stream_url_for_server(server, user, rating_key)
        if url is not None:
            return url

    logger.warning("failed to resolve plex stream url", rating_key=rating_key)
    return None


async def get_plex_album_tracks(
    db: AsyncSession,
    user: User,
    media_item_id: str,
) -> tuple[list[dict], str | None] | None:
    """Return (tracks, working_base_url) for a Plex music album, or None on failure."""
    plex_item = await db.scalar(
        select(UserPlexItem).where(
            UserPlexItem.user_id == user.id,
            UserPlexItem.media_item_id == media_item_id,
            UserPlexItem.media_type == "music",
        )
    )
    if plex_item is None:
        logger.warning("no plex item found for album tracks", media_item_id=media_item_id, user_id=user.id)
        return None

    server = await db.get(UserPlexServer, plex_item.server_id)
    if server is None:
        logger.warning("no plex server for album tracks", server_id=plex_item.server_id)
        return None

    token = server.access_token or user.plex_auth_token
    if not token:
        logger.warning("no plex token for album tracks", server_id=server.id)
        return None

    result = await _plex_server_get(server, user, f"/library/metadata/{plex_item.rating_key}/children")
    if result is None:
        logger.warning("failed to fetch plex album children", rating_key=plex_item.rating_key)
        return None

    data, working_base_url = result

    items = _container_items(data)
    if not items:
        return [], working_base_url

    # Build track list. Stream URLs are resolved client-side now
    # (browser fetches Part keys from Plex metadata).
    tracks: list[dict] = []
    for item in items:
        tracks.append({
            "rating_key": str(item.get("ratingKey", "")),
            "title": item.get("title", ""),
            "artist": item.get("grandparentTitle", "") or item.get("originalTitle", ""),
            "track_number": item.get("index", 0),
            "disc_number": item.get("parentIndex", 1),
            "duration_ms": item.get("duration"),
        })

    return tracks, working_base_url

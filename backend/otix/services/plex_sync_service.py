# TODO: Review this file
from __future__ import annotations

import asyncio
import re
import urllib.parse
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from collections.abc import Callable, Coroutine
from typing import Any
from uuid import uuid4

import httpx
import structlog
from sqlalchemy import func, select, or_, and_
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
from otix.services.external_id_service import ExternalIDService
from otix.lib.slug import slugify

logger = structlog.get_logger()

PLEX_TV_BASE = "https://plex.tv"


async def get_plex_seed_ids(session: AsyncSession, user_id: str, limit: int = 40) -> list[str]:
    """Get media_item_ids from a user's Plex items, sorted by view count."""
    result = await session.execute(
        select(UserPlexItem.media_item_id)
        .where(
            UserPlexItem.user_id == user_id,
            UserPlexItem.media_item_id.isnot(None),
        )
        .order_by(UserPlexItem.view_count.desc())
        .limit(limit)
    )
    return [row[0] for row in result if row[0]]


async def get_user_plex_item(session: AsyncSession, user_id: str, media_item_id: str) -> UserPlexItem | None:
    """Return a UserPlexItem for a user+media combination, if any."""
    return await session.scalar(
        select(UserPlexItem)
        .where(
            UserPlexItem.user_id == user_id,
            UserPlexItem.media_item_id == media_item_id,
        )
        .limit(1)
    )

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
    # Prefer local connections (direct LAN access) — fastest and most reliable.
    # Non-local / relay connections go through plex.direct which is slow.
    for conn in connections:
        uri = conn.get("uri")
        if uri and str(uri).startswith("https://") and conn.get("local"):
            return str(uri).rstrip("/")
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


# ── Batch-lookup caches ──────────────────────────────────────────────


@dataclass
class GuidCache:
    """Pre-loaded GUID → media_item_id mappings for a library.

    Eliminates N+1 individual GUID lookups during ``_find_or_seed_media``.
    """

    by_provider: dict[str, dict[str, str]] = field(default_factory=dict)
    # {provider: {external_id: entity_id}}

    _new_ids: set[str] = field(default_factory=set)
    # MediaItem IDs created during this sync (not yet flushed to DB).
    # Items in the same batch can find each other without a DB round-trip.

    def find(self, provider: str, external_id: str) -> str | None:
        return self.by_provider.get(provider, {}).get(external_id)

    def add(self, provider: str, external_id: str, entity_id: str) -> None:
        self.by_provider.setdefault(provider, {})[external_id] = entity_id
        self._new_ids.add(entity_id)

    def is_new(self, entity_id: str) -> bool:
        return entity_id in self._new_ids


async def _build_guid_cache(
    db: AsyncSession, items: list[dict]
) -> GuidCache:
    """Batch-load every (provider, external_id) pair from *items* in one query."""
    pairs: set[tuple[str, str]] = set()
    for item in items:
        guids = extract_guids(item)
        if plex_guid := item.get("guid"):
            pairs.add(("plex", str(plex_guid)))
        for p, e in guids.items():
            pairs.add((p, e))

    if not pairs:
        return GuidCache()

    conditions = [
        and_(
            ExternalID.provider == p,
            ExternalID.external_id == e,
            or_(
                ExternalID.entity_type == "media_item",
                and_(
                    ExternalID.entity_type.is_(None),
                    ExternalID.media_type.in_(["movie", "show", "game", "music"]),
                ),
            ),
        )
        for p, e in pairs
    ]

    # Chunk to avoid hitting PostgreSQL's expression-tree limit
    cache = GuidCache()
    chunk_size = 500
    for i in range(0, len(conditions), chunk_size):
        chunk = conditions[i : i + chunk_size]
        rows = (await db.scalars(select(ExternalID).where(or_(*chunk)))).all()
        for row in rows:
            if row.entity_id:
                cache.by_provider.setdefault(row.provider, {})[row.external_id] = row.entity_id
            elif row.media_item_id:
                cache.by_provider.setdefault(row.provider, {})[row.external_id] = row.media_item_id

    return cache


@dataclass
class AlbumContext:
    """Pre-loaded reference data for album metadata hydration.

    Eliminates per-tag check-then-insert queries in ``_hydrate_album_from_plex``.
    """

    genre_by_slug: dict[str, Genre] = field(default_factory=dict)
    media_genre_pairs: set[tuple[str, str]] = field(default_factory=set)
    label_by_slug: dict[str, Company] = field(default_factory=dict)
    involved_company_pairs: set[tuple[str, str]] = field(default_factory=set)


async def _build_album_context(
    db: AsyncSession, music_media_ids: list[str]
) -> AlbumContext:
    """Pre-load genre/label data for all music items in a library."""
    if not music_media_ids:
        return AlbumContext()

    ctx = AlbumContext()

    # All existing genres
    all_genres = (await db.scalars(select(Genre))).all()
    ctx.genre_by_slug = {g.slug: g for g in all_genres}

    # Existing MediaGenre links for these albums
    mg_rows = (
        await db.scalars(
            select(MediaGenre).where(MediaGenre.media_item_id.in_(music_media_ids))
        )
    ).all()
    ctx.media_genre_pairs = {(mg.media_item_id, mg.genre_id) for mg in mg_rows}

    # All existing companies
    all_labels = (await db.scalars(select(Company))).all()
    ctx.label_by_slug = {c.slug: c for c in all_labels}

    # Existing InvolvedCompany links for these albums
    ic_rows = (
        await db.scalars(
            select(InvolvedCompany).where(
                InvolvedCompany.media_item_id.in_(music_media_ids)
            )
        )
    ).all()
    ctx.involved_company_pairs = {
        (ic.media_item_id, ic.company_id) for ic in ic_rows
    }

    return ctx


@dataclass
class EpisodeCache:
    """Pre-loaded season/episode data for episode resolution."""

    # (show_media_id, season_number) → season_id
    season_by_show_and_number: dict[tuple[str, int], str] = field(default_factory=dict)
    # (season_id, episode_number) → episode_id
    episode_by_season_and_number: dict[tuple[str, int], str] = field(default_factory=dict)


async def _build_episode_cache(
    db: AsyncSession, show_media_ids: set[str]
) -> EpisodeCache:
    """Pre-load seasons and episodes for a set of shows."""
    if not show_media_ids:
        return EpisodeCache()

    cache = EpisodeCache()

    seasons = (
        await db.scalars(
            select(Season).where(Season.show_id.in_(show_media_ids))
        )
    ).all()
    for s in seasons:
        cache.season_by_show_and_number[(s.show_id, s.season_number)] = s.id

    if cache.season_by_show_and_number:
        season_ids = list(cache.season_by_show_and_number.values())
        episodes = (
            await db.scalars(
                select(Episode).where(Episode.season_id.in_(season_ids))
            )
        ).all()
        for ep in episodes:
            cache.episode_by_season_and_number[(ep.season_id, ep.episode_number)] = ep.id

    return cache


async def _get_json(
    url: str,
    token: str,
    timeout: float = 30.0,
    client: httpx.AsyncClient | None = None,
) -> dict:
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

    async def _do_get(c: httpx.AsyncClient) -> dict:
        resp = await c.get(url_with_token, headers=headers)
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            logger.error(
                "plex returned non-json response",
                url=url, status=resp.status_code, body=resp.text[:500],
            )
            raise RuntimeError(f"Plex server at {url} returned an unexpected response")

    if client is not None:
        return await _do_get(client)

    async with httpx.AsyncClient(timeout=timeout) as disposable:
        return await _do_get(disposable)


async def discover_plex_servers(
    db: AsyncSession,
    user: User,
    progress: ProgressCallback | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[UserPlexServer]:
    if not user.plex_auth_token:
        raise ValueError("User has no linked Plex account")

    data = await _get_json(
        f"{PLEX_TV_BASE}/api/v2/resources?includeHttps=1&includeRelay=1",
        user.plex_auth_token,
        client=client,
    )
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
    client: httpx.AsyncClient | None = None,
) -> list[UserPlexLibrary]:
    token = server.access_token or user.plex_auth_token
    if not token or not server.base_url:
        return []
    data = await _get_json(f"{server.base_url}/library/sections", token, client=client)
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
    guid_cache: GuidCache | None = None,
) -> tuple[str, bool]:
    """Resolve a Plex item to a MediaItem ID, creating a stub if necessary.

    Returns ``(media_item_id, was_matched)`` — *was_matched* is True when the
    item resolved to an existing catalog entry (via GUID or fuzzy match), False
    when a new stub was created.
    """
    eid_svc = ExternalIDService(db)

    # ── Check Plex GUID via cache first, then DB ──────────────────
    if plex_guid:
        if guid_cache is not None:
            existing = guid_cache.find("plex", plex_guid)
            if existing:
                return existing, True
        # Fallback: individual DB lookup (used by watchlist sync)
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
            return existing.media_item_id, True

    # ── Check third-party GUIDs via cache first, then DB ──────────
    for provider, external_id in guids.items():
        if guid_cache is not None:
            existing = guid_cache.find(provider, external_id)
            if existing:
                # Link Plex GUID so future syncs find it directly
                if plex_guid:
                    await eid_svc.upsert("plex", plex_guid, "media_item", existing)
                    if guid_cache is not None:
                        guid_cache.add("plex", plex_guid, existing)
                return existing, True
        # Fallback: individual DB lookup
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
            return existing.media_item_id, True

    # ── Music: fuzzy title+artist match ───────────────────────────
    title = str(item.get("title") or "Untitled")
    if media_type == "music" and title != "Untitled":
        match_id = await _fuzzy_match_album(db, title, artist_name, guids)
        if match_id is not None:
            if plex_guid:
                await eid_svc.upsert("plex", plex_guid, "media_item", match_id)
                if guid_cache is not None:
                    guid_cache.add("plex", plex_guid, match_id)
            for provider, external_id in guids.items():
                await eid_svc.upsert(provider, external_id, "media_item", match_id)
                if guid_cache is not None:
                    guid_cache.add(provider, external_id, match_id)
            # flush removed — upserts via db.execute() run immediately
            return match_id, True  # fuzzy match counts as matched

    # ── Create stub ───────────────────────────────────────────────
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
    await db.flush()  # required: subsequent ExternalID upserts need the FK
    if media_type == "movie":
        db.add(Movie(media_item_id=media.id))
    elif media_type == "music":
        db.add(Album(
            media_item_id=media.id,
            track_count=child_count or 0,
        ))
    else:
        db.add(Show(media_item_id=media.id))

    for provider, external_id in guids.items():
        await eid_svc.upsert(provider, external_id, "media_item", media.id)
        if guid_cache is not None:
            guid_cache.add(provider, external_id, media.id)

    if plex_guid:
        await eid_svc.upsert("plex", plex_guid, "media_item", media.id)
        if guid_cache is not None:
            guid_cache.add("plex", plex_guid, media.id)

    # flush removed — upserts via db.execute() run immediately

    return media.id, False  # stub = seeded, not matched


def _tag_list(item: dict, key: str) -> list[str]:
    """Extract Plex tag objects like Genre, Mood, Style into a list of tag names."""
    tags = _as_list(item.get(key))
    return [t["tag"] for t in tags if isinstance(t, dict) and t.get("tag")]


def _make_oti_id() -> str:
    return f"oti_{uuid4().hex[:12]}"


async def _get_or_create_person_by_name(db: AsyncSession, name: str) -> Person:
    """Find or create a Person by name (case-insensitive)."""
    person = await db.scalar(
        select(Person).where(func.lower(Person.name) == name.lower())
    )
    if person is not None:
        return person
    person = Person(id=_make_oti_id(), name=name)
    db.add(person)
    await db.flush()
    return person


async def _get_or_create_genre_by_name(
    db: AsyncSession, name: str, ctx: AlbumContext | None = None,
) -> Genre:
    """Get or create a Genre, safe for concurrent Plex syncs.

    When *ctx* is provided, checks the pre-loaded genre cache first
    and adds newly-created genres to it so subsequent calls find them.
    """
    genre_slug = slugify(name)
    if ctx is not None:
        cached = ctx.genre_by_slug.get(genre_slug)
        if cached is not None:
            return cached
    genre = await db.scalar(select(Genre).where(Genre.slug == genre_slug))
    if genre is not None:
        if ctx is not None:
            ctx.genre_by_slug[genre_slug] = genre
        return genre
    new_id = _make_oti_id()
    await db.execute(
        pg_insert(Genre).values(id=new_id, name=name, slug=genre_slug)
        .on_conflict_do_nothing(constraint="genres_slug_key")
    )
    genre = await db.scalar(select(Genre).where(Genre.slug == genre_slug))
    if ctx is not None and genre is not None:
        ctx.genre_by_slug[genre_slug] = genre
    return genre


async def _get_or_create_label(
    db: AsyncSession, name: str, ctx: AlbumContext | None = None,
) -> Company:
    """Get or create a Company (label), safe for concurrent Plex syncs.

    When *ctx* is provided, checks the pre-loaded label cache first
    and adds newly-created labels to it.
    """
    label_slug = slugify(name)
    if ctx is not None:
        cached = ctx.label_by_slug.get(label_slug)
        if cached is not None:
            return cached
    company = await db.scalar(select(Company).where(Company.slug == label_slug))
    if company is not None:
        if ctx is not None:
            ctx.label_by_slug[label_slug] = company
        return company
    new_id = _make_oti_id()
    await db.execute(
        pg_insert(Company).values(id=new_id, name=name, slug=label_slug)
        .on_conflict_do_nothing(constraint="companies_slug_key")
    )
    company = await db.scalar(select(Company).where(Company.slug == label_slug))
    if ctx is not None and company is not None:
        ctx.label_by_slug[label_slug] = company
    return company


async def _hydrate_album_from_plex(
    db: AsyncSession,
    media_item_id: str,
    item: dict,
    ctx: AlbumContext | None = None,
) -> None:
    """Extract and persist all available music metadata from a Plex album item.

    When *ctx* is provided, uses pre-loaded genre/label data to skip redundant
    check-before-insert queries.
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
        genre = await _get_or_create_genre_by_name(db, tag_name, ctx)
        # Skip DB existence check if context tells us the link already exists
        if ctx is not None and (media_item_id, genre.id) in ctx.media_genre_pairs:
            continue
        exists = await db.scalar(
            select(MediaGenre).where(
                MediaGenre.media_item_id == media_item_id,
                MediaGenre.genre_id == genre.id,
            )
        )
        if not exists:
            db.add(MediaGenre(media_item_id=media_item_id, genre_id=genre.id))
            if ctx is not None:
                ctx.media_genre_pairs.add((media_item_id, genre.id))

    # ── Studio / Label ──────────────────────────────────────────────
    studio = item.get("studio")
    if studio and isinstance(studio, str) and studio.strip():
        company = await _get_or_create_label(db, studio.strip(), ctx)
        if ctx is None or (media_item_id, company.id) not in ctx.involved_company_pairs:
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
                if ctx is not None:
                    ctx.involved_company_pairs.add((media_item_id, company.id))

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

    # flush removed — caller batches flushes


async def _hydrate_album_tracks_from_plex(
    db: AsyncSession,
    user: User,
    server: UserPlexServer,
    media_item_id: str,
    *,
    client: httpx.AsyncClient | None = None,
    plex_item: UserPlexItem | None = None,
) -> int:
    """Fetch track children from Plex and create Track records.

    Returns the number of tracks created.
    """
    token = server.access_token or user.plex_auth_token
    if not token or not server.base_url:
        return 0

    if plex_item is None:
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
                client=client,
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
        # flush removed — caller batches flushes
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
    *,
    guid_cache: GuidCache | None = None,
    episode_cache: EpisodeCache | None = None,
) -> tuple[str | None, str | None]:
    """Resolve a Plex episode to a catalog Episode and its parent show MediaItem.

    When caches are provided, avoids DB queries for already-known shows,
    seasons, and episodes. Returns (episode_id, show_media_item_id) or (None, None).
    """
    # Find the show via grandparent GUIDs (cache-aware)
    show_media_id = None
    for provider, external_id in grandparent_guids.items():
        if guid_cache is not None:
            existing = guid_cache.find(provider, external_id)
            if existing:
                show_media_id = existing
                break
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

    # Find the season (cache-aware)
    season_id: str | None = None
    if episode_cache is not None:
        season_id = episode_cache.season_by_show_and_number.get(
            (show_media_id, parent_index)
        )

    if season_id is None:
        season = await db.scalar(
            select(Season).where(
                Season.show_id == show_media_id,
                Season.season_number == parent_index,
            )
        )
        if season is not None:
            season_id = season.id
            if episode_cache is not None:
                episode_cache.season_by_show_and_number[
                    (show_media_id, parent_index)
                ] = season_id
        else:
            return None, show_media_id

    # Find the episode (cache-aware)
    episode_id: str | None = None
    if episode_cache is not None and season_id is not None:
        episode_id = episode_cache.episode_by_season_and_number.get(
            (season_id, episode_index)
        )

    if episode_id is None:
        episode = await db.scalar(
            select(Episode).where(
                Episode.season_id == season_id,
                Episode.episode_number == episode_index,
            )
        )
        if episode is not None:
            episode_id = episode.id
            if episode_cache is not None:
                episode_cache.episode_by_season_and_number[
                    (season_id, episode_index)
                ] = episode_id
        else:
            from otix.domain.base import gen_otix_id

            episode = Episode(
                id=gen_otix_id(),
                season_id=season_id,
                episode_number=episode_index,
                name=None,
                overview=None,
                runtime=None,
                air_date=None,
                still_url=None,
            )
            db.add(episode)
            await db.flush()
            episode_id = episode.id
            if episode_cache is not None:
                episode_cache.episode_by_season_and_number[
                    (season_id, episode_index)
                ] = episode_id

    return episode_id, show_media_id


# Columns to update on conflict for batched UserPlexItem upserts.
_UPI_UPDATE_COLS = [
    "library_id", "media_item_id", "title", "viewed", "view_count",
    "view_offset", "last_viewed_at", "guids", "raw",
]


async def _check_plex_library_needs_sync(
    db: AsyncSession,
    user: User,
    server: UserPlexServer,
    library: UserPlexLibrary,
    *,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Quick check if a Plex library has changed since our last sync.

    Compares Plex's ``updatedAt`` with the latest ``UserPlexItem.updated_at``
    for this library. Returns ``True`` if sync is needed.
    """
    from sqlalchemy import func as sa_func

    latest_row = await db.scalar(
        select(sa_func.max(UserPlexItem.updated_at)).where(
            UserPlexItem.user_id == user.id,
            UserPlexItem.library_id == library.id,
        )
    )
    if latest_row is None:
        return True  # never synced

    token = server.access_token or user.plex_auth_token
    if not token or not server.base_url:
        return True

    try:
        data = await _get_json(
            f"{server.base_url}/library/sections/{library.section_key}/all"
            f"?X-Plex-Container-Start=0&X-Plex-Container-Size=0",
            token,
            client=client,
        )
        plex_updated_at = data.get("MediaContainer", data).get("updatedAt")
    except Exception:
        return True

    if plex_updated_at is None:
        return True

    plex_ts = datetime.fromtimestamp(int(plex_updated_at), tz=timezone.utc)
    needs_sync = plex_ts > latest_row

    if not needs_sync:
        logger.info(
            "plex library unchanged, skipping",
            library_title=library.title,
        )
    return needs_sync


async def _fetch_plex_library_items(
    *,
    base_url: str,
    section_key: str,
    library_type: str,
    token: str,
    client: httpx.AsyncClient | None = None,
) -> list[dict] | None:
    """Fetch library items from the Plex API (HTTP only, no DB).

    Retries with a fresh httpx client if the shared pool has dead connections.
    """
    if not token or not base_url:
        return None
    extra_params = "&type=9" if library_type == "artist" else ""

    async def _do_fetch(c: httpx.AsyncClient) -> list[dict] | None:
        data = await _get_json(
            f"{base_url}/library/sections/{section_key}/all?includeGuids=1{extra_params}",
            token,
            client=c,
        )
        return [
            it for it in _container_items(data)
            if _media_type(it, library_type) in {"movie", "show", "music"}
        ]

    try:
        if client is not None:
            return await _do_fetch(client)
        async with httpx.AsyncClient(timeout=60.0) as c:
            return await _do_fetch(c)
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError):
        # Retry with fresh client — the Plex server may be busy (allow 3x).
        logger.warning("plex fetch failed, retrying with fresh client", section_key=section_key)
        try:
            async with httpx.AsyncClient(timeout=180.0) as c:
                return await _do_fetch(c)
        except Exception:
            logger.warning("failed to fetch plex library items", section_key=section_key, exc_info=True)
            return None
    except Exception:
        logger.warning("failed to fetch plex library items", section_key=section_key, exc_info=True)
        return None


async def sync_plex_library(
    db: AsyncSession,
    user: User,
    server: UserPlexServer,
    library: UserPlexLibrary,
    progress: ProgressCallback | None = None,
    *,
    client: httpx.AsyncClient | None = None,
    guid_cache: GuidCache | None = None,
    album_ctx: AlbumContext | None = None,
    episode_cache: EpisodeCache | None = None,
    album_ids_with_tracks: set[str] | None = None,
    items: list[dict] | None = None,
) -> dict:
    token = server.access_token or user.plex_auth_token

    # Quick staleness check — skip if Plex hasn't changed since last sync
    if items is None:
        if not await _check_plex_library_needs_sync(
            db, user, server, library, client=client,
        ):
            return {"total": 0, "matched": 0, "seeded": 0}

        items = await _fetch_plex_library_items(
            base_url=server.base_url,
            section_key=library.section_key,
            library_type=library.library_type,
            token=token,
            client=client,
        )
        if items is None:
            return {"total": 0, "matched": 0, "seeded": 0}
    elif not token:
        return {"total": 0, "matched": 0, "seeded": 0}

    items_total = len(items)
    await _safe_progress(
        progress, "syncing_library",
        server_name=server.name, library_name=library.title,
        items_total=items_total,
    )

    # ── Build caches ──────────────────────────────────────────────────
    if guid_cache is None:
        guid_cache = await _build_guid_cache(db, items)

    # Pre-identify music items for AlbumContext & track pre-check
    music_items: list[tuple[int, dict]] = []  # (index, item)
    show_item_ids: set[str] = set()
    episode_show_ids: set[str] = set()
    for i, item in enumerate(items):
        mt = _media_type(item, library.library_type)
        if mt == "music":
            music_items.append((i, item))
        elif item.get("type") == "episode" and user.plex_watch_history_enabled:
            # Collect grandparent GUIDs to pre-load episode cache
            gpg = item.get("grandparentGuid")
            if gpg:
                gg = extract_guids({"guid": gpg, "Guid": item.get("GrandparentGuid")} if gpg else {})
                for _p, _e in gg.items():
                    existing = guid_cache.find(_p, _e)
                    if existing:
                        episode_show_ids.add(existing)

    if music_items and album_ctx is None:
        # Resolve music items via cache to collect their media_item_ids
        music_media_ids: list[str] = []
        for _i, mi in music_items:
            mg = extract_guids(mi)
            plex_g = mi.get("guid")
            if plex_g:
                found = guid_cache.find("plex", str(plex_g))
                if found:
                    music_media_ids.append(found)
                    continue
            for p, e in mg.items():
                found = guid_cache.find(p, e)
                if found:
                    music_media_ids.append(found)
                    break
        album_ctx = await _build_album_context(db, music_media_ids)

    if episode_show_ids and episode_cache is None:
        episode_cache = await _build_episode_cache(db, episode_show_ids)

    if music_items and album_ids_with_tracks is None:
        # Batch pre-check: which album media_item_ids already have tracks?
        all_music_ids: list[str] = []
        for _i, mi in music_items:
            mg = extract_guids(mi)
            pg = mi.get("guid")
            if pg:
                found = guid_cache.find("plex", str(pg))
                if found:
                    all_music_ids.append(found)
                    continue
            for p, e in mg.items():
                found = guid_cache.find(p, e)
                if found:
                    all_music_ids.append(found)
                    break
        if all_music_ids:
            existing = (
                await db.scalars(
                    select(Track.album_id).where(
                        Track.album_id.in_(all_music_ids)
                    )
                )
            ).all()
            album_ids_with_tracks = set(existing)
        else:
            album_ids_with_tracks = set()

    # ── Batch accumulators ───────────────────────────────────────────
    BATCH_SIZE = 50
    upi_batch: list[dict] = []  # UserPlexItem values
    interaction_batch: list[dict] = []  # UserMediaInteraction values
    episode_interaction_batch: list[tuple[str, str]] = []  # (user_id, episode_id)

    async def _flush_batches() -> None:
        nonlocal upi_batch, interaction_batch, episode_interaction_batch
        if upi_batch:
            # Deduplicate by (user_id, server_id, rating_key) before upsert.
            # ON CONFLICT DO UPDATE fails with CardinalityViolationError
            # if the same row appears twice in a multi-row VALUES list.
            seen_keys: set[tuple[str, str, str]] = set()
            deduped: list[dict] = []
            for row in reversed(upi_batch):
                key = (row["user_id"], row["server_id"], row["rating_key"])
                if key not in seen_keys:
                    seen_keys.add(key)
                    deduped.append(row)
            deduped.reverse()
            upi_batch = deduped

            stmt = pg_insert(UserPlexItem.__table__).values(upi_batch)
            excluded = stmt.excluded
            stmt = stmt.on_conflict_do_update(
                constraint="uq_user_plex_item",
                set_={col: getattr(excluded, col) for col in _UPI_UPDATE_COLS},
            )
            await db.execute(stmt)
            upi_batch.clear()
        if interaction_batch:
            # Deduplicate interaction batch too
            seen_ik: set[tuple[str, str, str]] = set()
            ideduped: list[dict] = []
            for row in interaction_batch:
                key = (row["user_id"], row["media_item_id"], row["interaction_type"])
                if key not in seen_ik:
                    seen_ik.add(key)
                    ideduped.append(row)
            interaction_batch = ideduped

            stmt = pg_insert(UserMediaInteraction.__table__).values(interaction_batch)
            excluded = stmt.excluded
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "media_item_id", "interaction_type"],
                set_={"metadata": excluded.metadata},
            )
            await db.execute(stmt)
            interaction_batch.clear()
        if episode_interaction_batch:
            stmt = (
                pg_insert(UserEpisodeInteraction.__table__)
                .values([
                    {"user_id": uid, "episode_id": eid}
                    for uid, eid in episode_interaction_batch
                ])
                .on_conflict_do_nothing()
            )
            await db.execute(stmt)
            episode_interaction_batch.clear()
        await db.flush()

    # ── Main loop ────────────────────────────────────────────────────
    total = matched = seeded = 0
    for i, item in enumerate(items):
        media_type = _media_type(item, library.library_type)
        total += 1
        guids = extract_guids(item)
        plex_item_type = item.get("type")

        # ── Episode handling ───────────────────────────────────────
        if plex_item_type == "episode" and user.plex_watch_history_enabled:
            grandparent_guid_str = item.get("grandparentGuid")
            grandparent_guids = extract_guids(
                {"guid": grandparent_guid_str, "Guid": item.get("GrandparentGuid")}
                if grandparent_guid_str else {}
            )
            parent_index = item.get("parentIndex")
            episode_index = item.get("index")

            if grandparent_guids and parent_index is not None and episode_index is not None:
                episode_id, show_media_id = await _resolve_episode(
                    db, grandparent_guids, int(parent_index), int(episode_index),
                    guid_cache=guid_cache, episode_cache=episode_cache,
                )
                if episode_id and show_media_id:
                    view_count = int(item.get("viewCount") or 0)
                    if view_count > 0:
                        episode_interaction_batch.append((user.id, episode_id))
                    matched += 1

                    upi_batch.append(dict(
                        user_id=user.id, server_id=server.id, library_id=library.id,
                        media_item_id=show_media_id,
                        rating_key=str(item.get("ratingKey")),
                        guid=item.get("guid"), media_type="show",
                        title=str(item.get("grandparentTitle") or item.get("title") or "Untitled"),
                        year=item.get("year"), thumb_url=item.get("thumb"),
                        viewed=view_count > 0, view_count=view_count,
                        view_offset=item.get("viewOffset"), duration=item.get("duration"),
                        last_viewed_at=_dt_from_plex(item.get("lastViewedAt")),
                        guids=grandparent_guids, raw=item,
                    ))

                    if len(upi_batch) >= BATCH_SIZE:
                        await _flush_batches()
                    if (i + 1) % 5 == 0:
                        await _safe_progress(
                            progress, "library_progress",
                            server_name=server.name, library_name=library.title,
                            items_processed=i + 1, items_total=items_total,
                        )
                    continue
            # Fall through to normal handling if episode resolution failed

        # ── Regular item (movie / show / music / unresolved episode) ─
        child_count = int(item.get("childCount")) if item.get("childCount") else None
        media_item_id, was_matched = await _find_or_seed_media(
            db, item, media_type, guids,
            child_count=child_count,
            plex_guid=item.get("guid"),
            artist_name=item.get("parentTitle") if media_type == "music" else None,
            guid_cache=guid_cache,
        )
        if was_matched:
            matched += 1
        else:
            seeded += 1

        view_count = int(item.get("viewCount") or 0)
        view_offset = item.get("viewOffset")
        viewed = view_count > 0

        upi_batch.append(dict(
            user_id=user.id, server_id=server.id, library_id=library.id,
            media_item_id=media_item_id,
            rating_key=str(item.get("ratingKey")),
            guid=item.get("guid"), media_type=media_type,
            title=str(item.get("title") or "Untitled"),
            year=item.get("year"), thumb_url=item.get("thumb"),
            viewed=viewed, view_count=view_count,
            view_offset=view_offset, duration=item.get("duration"),
            last_viewed_at=_dt_from_plex(item.get("lastViewedAt")),
            guids=guids, raw=item,
        ))

        if media_item_id:
            if media_type == "music":
                parent_title = item.get("parentTitle")
                last_listened = item.get("lastViewedAt")
                added_at = _dt_from_plex(item.get("addedAt"))
                listened = view_count > 0 or last_listened is not None
                if listened:
                    extra: dict[str, Any] = {"source": "plex", "view_count": view_count}
                    if last_listened:
                        dt = _dt_from_plex(last_listened)
                        if dt:
                            extra["last_played_at"] = dt.isoformat()
                    if added_at:
                        extra["added_to_library_at"] = added_at.isoformat()
                    if parent_title:
                        extra["artist_name"] = parent_title
                    interaction_batch.append(dict(
                        user_id=user.id, media_item_id=media_item_id,
                        interaction_type="listened", metadata=extra,
                    ))

                user_rating = item.get("userRating")
                if user_rating is not None:
                    try:
                        rating_val = float(user_rating)
                        interaction_batch.append(dict(
                            user_id=user.id, media_item_id=media_item_id,
                            interaction_type="rated",
                            metadata={"source": "plex", "score": rating_val},
                        ))
                    except (TypeError, ValueError):
                        pass

                # Hydrate album metadata (uses AlbumContext for fast tag lookup)
                await _hydrate_album_from_plex(db, media_item_id, item, ctx=album_ctx)
                # Skip track hydration during bulk sync — catalog hydration
                # cron backfills album tracks asynchronously.
                if album_ids_with_tracks is not None:
                    album_ids_with_tracks.add(media_item_id)
            else:
                # For movies: mark as watched if viewCount > 0.
                # For shows: do NOT mark as watched — show watch status is
                # computed from episode-level data (all episodes in all seasons
                # must be watched), not from Plex's show-level viewCount which
                # counts any episode activity.
                if media_type == "movie" and viewed:
                    interaction_batch.append(dict(
                        user_id=user.id, media_item_id=media_item_id,
                        interaction_type="watched",
                        metadata={"source": "plex", "view_count": view_count},
                    ))
                if view_offset:
                    interaction_batch.append(dict(
                        user_id=user.id, media_item_id=media_item_id,
                        interaction_type="started",
                        metadata={"source": "plex", "view_offset": view_offset, "duration": item.get("duration")},
                    ))

        if len(upi_batch) >= BATCH_SIZE:
            await _flush_batches()
        if (i + 1) % 5 == 0:
            await _safe_progress(
                progress, "library_progress",
                server_name=server.name, library_name=library.title,
                items_processed=i + 1, items_total=items_total,
            )

    # ── Final flush ──────────────────────────────────────────────────
    await _flush_batches()
    await _safe_progress(
        progress, "library_complete",
        server_name=server.name, library_name=library.title,
        total=total, matched=matched, seeded=seeded,
    )
    return {"total": total, "matched": matched, "seeded": seeded}


async def sync_plex_watchlist(
    db: AsyncSession,
    user: User,
    progress: ProgressCallback | None = None,
    *,
    client: httpx.AsyncClient | None = None,
) -> dict:
    if not user.plex_auth_token:
        return {"total": 0, "matched": 0, "seeded": 0}

    await _safe_progress(progress, "watchlist_sync_start")

    url = "https://discover.provider.plex.tv/library/sections/watchlist/all?includeGuids=1"
    try:
        data = await _get_json(url, user.plex_auth_token, client=client)
    except Exception as e:
        logger.error("Failed to fetch plex watchlist", user_id=user.id, error=str(e))
        return {"total": 0, "matched": 0, "seeded": 0}

    items = _container_items(data)
    items_total = len(items)
    items = [it for it in items if _media_type(it) in {"movie", "show"}]

    # Build GuidCache for watchlist items
    guid_cache = await _build_guid_cache(db, items)

    # Batch accumulators
    interaction_batch: list[dict] = []
    total = matched = seeded = 0

    async def _flush() -> None:
        nonlocal interaction_batch
        if interaction_batch:
            stmt = pg_insert(UserMediaInteraction.__table__).values(interaction_batch)
            excluded = stmt.excluded
            stmt = stmt.on_conflict_do_update(
                    index_elements=["user_id", "media_item_id", "interaction_type"],
                    set_={"metadata": excluded.metadata},
                )
            await db.execute(stmt)
            interaction_batch.clear()
        await db.flush()

    for i, item in enumerate(items):
        media_type = _media_type(item)
        total += 1
        guids = extract_guids(item)

        # _find_or_seed_media returns (media_item_id, was_matched) —
        # eliminates the redundant "before" query
        media_item_id, was_matched = await _find_or_seed_media(
            db, item, media_type, guids,
            plex_guid=item.get("guid"),
            guid_cache=guid_cache,
        )
        if was_matched:
            matched += 1
        else:
            seeded += 1

        added_at = _dt_from_plex(item.get("addedAt"))
        extra_data: dict[str, Any] = {"source": "plex"}
        if added_at:
            extra_data["added_at"] = added_at.isoformat()

        interaction_batch.append(dict(
            user_id=user.id, media_item_id=media_item_id,
            interaction_type="watchlisted", metadata=extra_data,
        ))

        if len(interaction_batch) >= 50:
            await _flush()
        if (i + 1) % 5 == 0:
            await _safe_progress(progress, "watchlist_progress",
                                items_processed=i + 1, items_total=items_total)

    await _flush()
    await _safe_progress(progress, "watchlist_complete",
                        total=total, matched=matched, seeded=seeded)
    return {"total": total, "matched": matched, "seeded": seeded}


async def _compute_show_watches(
    db: AsyncSession,
    user_id: str,
    show_media_ids: set[str],
) -> int:
    """Compute which shows are fully watched from episode data.

    A show is "fully watched" only when every episode in every season
    has been watched by the user. This replaces the old per-item check
    that incorrectly used Plex's show-level viewCount.

    Returns the number of shows marked as watched.
    """
    if not show_media_ids:
        return 0

    # All seasons for these shows
    seasons = (
        await db.scalars(
            select(Season).where(Season.show_id.in_(show_media_ids))
        )
    ).all()
    if not seasons:
        return 0

    season_ids = [s.id for s in seasons]
    show_seasons: dict[str, list[str]] = {}
    for s in seasons:
        show_seasons.setdefault(s.show_id, []).append(s.id)

    # All episodes for these seasons
    episodes = (
        await db.scalars(
            select(Episode).where(Episode.season_id.in_(season_ids))
        )
    ).all()
    if not episodes:
        return 0

    season_episodes: dict[str, set[str]] = {}  # season_id → set of episode_ids
    all_episode_ids: list[str] = []
    for ep in episodes:
        season_episodes.setdefault(ep.season_id, set()).add(ep.id)
        all_episode_ids.append(ep.id)

    # Episodes watched by this user
    watched_rows = (
        await db.scalars(
            select(UserEpisodeInteraction.episode_id).where(
                UserEpisodeInteraction.user_id == user_id,
                UserEpisodeInteraction.episode_id.in_(all_episode_ids),
            )
        )
    ).all()
    watched_episode_ids = set(watched_rows)

    # Determine which shows are fully watched
    fully_watched: list[str] = []
    for show_id, s_ids in show_seasons.items():
        all_watched = True
        for s_id in s_ids:
            ep_ids = season_episodes.get(s_id, set())
            if not ep_ids:
                all_watched = False
                break
            if not ep_ids.issubset(watched_episode_ids):
                all_watched = False
                break
        if all_watched:
            fully_watched.append(show_id)

    # Upsert "watched" interactions for fully-watched shows
    if fully_watched:
        stmt = pg_insert(UserMediaInteraction.__table__).values([
                dict(
                    user_id=user_id,
                    media_item_id=show_id,
                    interaction_type="watched",
                    metadata={"source": "plex", "computed": True},
                )
                for show_id in fully_watched
            ])
        excluded = stmt.excluded
        stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "media_item_id", "interaction_type"],
                set_={"metadata": excluded.metadata},
            )
        await db.execute(stmt)

    return len(fully_watched)


async def sync_plex(
    db: AsyncSession,
    user: User,
    progress: ProgressCallback | None = None,
) -> dict:
    # ── Shared HTTP client for all Plex API calls ──────────────────
    async with httpx.AsyncClient(timeout=30.0) as client:
        servers = await discover_plex_servers(db, user, progress=progress, client=client)

        logger.info(
            "plex sync discovered servers",
            count=len(servers), names=[s.name for s in servers],
        )

        summary = {"servers": len(servers), "libraries": 0, "total": 0, "matched": 0, "seeded": 0}
        failed_servers: list[str] = []

        # Phase 1: Discover all servers and their libraries (sequential, DB writes)
        all_library_plans: list[tuple[UserPlexServer, UserPlexLibrary]] = []
        for server in servers:
            logger.info("plex sync processing server", name=server.name, base_url=server.base_url)
            try:
                libraries = await discover_plex_libraries(
                    db, user, server, progress=progress, client=client,
                )
            except Exception:
                logger.warning(
                    "plex server unreachable, skipping",
                    server_name=server.name, machine_id=server.machine_identifier,
                    exc_info=True,
                )
                failed_servers.append(server.name)
                continue

            summary["libraries"] += len(libraries)
            for library in libraries:
                if library.selected:
                    all_library_plans.append((server, library))

        # Phase 2: Process each library sequentially with savepoints so
        # a failure in one library doesn't corrupt the session for others.
        for srv, lib in all_library_plans:
            try:
                async with db.begin_nested():
                    result = await sync_plex_library(
                        db, user, srv, lib,
                        progress=progress, client=client,
                    )
            except Exception:
                logger.warning(
                    "plex library sync failed, skipping",
                    server_name=srv.name, library_title=lib.title,
                    exc_info=True,
                )
                continue
            for key in ("total", "matched", "seeded"):
                summary[key] += result[key]
        # ── Watchlist sync ─────────────────────────────────────────
        wl_result = await sync_plex_watchlist(db, user, progress=progress, client=client)
        for key in ("total", "matched", "seeded"):
            summary[key] += wl_result[key]

    # ── Compute show watch status from episode data ───────────────
    # Query all shows that have episode data for this user (via UserPlexItem),
    # then check if every episode in every season has been watched.
    if user.plex_watch_history_enabled:
        show_rows = (
            await db.scalars(
                select(UserPlexItem.media_item_id).where(
                    UserPlexItem.user_id == user.id,
                    UserPlexItem.media_type == "show",
                    UserPlexItem.media_item_id.isnot(None),
                )
            )
        ).all()
        show_ids = {row for row in show_rows if row}
        if show_ids:
            computed = await _compute_show_watches(db, user.id, show_ids)
            logger.info("plex sync computed show watches", count=computed)

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


async def _get_plex_album_tracks_by_rating_key(
    user: User,
    server: UserPlexServer,
    rating_key: str,
) -> tuple[list[dict], str | None] | None:
    """Fetch album tracks from Plex using pre-resolved params (no DB queries).

    Returns (tracks, working_base_url) or None if all connection attempts fail.
    The caller is responsible for querying plex_item + server from the DB once.
    """
    result = await _plex_server_get(server, user, f"/library/metadata/{rating_key}/children")
    if result is None:
        logger.warning("failed to fetch plex album children", rating_key=rating_key)
        return None

    data, working_base_url = result

    items = _container_items(data)
    if not items:
        return [], working_base_url

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


async def get_plex_album_tracks(
    db: AsyncSession,
    user: User,
    media_item_id: str,
) -> tuple[list[dict], str | None] | None:
    """Return (tracks, working_base_url) for a Plex music album, or None on failure.

    Queries the database for the UserPlexItem + UserPlexServer, then delegates
    to _get_plex_album_tracks_by_rating_key. Endpoints that already have the
    plex_item and server resolved SHOULD call that function directly instead
    to avoid redundant queries.
    """
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

    return await _get_plex_album_tracks_by_rating_key(user, server, plex_item.rating_key)

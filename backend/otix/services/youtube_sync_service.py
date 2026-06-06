# TODO: Review this file
"""Sync a user's YouTube liked music videos into Otix.

Matches music videos to albums and creates 'listened' interactions.
Also links verified YouTube channels to Person (artist) entities.
"""

from __future__ import annotations

import structlog
from sqlalchemy import and_, exists as sa_exists, not_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.media import Album, ExternalID, MediaItem
from otix.domain.people import MediaCredit, Person
from otix.domain.user import User
from otix.lib.youtube_title_parser import parse_music_title
from otix.providers.youtube.client import YouTubeClient
from otix.services.google_auth_service import get_user_google_access_token

logger = structlog.get_logger()

MUSIC_CATEGORY = "10"  # YouTube categoryId for Music


async def _has_youtube_scope(user: User) -> bool:
    """Check if the user's Google token has the youtube scope."""
    token = await get_user_google_access_token(user)
    if not token:
        return False

    client = YouTubeClient(token)
    try:
        resp = await client.get_watch_history()
        return "items" in resp
    except Exception:
        return False


async def _paginate_liked_videos(client: YouTubeClient) -> list[dict]:
    """Fetch all liked videos via videos.list(myRating=like)."""
    all_videos: list[dict] = []
    page_token: str | None = None

    while True:
        params: dict = {
            "myRating": "like",
            "part": "snippet",
            "maxResults": 50,
        }
        if page_token:
            params["pageToken"] = page_token
        resp = await client._get("videos", params)
        page_items = resp.get("items", []) or []
        if not page_items:
            break
        all_videos.extend(page_items)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return all_videos


async def sync_youtube_watch_history(
    session: AsyncSession,
    user: User,
    task_id: str | None = None,
) -> dict:
    """Sync YouTube liked music videos, creating 'listened' interactions.

    Returns summary: {total, music_videos, matched, channel_links}
    """
    from otix.lib.youtube_progress import publish_progress, store_result, store_progress
    from otix.services.interaction_service import InteractionService

    async def _emit(event_type: str, **kwargs) -> None:
        if task_id:
            await publish_progress(task_id, event_type, **kwargs)
            await store_progress(task_id, event_type, **kwargs)

    await _emit("sync_started")

    token = await get_user_google_access_token(user, session=session)
    if not token:
        if user.google_id is None:
            # Auto-disconnected due to external revocation
            logger.warning(
                "google auto-disconnected during youtube sync",
                user_id=user.id,
            )
        else:
            logger.warning("youtube sync failed, no valid token", user_id=user.id)
        await _emit("error", message="No valid Google token. Please reconnect your Google account.")
        if task_id:
            await store_result(task_id, {"error": "No valid token"})
        return {"total": 0, "music_videos": 0, "matched": 0, "channel_links": 0}

    client = YouTubeClient(token)
    interaction_service = InteractionService(session)

    try:
        # ── 1. Paginate liked videos ─────────────────────────────────
        await _emit("fetching_liked_videos")
        liked_videos = await _paginate_liked_videos(client)
        total = len(liked_videos)
        logger.info("youtube liked videos fetched", user_id=user.id, total=total)
        await _emit("liked_videos_fetched", count=total)

        if not liked_videos:
            await _emit("sync_complete", total=0, music_videos=0, matched=0, channel_links=0)
            if task_id:
                await store_result(task_id, {"total": 0, "music_videos": 0, "matched": 0, "channel_links": 0})
            return {"total": 0, "music_videos": 0, "matched": 0, "channel_links": 0}

        # ── 2. Filter to music videos ─────────────────────────────────
        music_videos: list[dict] = []
        non_music_categories: set[str] = set()
        for video in liked_videos:
            snippet = video.get("snippet", {})
            cat = snippet.get("categoryId", "")
            vid = video.get("id", "")
            if not vid:
                continue
            if cat != MUSIC_CATEGORY:
                non_music_categories.add(cat)
                continue
            music_videos.append(
                {
                    "video_id": vid,
                    "title": snippet.get("title", ""),
                    "channel_id": snippet.get("channelId", ""),
                    "channel_title": snippet.get("channelTitle", ""),
                    "published_at": snippet.get("publishedAt", ""),
                }
            )

        logger.info("youtube videos filtered",
            user_id=user.id,
            total_videos=total,
            music_videos=len(music_videos),
            non_music_categories=sorted(non_music_categories),
        )
        if music_videos:
            logger.info("youtube sample music video", title=music_videos[0]["title"], channel=music_videos[0]["channel_title"])
        await _emit("videos_analyzed", total=total, music_videos=len(music_videos))

        # ── 3. Parse titles and match to Otix albums ──────────────────
        matched = 0
        channel_links = 0
        for mv in music_videos:
            parsed = parse_music_title(mv["title"], mv["channel_title"])
            if parsed.confidence < 0.3:
                logger.info("youtube low confidence parse", title=mv["title"], confidence=parsed.confidence)
                continue

            album = await _match_album(session, parsed)
            if album is None:
                continue

            extra = {
                "source": "youtube_liked_videos",
                "video_id": mv["video_id"],
                "video_title": mv["title"],
                "channel_title": mv["channel_title"],
                "published_at": mv["published_at"],
            }
            await interaction_service.set_interaction(
                user.id, album.media_item_id, "listened", extra
            )
            matched += 1

            if mv["channel_id"]:
                linked = await _link_channel_to_person(
                    session, mv["channel_id"], mv["channel_title"]
                )
                if linked:
                    channel_links += 1

        await _emit("matching_complete", matched=matched, total_music=len(music_videos))

        result = {
            "total": total,
            "music_videos": len(music_videos),
            "matched": matched,
            "channel_links": channel_links,
        }
        logger.info("youtube liked videos synced", user_id=user.id, **result)
        await _emit("sync_complete", **result)
        if task_id:
            await store_result(task_id, result)
        return result

    except Exception:
        logger.exception("youtube liked videos sync failed", user_id=user.id)
        await _emit("error", message="YouTube sync failed. Please try again.")
        if task_id:
            await store_result(task_id, {"error": "Sync failed"})
        raise


async def _match_album(session: AsyncSession, parsed) -> Album | None:
    """Match a parsed title to an Otix album via artist + song title lookup."""
    artist = parsed.artist.strip()
    song = parsed.song_title.strip()
    if not artist or not song:
        return None

    # Strategy 1: Exact or ILIKE match on MediaItem.title + Person via credits
    # Find albums whose title matches the song and who have a matching artist credit
    album_result = await session.execute(
        select(Album)
        .join(MediaItem, MediaItem.id == Album.media_item_id)
        .join(MediaCredit, MediaCredit.media_item_id == MediaItem.id)
        .join(Person, Person.id == MediaCredit.person_id)
        .where(
            MediaItem.title.ilike(song),
            Person.name.ilike(artist),
        )
        .limit(3)
    )
    albums = album_result.scalars().all()
    if albums:
        return albums[0]

    # Strategy 2: ILIKE on MediaItem.title (song may be partial or slightly different)
    album_result = await session.execute(
        select(Album)
        .join(MediaItem, MediaItem.id == Album.media_item_id)
        .where(MediaItem.title.ilike(f"%{song}%"))
        .limit(5)
    )
    albums = album_result.scalars().all()
    if albums:
        # Re-check artist match against credits for these
        for album in albums:
            credit_check = await session.execute(
                select(MediaCredit)
                .join(Person, Person.id == MediaCredit.person_id)
                .where(
                    MediaCredit.media_item_id == album.media_item_id,
                    Person.name.ilike(f"%{artist}%"),
                )
                .limit(1)
            )
            if credit_check.scalar():
                return album

    # Strategy 3: Search by featuring artists
    for feat in parsed.featuring_artists:
        feat = feat.strip()
        if not feat:
            continue
        album_result = await session.execute(
            select(Album)
            .join(MediaItem, MediaItem.id == Album.media_item_id)
            .join(MediaCredit, MediaCredit.media_item_id == MediaItem.id)
            .join(Person, Person.id == MediaCredit.person_id)
            .where(
                MediaItem.title.ilike(f"%{song}%"),
                Person.name.ilike(f"%{feat}%"),
            )
            .limit(3)
        )
        albums = album_result.scalars().all()
        if albums:
            return albums[0]

    return None


async def _link_channel_to_person(
    session: AsyncSession, channel_id: str, channel_title: str
) -> bool:
    """Link a YouTube channel to a Person record if there's a clear match.

    Returns True if a link was made.
    """
    # Already linked?
    has_channel = sa_exists().where(
        ExternalID.provider == "youtube_channel",
        ExternalID.entity_type == "person",
        ExternalID.entity_id == Person.id,
        ExternalID.external_id == channel_id,
    )
    existing = await session.scalar(
        select(Person).where(has_channel)
    )
    if existing:
        return False

    # Strip Topic suffix for matching
    artist_name = channel_title
    if artist_name.endswith(" - Topic"):
        artist_name = artist_name[: -len(" - Topic")].strip()

    # Find matching Person by name
    has_no_channel = ~sa_exists().where(
        ExternalID.provider == "youtube_channel",
        ExternalID.entity_type == "person",
        ExternalID.entity_id == Person.id,
    )
    person = await session.scalar(
        select(Person).options(joinedload(Person._external_ids)).where(
            Person.name.ilike(artist_name),
            has_no_channel,
        )
    )

    if person is None:
        return False

    person.youtube_channel_id = channel_id
    person.youtube_channel_title = channel_title
    await session.flush()
    logger.info("youtube channel linked to person", channel_id=channel_id, person_name=person.name)
    return True

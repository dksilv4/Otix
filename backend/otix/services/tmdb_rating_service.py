from __future__ import annotations

import asyncio
from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, MediaItem
from otix.domain.review import Review
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis
from otix.providers.tmdb.client import TMDBProvider

logger = structlog.get_logger()

SYNC_DIRECTIONS = {"disabled", "import", "export", "bidirectional"}


@dataclass
class SyncResult:
    direction: str
    imported: int = 0
    exported: int = 0
    skipped: int = 0
    errors: list[str] | None = None


def _tmdb_rating_to_score(rating: float) -> int:
    """Convert TMDb rating (0.5–10, half-point steps) to Otix score (1–10)."""
    return max(1, min(10, round(rating)))


def _score_to_tmdb_rating(score: int) -> float:
    """Convert Otix score (1–10) to TMDb rating."""
    return float(score)


async def _find_media_by_tmdb_id(session: AsyncSession, tmdb_id: int, media_type: str) -> MediaItem | None:
    """Find an Otix MediaItem by its TMDb external ID."""
    result = await session.execute(
        select(ExternalID).where(
            ExternalID.provider == "tmdb",
            ExternalID.external_id == str(tmdb_id),
        )
    )
    external_id = result.scalar_one_or_none()
    if external_id is None:
        return None
    return await session.get(MediaItem, external_id.media_item_id)


async def _get_or_create_media_for_tmdb(
    session: AsyncSession,
    provider: TMDBProvider,
    tmdb_id: int,
    media_type: str,
) -> MediaItem | None:
    """Find a media item by TMDb ID, syncing it if not yet in the catalog."""
    media = await _find_media_by_tmdb_id(session, tmdb_id)
    if media is not None:
        return media

    # Sync the item into the catalog first
    if media_type == "movie":
        from otix.tasks.sync import _sync_tmdb_movie
        await _sync_tmdb_movie(tmdb_id, force=False)
    elif media_type == "tv":
        from otix.tasks.sync import _sync_tmdb_show
        await _sync_tmdb_show(tmdb_id, force=False)

    await session.flush()
    return await _find_media_by_tmdb_id(session, tmdb_id)


async def import_tmdb_ratings(
    session: AsyncSession,
    provider: TMDBProvider,
    user: User,
) -> SyncResult:
    """Import ratings from TMDb into Otix."""
    result = SyncResult(direction="import")
    if user.tmdb_account_id is None or user.tmdb_session_id is None:
        result.errors = ["TMDb account not linked"]
        return result

    session_id = user.tmdb_session_id
    account_id = user.tmdb_account_id

    for media_type, get_page in [
        ("movie", provider.get_rated_movies),
        ("tv", provider.get_rated_tv),
    ]:
        page = 1
        while True:
            data = await get_page(account_id, session_id, page=page)
            results = data.get("results", [])
            if not results:
                break

            for entry in results:
                try:
                    rating = entry.get("rating")
                    if not isinstance(rating, (int, float)):
                        continue
                    tmdb_id = entry.get("id")
                    if not isinstance(tmdb_id, int):
                        continue

                    media = await _get_or_create_media_for_tmdb(session, provider, tmdb_id, media_type)
                    if media is None:
                        result.skipped += 1
                        continue

                    score = _tmdb_rating_to_score(float(rating))

                    review = await session.get(Review, (user.id, media.id))
                    if review is None:
                        review = Review(user_id=user.id, media_item_id=media.id, score=score)
                        session.add(review)
                    elif review.score is None:
                        review.score = score
                    else:
                        result.skipped += 1
                        continue

                    result.imported += 1
                except Exception:
                    logger.exception("tmdb rating import failed for item", tmdb_id=entry.get("id"))
                    result.skipped += 1

            if page >= data.get("total_pages", 0):
                break
            page += 1
            await asyncio.sleep(0.25)

    await session.flush()
    return result


async def export_otix_ratings(
    session: AsyncSession,
    provider: TMDBProvider,
    user: User,
) -> SyncResult:
    """Export Otix ratings to TMDb."""
    result = SyncResult(direction="export")
    if user.tmdb_account_id is None or user.tmdb_session_id is None:
        result.errors = ["TMDb account not linked"]
        return result

    session_id = user.tmdb_session_id

    reviews = await session.execute(
        select(Review).where(Review.user_id == user.id, Review.score.isnot(None))
    )
    user_reviews = reviews.scalars().all()

    for review in user_reviews:
        try:
            external_ids = await session.execute(
                select(ExternalID).where(
                    ExternalID.media_item_id == review.media_item_id,
                    ExternalID.provider == "tmdb",
                )
            )
            tmdb_ext = external_ids.scalar_one_or_none()
            if tmdb_ext is None:
                result.skipped += 1
                continue

            tmdb_id = int(tmdb_ext.external_id)
            media = await session.get(MediaItem, review.media_item_id)
            rating = _score_to_tmdb_rating(review.score)

            if media is not None and media.media_type in ("movie", "show"):
                if media.media_type == "movie":
                    await provider.rate_movie(tmdb_id, rating, session_id)
                else:
                    await provider.rate_tv(tmdb_id, rating, session_id)
                result.exported += 1
            else:
                result.skipped += 1
        except Exception:
            logger.exception("tmdb rating export failed", review_id=(review.user_id, review.media_item_id))
            result.skipped += 1

    return result


async def run_tmdb_rating_sync(
    session: AsyncSession,
    provider: TMDBProvider,
    user: User,
    direction: str,
) -> SyncResult:
    """Run TMDb rating sync based on the chosen direction."""
    if direction not in SYNC_DIRECTIONS:
        return SyncResult(direction=direction, errors=[f"Invalid direction: {direction}"])

    if direction == "disabled":
        return SyncResult(direction="disabled")

    result = SyncResult(direction=direction)

    if direction in ("import", "bidirectional"):
        import_result = await import_tmdb_ratings(session, provider, user)
        result.imported = import_result.imported
        result.skipped += import_result.skipped
        if import_result.errors:
            result.errors = (result.errors or []) + import_result.errors

    if direction in ("export", "bidirectional"):
        export_result = await export_otix_ratings(session, provider, user)
        result.exported = export_result.exported
        result.skipped += export_result.skipped
        if export_result.errors:
            result.errors = (result.errors or []) + export_result.errors

    user.tmdb_rating_last_synced_at = None  # will be set by caller
    await session.flush()

    return result


async def get_tmdb_account_stats(
    provider: TMDBProvider,
    user: User,
) -> dict:
    """Get TMDb account stats for display."""
    stats = {
        "rated_movies": 0,
        "rated_tv": 0,
        "watchlist_movies": 0,
        "watchlist_tv": 0,
    }
    if user.tmdb_account_id is None or user.tmdb_session_id is None:
        return stats

    session_id = user.tmdb_session_id
    account_id = user.tmdb_account_id

    try:
        movies = await provider.get_rated_movies(account_id, session_id, page=1)
        stats["rated_movies"] = movies.get("total_results", 0)
    except Exception:
        logger.exception("tmdb rated movies count failed")

    try:
        tv = await provider.get_rated_tv(account_id, session_id, page=1)
        stats["rated_tv"] = tv.get("total_results", 0)
    except Exception:
        logger.exception("tmdb rated tv count failed")

    try:
        wl_movies = await provider.get_movie_watchlist(account_id, session_id, page=1)
        stats["watchlist_movies"] = wl_movies.get("total_results", 0)
    except Exception:
        logger.exception("tmdb watchlist movies count failed")

    try:
        wl_tv = await provider.get_tv_watchlist(account_id, session_id, page=1)
        stats["watchlist_tv"] = wl_tv.get("total_results", 0)
    except Exception:
        logger.exception("tmdb watchlist tv count failed")

    return stats


async def import_tmdb_watchlist(
    session: AsyncSession,
    provider: TMDBProvider,
    user: User,
) -> SyncResult:
    """Import TMDb watchlist items into Otix library."""
    result = SyncResult(direction="import_watchlist")
    if user.tmdb_account_id is None or user.tmdb_session_id is None:
        result.errors = ["TMDb account not linked"]
        return result

    session_id = user.tmdb_session_id
    account_id = user.tmdb_account_id

    for media_type, get_page in [
        ("movie", provider.get_movie_watchlist),
        ("tv", provider.get_tv_watchlist),
    ]:
        page = 1
        while True:
            data = await get_page(account_id, session_id, page=page)
            results = data.get("results", [])
            if not results:
                break

            for entry in results:
                try:
                    tmdb_id = entry.get("id")
                    if not isinstance(tmdb_id, int):
                        continue

                    media = await _get_or_create_media_for_tmdb(session, provider, tmdb_id, media_type)
                    if media is None:
                        result.skipped += 1
                        continue

                    # Add to library (create minimal interaction if none exists)
                    from otix.domain.interaction import UserMediaInteraction

                    existing = await session.get(UserMediaInteraction, (user.id, media.id))
                    if existing is None:
                        interaction = UserMediaInteraction(
                            user_id=user.id,
                            media_item_id=media.id,
                            is_in_library=True,
                        )
                        session.add(interaction)
                        result.imported += 1
                    elif not existing.is_in_library:
                        existing.is_in_library = True
                        result.imported += 1
                    else:
                        result.skipped += 1
                except Exception:
                    logger.exception("tmdb watchlist import failed", tmdb_id=entry.get("id"))
                    result.skipped += 1

            if page >= data.get("total_pages", 0):
                break
            page += 1
            await asyncio.sleep(0.25)

    await session.flush()
    return result

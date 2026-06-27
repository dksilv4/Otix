from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_optional_user
from otix.api.discover.router_helpers import _cache_get, _cache_set
from otix.domain.asset import MediaVideo
from otix.domain.media import MediaItem
from otix.domain.user import User
from otix.schemas.media import TrendingTrailerItem, TrendingTrailerResponse
from otix.services.media_service import should_exclude_adult

logger = structlog.get_logger()

router = APIRouter()
_TRAILERS_TTL = 1800  # 30 min


def _extract_youtube_id(url: str | None) -> str:
    """Extract YouTube video ID from a URL.

    Handles:
    - None / empty / non-YouTube URLs  →  ""
    - youtu.be/XXXXX                   →  "XXXXX"
    - youtube.com/watch?v=XXXXX       →  "XXXXX"
    - youtube.com/embed/XXXXX         →  "XXXXX"
    - Already a bare ID               →  the ID itself
    """
    if not url or not url.strip():
        return ""

    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()

    # youtu.be shortlinks
    if hostname == "youtu.be":
        return parsed.path.lstrip("/")

    # youtube.com/embed/XXXXX
    if hostname in ("www.youtube.com", "youtube.com", "m.youtube.com"):
        if parsed.path.startswith("/embed/"):
            return parsed.path.removeprefix("/embed/").split("?")[0].split("/")[0]
        # Standard watch URL: ?v=XXXXX
        qs = parse_qs(parsed.query)
        v = qs.get("v")
        if v:
            return v[0]
        # youtube.com URL but no recognizable video ID
        return ""

    # Non-YouTube URL — likely not a video URL at all
    if hostname and hostname not in ("localhost", "127.0.0.1"):
        return ""

    # Bare string — assume it's already an ID
    return url


@router.get("/trailers/trending", response_model=TrendingTrailerResponse)
async def trending_trailers(
    request: Request,
    limit: int = Query(20, ge=1, le=40),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> TrendingTrailerResponse:
    """Get trending media items that have YouTube trailers (movies & shows)."""
    ip = request.client.host if request.client else None
    exclude_adult = should_exclude_adult(current_user)
    cache_key = f"discover:trailers:trending:{limit}:adult{0 if exclude_adult else 1}"

    cached = await _cache_get(cache_key)
    if cached:
        logger.info("trending trailers cache hit", ip=ip)
        return TrendingTrailerResponse.model_validate(json.loads(cached))

    # Subquery: one trailer per media_item, preferring "Trailer" type over "Teaser"
    subq = (
        select(
            MediaVideo.media_item_id,
            MediaVideo.url,
            func.row_number()
            .over(
                partition_by=MediaVideo.media_item_id,
                order_by=(func.array_position(["Trailer", "Teaser"], MediaVideo.video_type).nullslast()),
            )
            .label("rn"),
        )
        .where(
            MediaVideo.video_type.in_(["Trailer", "Teaser"]),
            MediaVideo.provider == "tmdb",
        )
        .subquery()
    )

    query = (
        select(MediaItem, subq.c.url)
        .join(subq, MediaItem.id == subq.c.media_item_id)
        .where(subq.c.rn == 1)  # first trailer per item
        .where(MediaItem.media_type.in_(["movie", "show"]))
        .order_by(MediaItem.popularity.desc())
        .limit(limit)
    )

    if exclude_adult:
        query = query.where(MediaItem.is_adult.isnot(True))

    result = await db.execute(query)
    rows = result.all()

    items: list[TrendingTrailerItem] = []
    for media_item, trailer_url in rows:
        youtube_id = _extract_youtube_id(trailer_url)
        items.append(
            TrendingTrailerItem(
                id=media_item.id,
                media_type=media_item.media_type,
                title=media_item.title,
                slug=media_item.slug,
                poster_url=media_item.poster_url,
                textless_poster_url=media_item.textless_poster_url,
                backdrop_url=media_item.backdrop_url,
                logo_url=media_item.logo_url,
                release_date=media_item.release_date,
                popularity=media_item.popularity,
                avg_rating=media_item.avg_rating,
                rating_count=media_item.rating_count,
                overview=media_item.overview,
                trailer_youtube_id=youtube_id,
                trailer_url=trailer_url,
            )
        )

    response = TrendingTrailerResponse(
        items=items,
        next_cursor=None,
        has_more=False,
        total=len(items),
    )

    await _cache_set(cache_key, response.model_dump_json(), ex=_TRAILERS_TTL)
    logger.info("trending trailers fetched", count=len(items), ip=ip)
    return response

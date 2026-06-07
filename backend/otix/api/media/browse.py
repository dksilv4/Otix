# TODO: Review this file
from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db, get_optional_user
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.schemas.interaction import UserInteractionState
from otix.schemas.media import (
    MediaItemListResponse,
    MediaItemSummary,
)
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService, should_exclude_adult
from otix.services.personalization_service import PersonalizationService

logger = structlog.get_logger()

media_router = APIRouter()

_SIMILAR_TTL = 60


# ── Similar items ────────────────────────────────────────────────


@media_router.get("/{media_id}/similar", response_model=MediaItemListResponse)
async def get_similar_media(
    media_id: str,
    media_type: str | None = Query(None, description="Filter similar items to a specific media type"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    exclude_adult = should_exclude_adult(current_user)
    cache_key = f"media:similar:{media_id}:{media_type or ''}:{limit}:adult{0 if exclude_adult else 1}"
    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached:
        cached_response = MediaItemListResponse.model_validate(json.loads(cached))
        if current_user is not None and cached_response.items:
            interaction_service = InteractionService(db)
            batch = await interaction_service.get_batch_interactions(
                user_id=current_user.id,
                media_item_ids=[s.id for s in cached_response.items],
            )
            for summary in cached_response.items:
                state = batch.get(summary.id, {})
                summary.user_interactions = UserInteractionState(**state)
        return cached_response

    service = MediaService(db)
    items = await service.similar_media(
        media_id=media_id,
        media_type=media_type,
        limit=limit,
        exclude_adult=exclude_adult,
    )

    summaries = [MediaItemSummary.model_validate(item) for item in items]

    response = MediaItemListResponse(
        items=summaries,
        has_more=False,
        total=len(summaries),
    )
    # Cache without interactions (shared across all users)
    await redis.set(cache_key, response.model_dump_json(), ex=_SIMILAR_TTL)

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return response


# ── Recommendations ──────────────────────────────────────────────


_RECOMMENDATIONS_TTL = 60


@media_router.get("/{media_id}/recommendations", response_model=MediaItemListResponse)
async def get_recommendations(
    media_id: str,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    exclude_adult = should_exclude_adult(current_user)
    service = MediaService(db)

    # Look up media_type from the source item (lightweight query).
    item_media_type = await service.get_media_type(media_id)
    if item_media_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    # Try personalized recommendations (per-user, not cacheable)
    seed_ids: list[str] = []
    if current_user:
        personalization = PersonalizationService(db)
        seed_ids = await personalization.get_semantic_recommendations(
            current_user.id,
            item_media_type,
            limit=limit,
            exclude_adult=exclude_adult,
            exclude_media_id=media_id,
        )

    personalized = bool(seed_ids)

    # Fallback path: content-based similar (globally cacheable).
    if not personalized:
        fallback_cache_key = (
            f"media:recs_fallback:{media_id}:{item_media_type}:{limit}:adult{0 if exclude_adult else 1}"
        )
        redis = await get_redis()
        cached = await redis.get(fallback_cache_key)
        if cached:
            cached_response = MediaItemListResponse.model_validate(json.loads(cached))
            if current_user is not None and cached_response.items:
                interaction_service = InteractionService(db)
                batch = await interaction_service.get_batch_interactions(
                    user_id=current_user.id,
                    media_item_ids=[s.id for s in cached_response.items],
                )
                for summary in cached_response.items:
                    state = batch.get(summary.id, {})
                    summary.user_interactions = UserInteractionState(**state)
            return cached_response

    # Fetch items
    if seed_ids:
        # Fetch in KNN order (get_media_items_by_ids preserves input order);
        # list_media would re-sort by popularity and destroy semantic relevance.
        items = await service.get_media_items_by_ids(seed_ids[:limit])
    else:
        items = await service.similar_media(
            media_id=media_id,
            media_type=item_media_type,
            limit=limit,
            exclude_adult=exclude_adult,
        )

    summaries = [MediaItemSummary.model_validate(item) for item in items]

    response = MediaItemListResponse(
        items=summaries,
        has_more=False,
        total=len(summaries),
    )

    # Cache fallback globally; personalized results are not cached
    if not personalized:
        await redis.set(fallback_cache_key, response.model_dump_json(), ex=_RECOMMENDATIONS_TTL)

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return response

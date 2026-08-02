from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.schemas.media import MediaItemListResponse, MediaItemSummary, UserInteractionState
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.interaction_service import InteractionService


async def _cache_get(key: str) -> str | None:
    try:
        redis = await get_redis()
        return await redis.get(key)
    except Exception:
        return None

async def _cache_set(key: str, value: str, ex: int) -> None:
    try:
        redis = await get_redis()
        await redis.set(key, value, ex=ex)
    except Exception:
        pass

async def _build_response(
    db: AsyncSession,
    items: list,
    has_more: bool,
    current_user: User | None,
) -> MediaItemListResponse:
    next_cursor = items[-1].id if has_more and items else None
    await enrich_items_with_assets(db, items)
    summaries = [MediaItemSummary.model_validate(item) for item in items]

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)
            if not (state.get("watched") or state.get("watchlisted")):
                summary.new_season_released = False
                summary.new_season_release_date = None

    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.schemas.list import RankHistoryOut
from otix.schemas.media import MediaItemSummary
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.list_service import ListService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{list_id}/history", response_model=list[RankHistoryOut])
async def list_rank_history(
    list_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[RankHistoryOut]:
    """Get the rank change history for a list."""
    ip = request.client.host if request.client else None
    service = ListService(db)

    try:
        entries = await service.get_rank_history(list_id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch rank history", list_id=list_id, ip=ip)
        raise

    await enrich_items_with_assets(db, [e.media_item for e in entries if e.media_item is not None])
    logger.info("rank history fetched", list_id=list_id, count=len(entries), ip=ip)
    return [
        RankHistoryOut(
            id=e.id,
            media_item_id=e.media_item_id,
            user_id=e.user_id,
            old_sort_order=e.old_sort_order,
            new_sort_order=e.new_sort_order,
            changed_at=e.changed_at,
            media_item=MediaItemSummary.model_validate(e.media_item) if e.media_item else None,
        )
        for e in entries
    ]

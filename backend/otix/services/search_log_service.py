"""Search log service — fire-and-forget search event logging."""

from __future__ import annotations

import structlog

from otix.domain.search_log import SearchLog
from otix.infrastructure.database import async_session

logger = structlog.get_logger()


async def log_search(
    q: str,
    media_type: str | None,
    sort_by: str | None,
    page: int,
    page_size: int,
    result_count: int | None,
    items_returned: int,
    tracks_returned: int,
    backfill_triggered: bool,
    cache_hit: bool,
    query_embedding_available: bool | None,
    user_id: str | None,
    is_bot: bool,
) -> None:
    """Fire-and-forget: write a search event to search_logs."""
    try:
        async with async_session() as session:
            log = SearchLog(
                query=q[:500],
                media_type=media_type,
                sort_by=sort_by,
                page=page,
                page_size=page_size,
                result_count=result_count,
                items_returned=items_returned,
                tracks_returned=tracks_returned,
                backfill_triggered=backfill_triggered,
                cache_hit=cache_hit,
                query_embedding_available=query_embedding_available,
                user_id=user_id,
                is_bot=is_bot,
            )
            session.add(log)
            await session.commit()
    except Exception:
        logger.warning("search_log_failed", exc_info=True)

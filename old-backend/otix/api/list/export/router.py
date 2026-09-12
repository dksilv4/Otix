from __future__ import annotations

import csv
import io
import json

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.services.list_service import ListService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{list_id}/export")
async def export_list(
    list_id: str,
    request: Request,
    format: str = Query("json"),
    db: AsyncSession = Depends(get_db),
) -> PlainTextResponse:
    """Export a list as JSON or CSV.

    Only public lists can be exported.
    """
    ip = request.client.host if request.client else None
    service = ListService(db)

    try:
        lst = await service.get_list_with_items(list_id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch list for export", list_id=list_id, ip=ip)
        raise

    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    if not lst.is_public:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    items = []
    for item in lst.items:
        items.append(
            {
                "rank": item.sort_order + 1,
                "title": item.media_item.title,
                "media_type": item.media_item.media_type,
                "release_date": str(item.media_item.release_date) if item.media_item.release_date else "",
                "avg_rating": item.media_item.avg_rating,
            }
        )

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["rank", "title", "media_type", "release_date", "avg_rating"])
        writer.writeheader()
        writer.writerows(items)
        logger.info("list exported as csv", list_id=list_id, ip=ip)
        return PlainTextResponse(content=output.getvalue(), media_type="text/csv")

    logger.info("list exported as json", list_id=list_id, ip=ip)
    return PlainTextResponse(
        content=json.dumps({"list_name": lst.name, "items": items}, indent=2),
        media_type="application/json",
    )

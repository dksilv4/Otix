from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_trusted_or_admin_user
from otix.domain.user import User
from otix.schemas.admin_edit import MediaEditProposalList, MediaEditProposalOut
from otix.services.admin_edit_service import AdminEditService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/edit-proposals", response_model=MediaEditProposalList)
async def get_edit_proposals(
    request: Request,
    status: str | None = Query(None, description="Filter by status: pending, approved, or rejected"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_trusted_or_admin_user),
) -> MediaEditProposalList:
    """List media edit proposals. Requires admin or trusted user."""
    ip = request.client.host if request.client else None
    service = AdminEditService(db)
    proposals, total = await service.get_all_proposals(status=status, limit=limit, offset=offset)
    vote_map = await service.get_user_votes_for_proposals(current_user.id, [p.id for p in proposals]) if proposals else {}
    items = []
    for p in proposals:
        out = MediaEditProposalOut.model_validate(p)
        out.my_vote = vote_map.get(p.id)
        if p.media_item:
            out.media_title = p.media_item.title
            out.media_type = p.media_item.media_type
            out.media_poster_url = p.media_item.poster_url
        items.append(out)

    logger.info("edit proposals fetched", status=status, total=total, ip=ip)
    return MediaEditProposalList(items=items, total=total)

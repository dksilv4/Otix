"""Match proposal endpoints — backward-compatible wrappers.

DEPRECATED: These endpoints delegate to the unified ProposalsService.
They will be removed in a future release. Use /proposals instead.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db, get_optional_user  # noqa: F811
from otix.domain.proposal import Proposal
from otix.domain.user import User
from otix.services.proposals_service import ProposalsService

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas (kept for backward compatibility) ─────────────────────────


class ProposeMatchRequest(BaseModel):
    query_id: str  # "epic:Jaguar"
    media_item_id: str
    source_title: str
    developer: str | None = None
    release_year: int | None = None
    poster_url: str | None = None
    otix_title: str
    otix_confidence: float
    match_type: str


class ProposalOut(BaseModel):
    id: str
    source: str
    source_game_id: str
    source_title: str
    developer: str | None
    release_year: int | None = None
    poster_url: str | None
    otix_media_id: str
    otix_title: str
    otix_poster_url: str | None = None
    otix_release_year: int | None = None
    otix_confidence: float
    match_type: str
    status: str
    proposed_by: str
    proposer_avatar: str | None = None
    proposer_xp: int = 0
    reviewed_by: str | None
    created_at: str
    reviewed_at: str | None

    model_config = {"from_attributes": True}


class ProposalListOut(BaseModel):
    proposals: list[ProposalOut]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────


def _payload_to_match_out(p: Proposal) -> ProposalOut:
    """Map a unified Proposal with type='match' to the old ProposalOut shape."""
    pl = p.payload
    return ProposalOut(
        id=p.id,
        source=pl.get("source", ""),
        source_game_id=pl.get("source_game_id", ""),
        source_title=pl.get("source_title", ""),
        developer=pl.get("developer"),
        release_year=pl.get("release_year"),
        poster_url=pl.get("poster_url"),
        otix_media_id=pl.get("otix_media_id", ""),
        otix_title=pl.get("otix_title", ""),
        otix_poster_url=pl.get("otix_poster_url"),
        otix_release_year=pl.get("otix_release_year"),
        otix_confidence=pl.get("otix_confidence", 0),
        match_type=pl.get("match_type", ""),
        status=p.status,
        proposed_by=p.proposer.username if p.proposer else "auto",
        proposer_avatar=p.proposer.avatar_url if p.proposer else None,
        proposer_xp=p.proposer.total_xp if p.proposer else 0,
        reviewed_by=p.reviewer.username if p.reviewer else None,
        created_at=p.created_at.isoformat() if p.created_at else "",
        reviewed_at=p.reviewed_at.isoformat() if p.reviewed_at else None,
    )


# ── Endpoints (delegate to unified service) ────────────────────────────


@router.post("/match/propose", response_model=dict)
async def propose_match(
    body: ProposeMatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> dict:
    """Submit an auto-match for review. Delegates to unified ProposalsService."""
    parts = body.query_id.split(":", 1)
    source = parts[0] if parts else "unknown"
    source_game_id = parts[1] if len(parts) > 1 else body.query_id

    payload = {
        "source": source,
        "source_game_id": source_game_id,
        "source_title": body.source_title,
        "developer": body.developer,
        "release_year": body.release_year,
        "poster_url": body.poster_url,
        "otix_media_id": body.media_item_id,
        "otix_title": body.otix_title,
        "otix_confidence": body.otix_confidence,
        "match_type": body.match_type,
    }

    svc = ProposalsService(db)
    proposal = await svc.create(
        proposal_type="match",
        target_type="media_item",
        target_id=body.media_item_id,
        payload=payload,
        proposer=current_user,
    )

    auto_approved = proposal.status == "approved"
    logger.warning("deprecated_endpoint_used", endpoint="/media/match/propose")

    return {
        "success": True,
        "status": proposal.status,
        "auto_approved": auto_approved,
    }


@router.get("/admin/match-proposals", response_model=ProposalListOut)
async def list_proposals(
    status: str = Query("pending"),
    source: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> ProposalListOut:
    """List match proposals. Delegates to unified ProposalsService."""
    svc = ProposalsService(db)
    proposals, total = await svc.list(
        proposal_type="match",
        status=status,
        limit=limit,
        offset=offset,
    )
    logger.warning("deprecated_endpoint_used: /media/admin/match-proposals")
    return ProposalListOut(
        proposals=[_payload_to_match_out(p) for p in proposals],
        total=total,
    )


@router.post("/admin/match-proposals/{proposal_id}/approve")
async def approve_proposal(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> dict:
    """Approve a match proposal. Delegates to unified ProposalsService."""
    svc = ProposalsService(db)
    try:
        await svc.approve(proposal_id, current_user)
    except (ValueError, Exception) as e:
        return {"success": False, "error": str(e)}

    logger.warning("deprecated_endpoint_used: /media/admin/match-proposals/approve")
    return {"success": True}


@router.post("/admin/match-proposals/{proposal_id}/reject")
async def reject_proposal(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> dict:
    """Reject a match proposal. Delegates to unified ProposalsService."""
    svc = ProposalsService(db)
    try:
        await svc.reject(proposal_id, current_user)
    except (ValueError, Exception) as e:
        return {"success": False, "error": str(e)}

    logger.warning("deprecated_endpoint_used", endpoint="/media/admin/match-proposals/reject")
    return {"success": True}

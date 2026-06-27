"""Unified proposals API — generic endpoints for all proposal types."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_admin_user, get_current_user, get_db
from otix.domain.proposal import Proposal
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.services.proposals_service import ProposalsService, ProposalError, is_trusted_user

router = APIRouter(prefix="/proposals", tags=["proposals"])


# ── Schemas ──────────────────────────────────────────────────────────


class ProposerUserOut(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class ProposalOut(BaseModel):
    id: str
    proposal_type: str
    target_type: str
    target_id: str
    proposer_id: str | None = None
    reviewer_id: str | None = None
    status: str
    payload: dict
    rejection_reason: str | None = None
    snapshot: dict | None = None
    upvote_count: int = 0
    downvote_count: int = 0
    my_vote: str | None = None
    proposer: ProposerUserOut | None = None
    reviewer: ProposerUserOut | None = None
    created_at: datetime
    updated_at: datetime
    reviewed_at: datetime | None = None

    # ── Media item enrichment (populated by API layer) ──────────────
    target_title: str | None = None
    target_poster_url: str | None = None
    target_backdrop_url: str | None = None

    model_config = {"from_attributes": True}


class ProposalCreate(BaseModel):
    proposal_type: str = Field(..., pattern="^(match|edit)$")
    target_type: str = "media_item"
    target_id: str
    payload: dict


class ProposalList(BaseModel):
    items: list[ProposalOut]
    total: int


class VoteRequest(BaseModel):
    vote_type: str = Field(..., pattern="^(up|down)$")


class VoteResponse(BaseModel):
    my_vote: str | None = None
    upvote_count: int = 0
    downvote_count: int = 0


class RejectRequest(BaseModel):
    rejection_reason: str | None = None


# ── Endpoints ───────────────────────────────────────────────────────


@router.post("", response_model=ProposalOut, status_code=201)
async def create_proposal(
    body: ProposalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProposalOut:
    """Create a new proposal. Requires trusted user (admin or >=500 XP)."""
    if not is_trusted_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Minimum {settings.proposal_min_xp} XP required to create proposals",
        )

    svc = ProposalsService(db)
    try:
        proposal = await svc.create(
            proposal_type=body.proposal_type,
            target_type=body.target_type,
            target_id=body.target_id,
            payload=body.payload,
            proposer=current_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return _to_out(proposal)


@router.get("", response_model=ProposalList)
async def list_proposals(
    proposal_type: str | None = Query(None, alias="type"),
    status: str | None = Query(None),
    target_type: str | None = Query(None),
    target_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProposalList:
    """List proposals with optional filters."""
    svc = ProposalsService(db)
    proposals, total = await svc.list(
        proposal_type=proposal_type,
        status=status,
        target_type=target_type,
        target_id=target_id,
        limit=limit,
        offset=offset,
    )

    # Fetch user's votes if authenticated
    my_votes = {}
    if proposals:
        my_votes = await svc.get_user_votes(current_user.id, [p.id for p in proposals])

    # Enrich with target media info
    media_map = await _fetch_target_media(db, proposals)

    items = [_to_out(p, my_votes.get(p.id), media_map.get(p.target_id)) for p in proposals]
    return ProposalList(items=items, total=total)


@router.get("/{proposal_id}", response_model=ProposalOut)
async def get_proposal(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProposalOut:
    """Get a single proposal by ID."""
    svc = ProposalsService(db)
    proposal = await svc.get(proposal_id)
    if proposal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")

    my_votes = await svc.get_user_votes(current_user.id, [proposal_id])
    media_map = await _fetch_target_media(db, [proposal])
    return _to_out(proposal, my_votes.get(proposal_id), media_map.get(proposal.target_id))


@router.post("/{proposal_id}/approve", response_model=ProposalOut)
async def approve_proposal(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> ProposalOut:
    """Approve a pending proposal. Admin only."""
    svc = ProposalsService(db)
    try:
        proposal = await svc.approve(proposal_id, current_user)
    except ProposalError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _to_out(proposal)


@router.post("/{proposal_id}/reject", response_model=ProposalOut)
async def reject_proposal(
    proposal_id: str,
    body: RejectRequest = RejectRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> ProposalOut:
    """Reject a pending proposal. Admin only."""
    reason = body.rejection_reason
    svc = ProposalsService(db)
    try:
        proposal = await svc.reject(proposal_id, current_user, reason)
    except ProposalError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _to_out(proposal)


@router.post("/{proposal_id}/undo", response_model=ProposalOut)
async def undo_proposal(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> ProposalOut:
    """Undo an approved proposal. Admin only."""
    svc = ProposalsService(db)
    try:
        proposal = await svc.undo(proposal_id, current_user)
    except ProposalError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _to_out(proposal)


@router.post("/{proposal_id}/vote", response_model=VoteResponse)
async def vote_on_proposal(
    proposal_id: str,
    body: VoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VoteResponse:
    """Cast or toggle a vote on a pending proposal. Requires trusted user."""
    if not is_trusted_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Minimum {settings.proposal_min_xp} XP required to vote",
        )

    svc = ProposalsService(db)
    try:
        result = await svc.vote(proposal_id, current_user, body.vote_type)
    except ProposalError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    proposal = await svc.get(proposal_id)
    if proposal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")

    return VoteResponse(
        my_vote=result,
        upvote_count=proposal.upvote_count,
        downvote_count=proposal.downvote_count,
    )


@router.delete("/{proposal_id}/vote", status_code=204)
async def remove_proposal_vote(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove a user's vote from a proposal."""
    svc = ProposalsService(db)
    deleted = await svc.remove_vote(proposal_id, current_user)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found")


# ── Serialization helper ────────────────────────────────────────────


def _to_out(
    proposal: Proposal,
    my_vote: str | None = None,
    media_info: dict | None = None,
) -> ProposalOut:
    return ProposalOut(
        id=proposal.id,
        proposal_type=proposal.proposal_type,
        target_type=proposal.target_type,
        target_id=proposal.target_id,
        proposer_id=proposal.proposer_id,
        reviewer_id=proposal.reviewer_id,
        status=proposal.status,
        payload=proposal.payload,
        rejection_reason=proposal.rejection_reason,
        snapshot=proposal.snapshot,
        upvote_count=proposal.upvote_count,
        downvote_count=proposal.downvote_count,
        my_vote=my_vote,
        proposer=ProposerUserOut.model_validate(proposal.proposer) if proposal.proposer else None,
        reviewer=ProposerUserOut.model_validate(proposal.reviewer) if proposal.reviewer else None,
        created_at=proposal.created_at,
        updated_at=proposal.updated_at,
        reviewed_at=proposal.reviewed_at,
        target_title=media_info.get("title") if media_info else None,
        target_poster_url=media_info.get("poster_url") if media_info else None,
        target_backdrop_url=media_info.get("backdrop_url") if media_info else None,
    )


# ── Media enrichment helper ─────────────────────────────────────────


async def _fetch_target_media(
    db: AsyncSession,
    proposals: list[Proposal],
) -> dict[str, dict]:
    """Bulk-fetch MediaItem titles + images for proposals targeting media_items.

    Returns {target_id: {title, poster_url, backdrop_url}}.
    """
    media_ids = list({p.target_id for p in proposals if p.target_type == "media_item"})
    if not media_ids:
        return {}

    from sqlalchemy import select
    from otix.domain.media import MediaItem

    rows = await db.execute(
        select(MediaItem.id, MediaItem.title, MediaItem.poster_url, MediaItem.backdrop_url).where(
            MediaItem.id.in_(media_ids)
        )
    )
    return {
        row.id: {
            "title": row.title,
            "poster_url": row.poster_url,
            "backdrop_url": row.backdrop_url,
        }
        for row in rows
    }

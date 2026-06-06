# TODO: Review this file
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_admin_user, get_db, get_trusted_or_admin_user
from otix.schemas.admin_edit import (
    ApproveRejectRequest,
    MediaAssetList,
    MediaAssetOut,
    MediaEditProposalCreate,
    MediaEditProposalList,
    MediaEditProposalOut,
    ProposalVoteCreate,
    VoteResponse,
)
from otix.domain.user import User
from otix.services.admin_edit_service import AdminEditService

logger = structlog.get_logger()

media_router = APIRouter()


# ── Media assets ─────────────────────────────────────────────────


@media_router.get("/{media_id}/assets", response_model=MediaAssetList)
async def list_media_assets(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> MediaAssetList:
    service = AdminEditService(db)
    item = await service.get_media_item(media_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    asset_list = await service.list_media_assets(media_id)
    return MediaAssetList(
        items=[MediaAssetOut.model_validate(a) for a in asset_list],
        total=len(asset_list),
    )


# ── Admin edit proposals ────────────────────────────────────────


@media_router.post("/{media_id}/edit-proposals", response_model=MediaEditProposalOut)
async def create_edit_proposal(
    media_id: str,
    body: MediaEditProposalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_trusted_or_admin_user),
) -> MediaEditProposalOut:
    service = AdminEditService(db)
    item = await service.get_media_item(media_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    proposal = await service.create_proposal(
        media_item_id=media_id,
        proposer_user_id=current_user.id,
        changes=body.changes,
        image_overrides=[o.model_dump() for o in body.image_overrides] if body.image_overrides else None,
    )
    return MediaEditProposalOut.model_validate(proposal)


@media_router.get("/{media_id}/edit-proposals", response_model=MediaEditProposalList)
async def list_edit_proposals(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_trusted_or_admin_user),
) -> MediaEditProposalList:
    service = AdminEditService(db)
    item = await service.get_media_item(media_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")


    proposals = await service.get_proposals_for_media(media_id)
    vote_map = (
        await service.get_user_votes_for_proposals(current_user.id, [p.id for p in proposals]) if proposals else {}
    )
    items = []
    for p in proposals:
        out = MediaEditProposalOut.model_validate(p)
        out.my_vote = vote_map.get(p.id)
        items.append(out)
    return MediaEditProposalList(items=items, total=len(proposals))


@media_router.post(
    "/{media_id}/edit-proposals/{proposal_id}/approve",
    response_model=MediaEditProposalOut,
)
async def approve_edit_proposal(
    media_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> MediaEditProposalOut:
    service = AdminEditService(db)
    try:
        proposal = await service.approve_proposal(proposal_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MediaEditProposalOut.model_validate(proposal)


@media_router.post(
    "/{media_id}/edit-proposals/{proposal_id}/reject",
    response_model=MediaEditProposalOut,
)
async def reject_edit_proposal(
    media_id: str,
    proposal_id: str,
    body: ApproveRejectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> MediaEditProposalOut:
    service = AdminEditService(db)
    try:
        proposal = await service.reject_proposal(proposal_id, current_user.id, body.rejection_reason)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MediaEditProposalOut.model_validate(proposal)


@media_router.post(
    "/{media_id}/edit-proposals/{proposal_id}/undo",
    response_model=MediaEditProposalOut,
)
async def undo_approve_edit_proposal(
    media_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> MediaEditProposalOut:
    service = AdminEditService(db)
    try:
        proposal = await service.undo_approval(proposal_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MediaEditProposalOut.model_validate(proposal)


# ── Proposal voting ──────────────────────────────────────────────


@media_router.post(
    "/{media_id}/edit-proposals/{proposal_id}/vote",
    response_model=VoteResponse,
)
async def vote_on_proposal(
    media_id: str,
    proposal_id: str,
    body: ProposalVoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_trusted_or_admin_user),
) -> VoteResponse:
    service = AdminEditService(db)
    try:
        result = await service.vote(proposal_id, current_user.id, body.vote_type)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    proposal = await service.get_proposal(proposal_id)
    if proposal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
    return VoteResponse(
        my_vote=result,
        upvote_count=proposal.upvote_count,
        downvote_count=proposal.downvote_count,
    )


@media_router.delete(
    "/{media_id}/edit-proposals/{proposal_id}/vote",
    status_code=204,
)
async def remove_proposal_vote(
    media_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_trusted_or_admin_user),
) -> None:
    service = AdminEditService(db)
    deleted = await service.remove_vote(proposal_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found")

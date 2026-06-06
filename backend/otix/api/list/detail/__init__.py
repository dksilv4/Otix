from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db, get_optional_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.interaction import UserInteractionState
from otix.schemas.list import (
    CollaboratorOut,
    UserListDetailOut,
    UserListOut,
    UserListUpdate,
    UserRef,
)
from otix.schemas.media import MediaItemSummary
from otix.domain.user import User
from otix.services.interaction_service import InteractionService
from otix.services.list_service import ListService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{list_id}", response_model=UserListDetailOut)
async def get_list(
    list_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> UserListDetailOut:
    """Get a single list with its items and collaborators."""
    ip = client_ip(request)
    service = ListService(db)
    try:
        lst = await service.get_list_with_items(list_id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch list", list_id=list_id, ip=ip)
        raise

    if lst is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="List not found"
        )

    can_access = lst.is_public or (
        current_user is not None
        and (current_user.id == lst.user_id or await service._can_access_list(list_id, current_user.id))
    )
    if not can_access:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    like_count, is_liked = await service.get_like_status(
        list_id, current_user.id if current_user else None
    )

    collabs = await service.get_collaborators(list_id)
    collaborator_outs = [
        CollaboratorOut(
            id=c.id,
            user_id=c.user_id,
            permission=c.permission,
            status=c.status,
            created_at=c.created_at,
            user=UserRef(id=c.user.id, username=c.user.username, avatar_url=c.user.avatar_url) if c.user else None,
        )
        for c in collabs
    ]

    detail = UserListDetailOut(
        id=lst.id,
        user_id=lst.user_id,
        name=lst.name,
        description=lst.description,
        is_public=lst.is_public,
        like_count=like_count,
        is_liked=is_liked,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
        items=[],
        collaborators=collaborator_outs,
    )

    for item in lst.items:
        summary = MediaItemSummary.model_validate(item.media_item)
        detail.items.append(summary)

    if current_user is not None and detail.items:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in detail.items],
        )
        for summary in detail.items:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    logger.info("list fetched", list_id=list_id, user_id=current_user.id if current_user else None, ip=ip)
    return detail


@router.patch("/{list_id}", response_model=UserListOut)
async def update_list(
    list_id: str,
    body: UserListUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> UserListOut:
    """Update a list's name, description, or visibility.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        lst = await service.update_list(
            list_id=list_id,
            user_id=current_user.id,
            name=body.name,
            description=body.description,
            is_public=body.is_public,
        )
    except Exception:
        await db.rollback()
        logger.exception("failed to update list", list_id=list_id, user_id=current_user.id, ip=ip)
        raise

    if lst is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="List not found"
        )

    logger.info("list updated", list_id=list_id, user_id=current_user.id, ip=ip)
    return UserListOut(
        id=lst.id,
        user_id=lst.user_id,
        name=lst.name,
        description=lst.description,
        is_public=lst.is_public,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
    )


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_list(
    list_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Delete a list owned by the authenticated user.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        deleted = await service.delete_list(list_id=list_id, user_id=current_user.id)
        await db.flush()
    except Exception:
        await db.rollback()
        logger.exception("failed to delete list", list_id=list_id, user_id=current_user.id, ip=ip)
        raise

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="List not found"
        )

    logger.info("list deleted", list_id=list_id, user_id=current_user.id, ip=ip)

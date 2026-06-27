from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.list import CollaboratorInvite, CollaboratorOut, UserRef
from otix.services.list_service import ListService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{list_id}/collaborators", response_model=list[CollaboratorOut])
async def list_collaborators(
    list_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CollaboratorOut]:
    """List all collaborators for a list."""
    ip = client_ip(request)
    service = ListService(db)
    try:
        collabs = await service.get_collaborators(list_id)
    except Exception:
        await db.rollback()
        logger.exception("failed to list collaborators", list_id=list_id, ip=ip)
        raise

    logger.info("collaborators listed", list_id=list_id, count=len(collabs), ip=ip)
    return [
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


@router.post("/{list_id}/collaborators", response_model=CollaboratorOut, status_code=status.HTTP_201_CREATED)
async def invite_collaborator(
    list_id: str,
    body: CollaboratorInvite,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> CollaboratorOut:
    """Invite a user to collaborate on a list.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        collab = await service.add_collaborator(
            list_id=list_id,
            actor_id=current_user.id,
            target_user_id=body.user_id,
            permission=body.permission,
        )
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to invite collaborator",
            list_id=list_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    if collab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    logger.info(
        "collaborator invited",
        list_id=list_id,
        target_user_id=body.user_id,
        user_id=current_user.id,
        ip=ip,
    )
    return CollaboratorOut(
        id=collab.id,
        user_id=collab.user_id,
        permission=collab.permission,
        status=collab.status,
        created_at=collab.created_at,
    )


@router.delete("/{list_id}/collaborators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_collaborator(
    list_id: str,
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Remove a collaborator from a list.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        removed = await service.remove_collaborator(
            list_id=list_id,
            actor_id=current_user.id,
            target_user_id=user_id,
        )
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to remove collaborator",
            list_id=list_id,
            target_user_id=user_id,
            ip=ip,
        )
        raise

    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    logger.info(
        "collaborator removed",
        list_id=list_id,
        target_user_id=user_id,
        user_id=current_user.id,
        ip=ip,
    )


@router.post("/{list_id}/collaborators/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept_collaboration(
    list_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Accept a collaboration invitation.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        ok = await service.accept_collaboration(list_id=list_id, user_id=current_user.id)
        if not ok:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
        await db.flush()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to accept collaboration",
            list_id=list_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info("collaboration accepted", list_id=list_id, user_id=current_user.id, ip=ip)


@router.post("/{list_id}/collaborators/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_collaboration(
    list_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Decline a collaboration invitation.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        ok = await service.decline_collaboration(list_id=list_id, user_id=current_user.id)
        if not ok:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
        await db.flush()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to decline collaboration",
            list_id=list_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info("collaboration declined", list_id=list_id, user_id=current_user.id, ip=ip)

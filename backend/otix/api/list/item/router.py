from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.list import ListItemAdd, ListItemReorder, UserListOut
from otix.services.list_service import ListService

logger = structlog.get_logger()

router = APIRouter()


@router.post("/{list_id}/item", status_code=status.HTTP_201_CREATED)
async def add_to_list(
    list_id: str,
    body: ListItemAdd,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> UserListOut:
    """Add a media item to a list.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        item = await service.add_item(
            list_id=list_id,
            user_id=current_user.id,
            media_item_id=body.media_item_id,
        )
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to add item to list",
            list_id=list_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    lst = await service.get_list(list_id)
    logger.info("item added to list", list_id=list_id, user_id=current_user.id, ip=ip)
    return UserListOut(
        id=lst.id,
        user_id=lst.user_id,
        name=lst.name,
        description=lst.description,
        is_public=lst.is_public,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
    )


@router.delete("/{list_id}/item/{media_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_list(
    list_id: str,
    media_item_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Remove a media item from a list.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        removed = await service.remove_item(
            list_id=list_id,
            user_id=current_user.id,
            media_item_id=media_item_id,
        )
        await db.flush()
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to remove item from list",
            list_id=list_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    logger.info("item removed from list", list_id=list_id, user_id=current_user.id, ip=ip)


@router.put("/{list_id}/item", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_list(
    list_id: str,
    body: ListItemReorder,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Reorder items in a list.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        ok = await service.reorder_items(
            list_id=list_id,
            user_id=current_user.id,
            media_item_ids=body.media_item_ids,
        )
        await db.flush()
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to reorder list",
            list_id=list_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    logger.info("list reordered", list_id=list_id, user_id=current_user.id, ip=ip)

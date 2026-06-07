from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.list.collaborators import router as collaborators_router
from otix.api.list.detail import router as detail_router
from otix.api.list.export import router as export_router
from otix.api.list.history import router as history_router
from otix.api.list.item import router as item_router
from otix.api.list.like import router as like_router
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.list import UserListCreate, UserListOut
from otix.services.list_service import ListService

logger = structlog.get_logger()

list_router = APIRouter(prefix="/list", tags=["list"])


@list_router.post("", response_model=UserListOut, status_code=status.HTTP_201_CREATED)
async def create_list(
    body: UserListCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> UserListOut:
    """Create a new list for the authenticated user.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    service = ListService(db)
    try:
        lst = await service.create_list(
            user_id=current_user.id,
            name=body.name,
            description=body.description,
            is_public=body.is_public,
        )
        await db.flush()
    except Exception:
        await db.rollback()
        logger.exception("failed to create list", user_id=current_user.id, ip=ip)
        raise

    logger.info("list created", list_id=lst.id, user_id=current_user.id, ip=ip)
    return UserListOut(
        id=lst.id,
        user_id=lst.user_id,
        name=lst.name,
        description=lst.description,
        is_public=lst.is_public,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
    )


@list_router.get("", response_model=list[UserListOut])
async def discover_public_lists(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[UserListOut]:
    """List all public lists."""
    ip = client_ip(request)
    service = ListService(db)
    try:
        items, _ = await service.list_public_lists()
    except Exception:
        await db.rollback()
        logger.exception("failed to discover public lists", ip=ip)
        raise

    logger.info("public lists discovered", count=len(items), ip=ip)
    return [
        UserListOut(
            id=item.id,
            user_id=item.user_id,
            name=item.name,
            description=item.description,
            is_public=item.is_public,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]


@list_router.get("/mine", response_model=list[UserListOut])
async def my_lists(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UserListOut]:
    """List all lists owned by the authenticated user."""
    ip = client_ip(request)
    service = ListService(db)
    try:
        items = await service.list_user_lists(user_id=current_user.id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch user lists", user_id=current_user.id, ip=ip)
        raise

    logger.info("user lists fetched", count=len(items), user_id=current_user.id, ip=ip)
    return [
        UserListOut(
            id=item.id,
            user_id=item.user_id,
            name=item.name,
            description=item.description,
            is_public=item.is_public,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]


list_router.include_router(detail_router)
list_router.include_router(item_router)
list_router.include_router(collaborators_router)
list_router.include_router(like_router)
list_router.include_router(export_router)
list_router.include_router(history_router)

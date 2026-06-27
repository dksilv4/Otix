from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db, get_optional_user
from otix.domain.user import User
from otix.schemas.blueprint import BlueprintCreate, BlueprintDetailOut, BlueprintListOut, BlueprintUpdate
from otix.services.blueprint_service import BlueprintService

logger = structlog.get_logger()

blueprint_router = APIRouter(prefix="/blueprints", tags=["blueprints"])


@blueprint_router.post("", response_model=BlueprintDetailOut, status_code=status.HTTP_201_CREATED)
async def create_blueprint(
    body: BlueprintCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BlueprintDetailOut:
    """Create a new blueprint for the authenticated user."""
    ip = _client_ip(request)
    service = BlueprintService(db)
    try:
        bp = await service.create(
            user_id=current_user.id,
            title=body.title,
            description=body.description,
            blueprint_string=body.blueprint_string,
            parsed_data=body.parsed_data,
            tags=body.tags,
        )
        await db.flush()
    except Exception:
        await db.rollback()
        logger.exception("failed to create blueprint", user_id=current_user.id, ip=ip)
        raise

    logger.info("blueprint created", blueprint_id=bp.id, user_id=current_user.id, ip=ip)
    return BlueprintDetailOut(
        id=bp.id,
        user_id=bp.user_id,
        author_name=current_user.username,
        title=bp.title,
        description=bp.description,
        blueprint_string=bp.blueprint_string,
        parsed_data=bp.parsed_data,
        tags=bp.tags,
        downloads=bp.downloads,
        likes_count=0,
        has_liked=False,
        created_at=bp.created_at,
        updated_at=bp.updated_at,
    )


@blueprint_router.get("", response_model=list[BlueprintListOut])
async def list_blueprints(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
    search: str | None = Query(None, description="Search term for title/description"),
    sort: str = Query("created_at", pattern="^(created_at|downloads)$"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[BlueprintListOut]:
    """List blueprints with optional search, sorting, and pagination."""
    ip = _client_ip(request)
    service = BlueprintService(db)
    current_user_id = current_user.id if current_user else None
    try:
        items, total = await service.list(
            search=search,
            sort=sort,
            offset=offset,
            limit=limit,
            current_user_id=current_user_id,
        )
    except Exception:
        await db.rollback()
        logger.exception("failed to list blueprints", ip=ip)
        raise

    logger.info("blueprints listed", count=len(items), total=total, ip=ip)
    result = []
    bp_ids = [bp.id for bp in items]
    likes_batch = await service.get_likes_batch(bp_ids)
    has_liked_batch = await service.get_has_liked_batch(bp_ids, current_user_id) if current_user_id else {}
    for bp in items:
        author_name = bp.user.username if bp.user else ""
        likes_count = likes_batch.get(bp.id, 0)
        has_liked = has_liked_batch.get(bp.id, False)
        result.append(
            BlueprintListOut(
                id=bp.id,
                user_id=bp.user_id,
                author_name=author_name,
                title=bp.title,
                description=bp.description,
                parsed_data=bp.parsed_data,
                tags=bp.tags,
                downloads=bp.downloads,
                likes_count=likes_count,
                has_liked=has_liked,
                created_at=bp.created_at,
            )
        )
    return result


@blueprint_router.get("/{blueprint_id}", response_model=BlueprintDetailOut)
async def get_blueprint(
    blueprint_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> BlueprintDetailOut:
    """Get a single blueprint by ID."""
    ip = _client_ip(request)
    service = BlueprintService(db)
    try:
        bp = await service.get(blueprint_id)
    except Exception:
        await db.rollback()
        logger.exception("failed to get blueprint", blueprint_id=blueprint_id, ip=ip)
        raise

    if bp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blueprint not found")

    author_name = bp.user.username if bp.user else ""
    likes_count = await service.get_likes_count(bp.id)
    has_liked = False
    current_user_id = current_user.id if current_user else None
    if current_user_id:
        has_liked = await service.get_has_liked(bp.id, current_user_id)

    logger.info("blueprint fetched", blueprint_id=bp.id, ip=ip)
    return BlueprintDetailOut(
        id=bp.id,
        user_id=bp.user_id,
        author_name=author_name,
        title=bp.title,
        description=bp.description,
        blueprint_string=bp.blueprint_string,
        parsed_data=bp.parsed_data,
        tags=bp.tags,
        downloads=bp.downloads,
        likes_count=likes_count,
        has_liked=has_liked,
        created_at=bp.created_at,
        updated_at=bp.updated_at,
    )


@blueprint_router.patch("/{blueprint_id}", response_model=BlueprintDetailOut)
async def update_blueprint(
    blueprint_id: str,
    body: BlueprintUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BlueprintDetailOut:
    """Update a blueprint (owner only)."""
    ip = _client_ip(request)
    service = BlueprintService(db)
    try:
        bp = await service.update(
            blueprint_id=blueprint_id,
            user_id=current_user.id,
            title=body.title,
            description=body.description,
            blueprint_string=body.blueprint_string,
            parsed_data=body.parsed_data,
            tags=body.tags,
        )
        await db.flush()
    except Exception:
        await db.rollback()
        logger.exception("failed to update blueprint", blueprint_id=blueprint_id, user_id=current_user.id, ip=ip)
        raise

    if bp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blueprint not found or not owned by user")

    likes_count = await service.get_likes_count(bp.id)
    has_liked = await service.get_has_liked(bp.id, current_user.id)

    logger.info("blueprint updated", blueprint_id=bp.id, user_id=current_user.id, ip=ip)
    return BlueprintDetailOut(
        id=bp.id,
        user_id=bp.user_id,
        author_name=current_user.username,
        title=bp.title,
        description=bp.description,
        blueprint_string=bp.blueprint_string,
        parsed_data=bp.parsed_data,
        tags=bp.tags,
        downloads=bp.downloads,
        likes_count=likes_count,
        has_liked=has_liked,
        created_at=bp.created_at,
        updated_at=bp.updated_at,
    )


@blueprint_router.delete("/{blueprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_blueprint(
    blueprint_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a blueprint (owner only)."""
    ip = _client_ip(request)
    service = BlueprintService(db)
    try:
        deleted = await service.delete(blueprint_id=blueprint_id, user_id=current_user.id)
        await db.flush()
    except Exception:
        await db.rollback()
        logger.exception("failed to delete blueprint", blueprint_id=blueprint_id, user_id=current_user.id, ip=ip)
        raise

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blueprint not found or not owned by user")

    logger.info("blueprint deleted", blueprint_id=blueprint_id, user_id=current_user.id, ip=ip)


@blueprint_router.post("/{blueprint_id}/like", response_model=dict)
async def toggle_like_blueprint(
    blueprint_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Toggle like on a blueprint."""
    ip = _client_ip(request)
    service = BlueprintService(db)
    try:
        # Verify blueprint exists
        bp = await service.get(blueprint_id)
        if bp is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blueprint not found")

        is_liked, like_count = await service.like_toggle(
            blueprint_id=blueprint_id,
            user_id=current_user.id,
        )
        await db.flush()
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception("failed to toggle like", blueprint_id=blueprint_id, user_id=current_user.id, ip=ip)
        raise

    logger.info("blueprint like toggled", blueprint_id=blueprint_id, user_id=current_user.id, is_liked=is_liked, ip=ip)
    return {"is_liked": is_liked, "like_count": like_count}


@blueprint_router.post("/{blueprint_id}/download", response_model=dict)
async def increment_download(
    blueprint_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    """Increment download counter for a blueprint."""
    ip = _client_ip(request)
    service = BlueprintService(db)
    try:
        bp = await service.increment_downloads(blueprint_id=blueprint_id)
        await db.flush()
    except Exception:
        await db.rollback()
        logger.exception("failed to increment downloads", blueprint_id=blueprint_id, ip=ip)
        raise

    if bp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blueprint not found")

    logger.info("blueprint download incremented", blueprint_id=blueprint_id, downloads=bp.downloads, ip=ip)
    return {"downloads": bp.downloads}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"

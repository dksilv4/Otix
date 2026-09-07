from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.media import UserPlexItem, UserPlexLibrary, UserPlexServer
from otix.domain.user import User
from otix.schemas.auth import PlexLibraryDetailResponse, PlexLibraryListResponse

logger = structlog.get_logger()
router = APIRouter()


@router.get("/integrations/plex/libraries", response_model=PlexLibraryListResponse)
async def get_plex_libraries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlexLibraryListResponse:
    """Return all discovered Plex libraries with item counts and last-synced timestamps."""

    # Subquery: item count per library
    count_subq = (
        select(
            UserPlexItem.library_id,
            func.count(UserPlexItem.id).label("item_count"),
            func.max(UserPlexItem.updated_at).label("last_synced_at"),
        )
        .where(UserPlexItem.user_id == current_user.id)
        .group_by(UserPlexItem.library_id)
        .subquery()
    )

    rows = (
        await db.execute(
            select(
                UserPlexLibrary,
                UserPlexServer.name.label("server_name"),
                func.coalesce(count_subq.c.item_count, 0).label("item_count"),
                count_subq.c.last_synced_at.label("last_synced_at"),
            )
            .join(UserPlexServer, UserPlexServer.id == UserPlexLibrary.server_id)
            .outerjoin(count_subq, count_subq.c.library_id == UserPlexLibrary.id)
            .where(UserPlexLibrary.user_id == current_user.id)
            .order_by(UserPlexServer.name, UserPlexLibrary.title)
        )
    ).all()

    libraries = [
        PlexLibraryDetailResponse(
            id=lib.id,
            server_id=lib.server_id,
            server_name=server_name,
            section_key=lib.section_key,
            title=lib.title,
            library_type=lib.library_type,
            selected=lib.selected,
            item_count=item_count,
            last_synced_at=last_synced_at.isoformat() if last_synced_at else None,
        )
        for lib, server_name, item_count, last_synced_at in rows
    ]

    return PlexLibraryListResponse(libraries=libraries)

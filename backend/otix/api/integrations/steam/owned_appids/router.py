from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.media import UserSteamGame
from otix.domain.user import User

router = APIRouter()


@router.get("/integrations/steam/owned-appids")
async def steam_owned_appids(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return the set of Steam app IDs owned by the authenticated user.

    Used by the Steam plugin for free-to-keep ownership cross-reference.
    """
    result = await db.execute(
        select(UserSteamGame.steam_app_id).where(
            UserSteamGame.user_id == current_user.id,
        )
    )
    appids = [row[0] for row in result if row[0] is not None]
    return {"appids": appids}

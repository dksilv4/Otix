from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.user.activity import _fetch_user_activity_events
from otix.domain.user import User
from otix.services.friend_service import FriendService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/me/friends/activity")
async def get_friends_activity(
    request: Request,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Get aggregated recent activity from all friends."""
    ip = request.client.host if request.client else None
    user_id = current_user.id

    friend_service = FriendService(db)
    friends = await friend_service.get_friends(user_id)

    if not friends:
        logger.info("friends activity fetched — no friends", user_id=user_id, ip=ip)
        return []

    all_events: list[dict] = []

    for friend in friends:
        events = await _fetch_user_activity_events(friend.id, limit=limit)
        for event in events:
            event["user"] = {
                "id": friend.id,
                "username": friend.username,
                "avatar_url": friend.avatar_url,
            }
        all_events.extend(events)

    all_events.sort(key=lambda e: e["timestamp"], reverse=True)

    logger.info(
        "friends activity fetched", user_id=user_id, friend_count=len(friends), event_count=len(all_events), ip=ip
    )
    return all_events[:limit]

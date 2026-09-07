from __future__ import annotations

from fastapi import APIRouter

from otix.api.user.activity import router as activity_router
from otix.api.user.badges import router as badges_router
from otix.api.user.continue_watching import router as continue_watching_router
from otix.api.user.detail import router as detail_router
from otix.api.user.daily_activity import router as daily_activity_router
from otix.api.user.friend_feed import router as friend_feed_router
from otix.api.user.karma import router as karma_router
from otix.api.user.meta import router as meta_router
from otix.api.user.rating import router as rating_router
from otix.api.user.stats import router as stats_router

user_router = APIRouter(prefix="/users", tags=["users"])

user_router.include_router(meta_router)
user_router.include_router(detail_router)
user_router.include_router(rating_router)
user_router.include_router(karma_router)
user_router.include_router(badges_router)
user_router.include_router(stats_router)
user_router.include_router(activity_router)
user_router.include_router(continue_watching_router)
user_router.include_router(daily_activity_router)
user_router.include_router(friend_feed_router)

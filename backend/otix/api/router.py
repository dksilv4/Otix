from __future__ import annotations

from fastapi import APIRouter

from otix.api.admin import admin_router
from otix.api.auth import auth_router
from otix.api.company import company_router
from otix.api.discover import discover_router
from otix.api.episode_interaction import episode_interaction_router
from otix.api.follow import follow_router
from otix.api.friend import friend_router
from otix.api.interaction import interaction_router
from otix.api.library import library_router
from otix.api.list import list_router
from otix.api.media import media_router
from otix.api.metrics import metrics_router
from otix.api.mood import mood_router
from otix.api.notification import notification_router
from otix.api.onboarding import onboarding_router
from otix.api.people import people_router
from otix.api.review import review_router
from otix.api.review_vote import review_vote_router
from otix.api.spotify_playlists import spotify_playlists_router
from otix.api.track import track_router
from otix.api.upload import upload_router
from otix.api.user import user_router
from otix.api.workout import exercise_router, workout_router

api_router = APIRouter()
api_router.include_router(admin_router)
api_router.include_router(auth_router)
api_router.include_router(company_router)
api_router.include_router(discover_router)
api_router.include_router(friend_router)
api_router.include_router(follow_router)
api_router.include_router(media_router)
api_router.include_router(interaction_router)
api_router.include_router(episode_interaction_router)
api_router.include_router(library_router)
api_router.include_router(list_router)
api_router.include_router(people_router)
api_router.include_router(metrics_router)
api_router.include_router(mood_router)
api_router.include_router(notification_router)
api_router.include_router(onboarding_router)
api_router.include_router(review_router)
api_router.include_router(review_vote_router)
api_router.include_router(spotify_playlists_router)
api_router.include_router(track_router)
api_router.include_router(upload_router)
api_router.include_router(user_router)
api_router.include_router(workout_router)
api_router.include_router(exercise_router)


@api_router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

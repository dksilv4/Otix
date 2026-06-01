from __future__ import annotations

from fastapi import APIRouter

from otix.api.auth.core import auth_router as core_router
from otix.api.auth.google import auth_router as google_router
from otix.api.auth.integrations import auth_router as integrations_router
from otix.api.auth.plex import auth_router as plex_router
from otix.api.auth.spotify import auth_router as spotify_router
from otix.api.auth.steam import auth_router as steam_router
from otix.api.auth.tmdb import auth_router as tmdb_router

auth_router = APIRouter(prefix="/auth", tags=["auth"])
auth_router.include_router(core_router)
auth_router.include_router(steam_router)
auth_router.include_router(plex_router)
auth_router.include_router(tmdb_router)
auth_router.include_router(spotify_router)
auth_router.include_router(google_router)
auth_router.include_router(integrations_router)

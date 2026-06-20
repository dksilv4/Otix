from __future__ import annotations

from fastapi import APIRouter

from otix.api.library.local_games import router as local_games_router
from otix.api.library.plex import router as plex_router
from otix.api.library.spotify import router as spotify_router
from otix.api.library.steam import router as steam_router
from otix.api.library.tab import router as tab_router

library_router = APIRouter(prefix="/library", tags=["library"])

library_router.include_router(local_games_router)
library_router.include_router(plex_router)
library_router.include_router(spotify_router)
library_router.include_router(steam_router)
library_router.include_router(tab_router)

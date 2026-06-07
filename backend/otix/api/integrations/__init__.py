"""Non-auth integration endpoints (data retrieval, sync, webhooks).

These endpoints require an authenticated user but are NOT part of the
OAuth connection/linking flow. Auth-related integration endpoints
(for linking, unlinking, callbacks) live under otix.api.auth.oauth.
"""
from fastapi import APIRouter

from otix.api.integrations.plex.album_tracks import router as plex_album_tracks_router
from otix.api.integrations.plex.connect_info import router as plex_connect_info_router
from otix.api.integrations.plex.servers import router as plex_servers_router
from otix.api.integrations.plex.sessions import router as plex_sessions_router
from otix.api.integrations.plex.stream import router as plex_stream_router
from otix.api.integrations.plex.sync import router as plex_sync_router
from otix.api.integrations.plex.watchlist.sync import router as plex_watchlist_sync_router
from otix.api.integrations.plex.webhook import router as plex_webhook_router
from otix.api.integrations.spotify import router as spotify_router
from otix.api.integrations.spotify.recently_played.sync import router as spotify_rp_sync_router
from otix.api.integrations.spotify.sync import router as spotify_sync_router
from otix.api.integrations.steam.resolve_unmatched import router as steam_resolve_router
from otix.api.integrations.steam.scan import router as steam_scan_router
from otix.api.integrations.steam.wishlist.scan import router as steam_wishlist_scan_router
from otix.api.integrations.tmdb.rating_sync import router as tmdb_rating_sync_router
from otix.api.integrations.tmdb.watchlist_import import router as tmdb_watchlist_import_router
from otix.api.integrations.youtube.sync import router as youtube_sync_router

router = APIRouter()

router.include_router(plex_servers_router)
router.include_router(plex_sync_router)
router.include_router(plex_watchlist_sync_router)
router.include_router(plex_webhook_router)
router.include_router(plex_sessions_router)
router.include_router(plex_connect_info_router)
router.include_router(plex_album_tracks_router)
router.include_router(plex_stream_router)

router.include_router(spotify_router)
router.include_router(spotify_sync_router)
router.include_router(spotify_rp_sync_router)

router.include_router(steam_scan_router)
router.include_router(steam_wishlist_scan_router)
router.include_router(steam_resolve_router)

router.include_router(tmdb_rating_sync_router)
router.include_router(tmdb_watchlist_import_router)

router.include_router(youtube_sync_router)

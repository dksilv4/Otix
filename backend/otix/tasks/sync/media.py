"""Force rehydrate task — runs a full provider hydration pass for a single media item."""

from __future__ import annotations

import structlog
from sqlalchemy import select

from otix.domain.media import Album, ExternalID, Game, MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async
from otix.lib.types import JSONValue

logger = structlog.get_logger()


@app.task(
    name="sync.media.rehydrate",
    bind=True,
    max_retries=1,
    default_retry_delay=10,
)
def sync_media_rehydrate_task(self, task_id: str, media_item_id: str) -> dict:
    """Force a full provider hydration pass for a single media item."""
    return run_async(_force_rehydrate_media(task_id, media_item_id))


async def _rehydrate_emit(task_id: str, event_type: str, **data: JSONValue) -> None:
    from otix.lib.media_rehydrate_progress import publish_progress, store_progress
    await store_progress(task_id, event_type, **data)
    await publish_progress(task_id, event_type, **data)


async def _load_rehydrate_target(media_item_id: str) -> dict[str, JSONValue] | None:
    async with async_session() as session:
        item = await session.get(MediaItem, media_item_id)
        if item is None:
            return None

        rows = await session.scalars(
            select(ExternalID).where(ExternalID.media_item_id == media_item_id)
        )
        external_ids = {row.provider: row.external_id for row in rows}

        album = await session.get(Album, media_item_id) if item.media_type == "music" else None
        game = await session.get(Game, media_item_id) if item.media_type == "game" else None

        return {
            "id": item.id,
            "title": item.title,
            "media_type": item.media_type,
            "external_ids": external_ids,
            "spotify_id": album.spotify_id if album else None,
            "musicbrainz_id": album.musicbrainz_id if album else None,
            "steam_app_id": game.steam_app_id if game else None,
            "store_ids": game.store_ids if game and game.store_ids else {},
        }


async def _run_rehydrate_step(task_id: str, provider: str, label: str, fn) -> dict | None:
    await _rehydrate_emit(task_id, "provider_started", provider=provider, label=label)
    result = await fn()
    await _rehydrate_emit(task_id, "provider_complete", provider=provider, label=label, result=result or {})
    return result


async def _force_rehydrate_media(task_id: str, media_item_id: str) -> dict:
    from otix.lib.media_rehydrate_progress import store_result

    # Import provider-specific sync functions
    from otix.tasks.sync.tmdb import _sync_tmdb_media
    from otix.tasks.sync.igdb import _sync_igdb_game
    from otix.tasks.sync.steam import _sync_steam_update_app, _sync_steamgrid_game_by_platform
    from otix.tasks.sync.musicbrainz import _sync_musicbrainz_album
    from otix.tasks.sync.spotify import _sync_spotify_enrich_album, _sync_spotify_match_album
    from otix.tasks.sync.lastfm import _sync_lastfm_enrich_album
    from otix.tasks.sync.fanart import _sync_fanart_enrich
    from otix.tasks.sync.omdb import _sync_omdb_ratings

    try:
        target = await _load_rehydrate_target(media_item_id)
        if target is None:
            await _rehydrate_emit(task_id, "error", message="Media item not found")
            result = {"error": "Media item not found", "media_item_id": media_item_id}
            await store_result(task_id, result)
            return result

        media_type = str(target["media_type"])
        title = str(target["title"])
        external_ids = target["external_ids"] if isinstance(target["external_ids"], dict) else {}

        await _rehydrate_emit(task_id, "rehydrate_started", media_item_id=media_item_id, media_type=media_type, title=title)

        if media_type == "movie":
            tmdb_id = external_ids.get("tmdb")
            if not tmdb_id:
                raise ValueError("This movie does not have a TMDB id")
            await _run_rehydrate_step(task_id, "tmdb", "TMDB movie", lambda: _sync_tmdb_media(int(tmdb_id), "movie", force=True))
            await _run_rehydrate_step(task_id, "fanart", "Fanart images", lambda: _sync_fanart_enrich("movie", media_item_id))
            await _run_rehydrate_step(task_id, "omdb", "OMDb ratings", lambda: _sync_omdb_ratings(media_item_id))

        elif media_type == "show":
            tmdb_id = external_ids.get("tmdb")
            if not tmdb_id:
                raise ValueError("This show does not have a TMDB id")
            await _run_rehydrate_step(task_id, "tmdb", "TMDB show", lambda: _sync_tmdb_media(int(tmdb_id), "show", force=True))
            await _run_rehydrate_step(task_id, "fanart", "Fanart images", lambda: _sync_fanart_enrich("show", media_item_id))
            await _run_rehydrate_step(task_id, "omdb", "OMDb ratings", lambda: _sync_omdb_ratings(media_item_id))

        elif media_type == "game":
            igdb_id = external_ids.get("igdb")
            if not igdb_id:
                raise ValueError("This game does not have an IGDB id")
            await _run_rehydrate_step(task_id, "igdb", "IGDB game", lambda: _sync_igdb_game(int(igdb_id), force=True))
            await _run_rehydrate_step(task_id, "fanart", "Fanart images", lambda: _sync_fanart_enrich("game", media_item_id))

            latest = await _load_rehydrate_target(media_item_id) or target
            steam_app_id = latest.get("steam_app_id")
            if steam_app_id:
                await _run_rehydrate_step(task_id, "steam", "Steam data", lambda: _sync_steam_update_app(int(steam_app_id)))
                await _run_rehydrate_step(task_id, "steamgrid", "SteamGridDB artwork", lambda: _sync_steamgrid_game_by_platform("steam", int(steam_app_id)))

        elif media_type == "music":
            mbid = target.get("musicbrainz_id") or external_ids.get("musicbrainz")
            if not mbid:
                raise ValueError("This album does not have a MusicBrainz id")
            await _run_rehydrate_step(task_id, "musicbrainz", "MusicBrainz album", lambda: _sync_musicbrainz_album(str(mbid), force=True))

            latest = await _load_rehydrate_target(media_item_id) or target
            spotify_id = latest.get("spotify_id")
            if spotify_id:
                await _run_rehydrate_step(task_id, "spotify", "Spotify album", lambda: _sync_spotify_enrich_album(media_item_id, str(spotify_id)))
            else:
                await _run_rehydrate_step(task_id, "spotify", "Spotify match", lambda: _sync_spotify_match_album(media_item_id))
                latest = await _load_rehydrate_target(media_item_id) or target
                spotify_id = latest.get("spotify_id")
                if spotify_id:
                    await _run_rehydrate_step(task_id, "spotify", "Spotify album", lambda: _sync_spotify_enrich_album(media_item_id, str(spotify_id)))

            await _run_rehydrate_step(task_id, "lastfm", "Last.fm album", lambda: _sync_lastfm_enrich_album(media_item_id))
            await _run_rehydrate_step(task_id, "fanart", "Fanart images", lambda: _sync_fanart_enrich("music", media_item_id))

        else:
            raise ValueError(f"Unsupported media type: {media_type}")

        result = {"media_item_id": media_item_id, "media_type": media_type, "title": title}
        await store_result(task_id, result)
        await _rehydrate_emit(task_id, "rehydrate_complete", **result)
        return result
    except Exception as exc:
        logger.exception("media rehydrate failed", task_id=task_id, media_item_id=media_item_id)
        result = {"error": str(exc), "media_item_id": media_item_id}
        await store_result(task_id, result)
        await _rehydrate_emit(task_id, "error", message=str(exc), media_item_id=media_item_id)
        return result

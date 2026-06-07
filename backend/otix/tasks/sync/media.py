# TODO: Review this file
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
            select(ExternalID).where(
                ExternalID.entity_type == "media_item",
                ExternalID.entity_id == media_item_id,
            )
        )
        external_ids = {row.provider: row.external_id for row in rows}

        album = await session.get(Album, media_item_id) if item.media_type == "music" else None
        game = await session.get(Game, media_item_id) if item.media_type == "game" else None

        store_providers = {"steam", "epic", "gog", "origin", "uplay", "bnet", "eshop",
                          "xbox", "playstation", "nintendo", "itchio", "stadia"}
        return {
            "id": item.id,
            "title": item.title,
            "media_type": item.media_type,
            "external_ids": external_ids,
            "spotify_id": external_ids.get("spotify") if album else None,
            "musicbrainz_id": external_ids.get("musicbrainz") if album else None,
            "steam_app_id": external_ids.get("steam") if game else None,
            "store_ids": {k: v for k, v in external_ids.items() if k in store_providers} if game else {},
        }


async def _run_rehydrate_step(task_id: str, provider: str, label: str, fn) -> dict | None:
    await _rehydrate_emit(task_id, "provider_started", provider=provider, label=label)
    result = await fn()
    await _rehydrate_emit(task_id, "provider_complete", provider=provider, label=label, result=result or {})
    return result


async def _force_rehydrate_media(task_id: str, media_item_id: str) -> dict:
    from otix.lib.media_rehydrate_progress import store_result
    from otix.tasks.sync.fanart import _sync_fanart_enrich
    from otix.tasks.sync.igdb import _sync_igdb_game
    from otix.tasks.sync.lastfm import _sync_lastfm_enrich_album
    from otix.tasks.sync.musicbrainz import _sync_musicbrainz_album
    from otix.tasks.sync.omdb import _sync_omdb_ratings
    from otix.tasks.sync.steam import _sync_steam_update_app, _sync_steamgrid_game_by_name, _sync_steamgrid_game_by_platform
    from otix.tasks.sync.theaudiodb import _sync_theaudiodb_enrich_album

    # Import provider-specific sync functions
    from otix.tasks.sync.tmdb import _sync_tmdb_media

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
            if igdb_id:
                await _run_rehydrate_step(task_id, "igdb", "IGDB game", lambda: _sync_igdb_game(int(igdb_id), force=True))

            # Re-load after IGDB sync to pick up freshly extracted store IDs.
            # For Steam-seeded games (no IGDB), uses the IDs already in ExternalID.
            latest = await _load_rehydrate_target(media_item_id) or target
            store_ids = latest.get("store_ids") if isinstance(latest.get("store_ids"), dict) else {}

            steamgrid_enqueued = False
            for platform, pid in store_ids.items():
                if platform == "steam":
                    await _run_rehydrate_step(task_id, "steam", "Steam data",
                        lambda pid=pid: _sync_steam_update_app(int(pid)))
                    await _run_rehydrate_step(task_id, "steamgrid", "SteamGridDB artwork",
                        lambda pid=pid: _sync_steamgrid_game_by_platform("steam", int(pid)))
                    steamgrid_enqueued = True
                else:
                    await _run_rehydrate_step(task_id, "steamgrid", f"SteamGridDB ({platform})",
                        lambda platform=platform, pid=pid: _sync_steamgrid_game_by_platform(platform, pid))
                    steamgrid_enqueued = True

            # No store-platform IDs — fall back to name search (or cached SGDB ID).
            if not steamgrid_enqueued:
                all_eids = latest.get("external_ids") if isinstance(latest.get("external_ids"), dict) else {}
                sgdb_cached = "steamgrid" in all_eids
                label = "SteamGridDB (cached)" if sgdb_cached else "SteamGridDB (name search)"
                await _run_rehydrate_step(task_id, "steamgrid", label,
                    lambda: _sync_steamgrid_game_by_name(media_item_id))

        elif media_type == "music":
            mbid = target.get("musicbrainz_id") or external_ids.get("musicbrainz")
            if not mbid:
                raise ValueError("This album does not have a MusicBrainz id")
            await _run_rehydrate_step(task_id, "musicbrainz", "MusicBrainz album", lambda: _sync_musicbrainz_album(str(mbid), force=True))

            # Tier 2-3 pipeline: cross-platform IDs + supplementary metadata
            await _run_rehydrate_step(task_id, "theaudiodb", "TheAudioDB enrich", lambda: _sync_theaudiodb_enrich_album(media_item_id))

            await _run_rehydrate_step(task_id, "lastfm", "Last.fm album", lambda: _sync_lastfm_enrich_album(media_item_id))
            await _run_rehydrate_step(task_id, "fanart", "Fanart images", lambda: _sync_fanart_enrich("music", media_item_id))

        else:
            raise ValueError(f"Unsupported media type: {media_type}")

        # Invalidate all per-user media detail caches
        from otix.infrastructure.redis import get_redis
        redis = await get_redis()
        cache_pattern = f"media:detail:{media_item_id}:*"
        keys = [key async for key in redis.scan_iter(match=cache_pattern, count=100)]
        if keys:
            await redis.delete(*keys)
            logger.info("invalidated media detail caches", media_item_id=media_item_id, keys_deleted=len(keys))

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

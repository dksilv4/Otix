"""TMDB-backed full-hydration adapter for movies and shows."""

from __future__ import annotations

import time
from collections.abc import Awaitable

import structlog
from sqlalchemy import select

from otix.hydration.analytics import record_hydration_run
from otix.hydration.protocol import FullHydration, RelatedCandidate
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.metrics import HYDRATION_ITEM_DURATION, HYDRATION_STAGE_DURATION
from otix.providers.tmdb import TMDBProvider
from otix.services.completeness import set_completeness

logger = structlog.get_logger()


class TmdbHydration(FullHydration):
    provider_name = "tmdb"

    async def hydrate_complete(
        self, media_type: str, external_id: int | str, *, force: bool = False
    ) -> dict | None:
        from otix.tasks.sync.embedding import _generate_embedding
        from otix.tasks.sync.fanart import _sync_fanart_enrich
        from otix.tasks.sync.omdb import _sync_omdb_ratings
        from otix.tasks.sync.tmdb import (
            _hydrate_content_ratings,
            _hydrate_production_companies,
            _sync_tmdb_media,
        )

        start = time.monotonic()
        stages: dict[str, float] = {}
        status = "success"
        error: str | None = None
        item_id: str | None = None
        title: str | None = None

        async def staged(stage: str, coro: Awaitable):
            t0 = time.monotonic()
            try:
                return await coro
            finally:
                elapsed = time.monotonic() - t0
                stages[stage] = elapsed
                HYDRATION_STAGE_DURATION.observe(elapsed, provider="tmdb", media_type=media_type, stage=stage)

        try:
            result = await staged(
                "primary",
                _sync_tmdb_media(int(external_id), media_type, force=force, enqueue_enrichment=False),
            )
            if result is not None:
                item_id = result.get("otix_id")
                title = result.get("title")
            if item_id is None:
                item_id = await _resolve_media_item_id(media_type, external_id)
            if item_id is None:
                return None
            if title is None:
                title = await _load_title(item_id)

            await staged("fanart", _sync_fanart_enrich(media_type, item_id))
            await staged("omdb", _sync_omdb_ratings(item_id))
            if media_type == "show":
                await staged("content_ratings", _hydrate_content_ratings(item_id))
            await staged("companies", _hydrate_production_companies(item_id))
            await staged("embedding", _generate_embedding(item_id))

            t0 = time.monotonic()
            async with async_session() as session:
                score = await set_completeness(session, item_id)
                await session.commit()
            stages["completeness"] = time.monotonic() - t0

            logger.info(
                "media fully processed",
                title=title, media_type=media_type, provider="tmdb",
                otix_id=item_id, completeness=score, stages=stages,
            )
            return {"otix_id": item_id, "title": title, "stages": stages, "status": "success"}
        except Exception as exc:  # noqa: BLE001
            status = "error"
            error = str(exc)
            logger.exception(
                "media full hydration failed",
                media_type=media_type, provider="tmdb", external_id=external_id,
            )
            raise
        finally:
            total = time.monotonic() - start
            HYDRATION_ITEM_DURATION.observe(total, provider="tmdb", media_type=media_type)
            await record_hydration_run(
                item_id=item_id, title=title, media_type=media_type, provider="tmdb",
                stages=stages, total_seconds=total, status=status, error=error,
            )

    async def discover_seed(self, media_type: str, limit: int) -> list[int]:
        provider = TMDBProvider(await get_redis())
        ids: list[int] = []
        page = 1
        while len(ids) < limit and page <= 10:
            raw = (
                await provider.get_movie_popular(page)
                if media_type == "movie"
                else await provider.get_show_popular(page)
            )
            results = raw.get("results", [])
            if not results:
                break
            ids.extend(int(r["id"]) for r in results if r.get("id"))
            page += 1
        return ids[:limit]

    async def related_candidates(self, media_item_id: str) -> list[RelatedCandidate]:
        from otix.domain.media import ExternalID, MediaItem, Movie

        async with async_session() as session:
            item = await session.get(MediaItem, media_item_id)
            if item is None:
                return []
            ext = await session.scalar(
                select(ExternalID).where(
                    ExternalID.provider == "tmdb",
                    ExternalID.entity_type == "media_item",
                    ExternalID.entity_id == item.id,
                )
            )
            if ext is None:
                return []
            tmdb_id = int(ext.external_id)
            collection_tmdb_id: int | None = None
            if item.media_type == "movie":
                movie = await session.get(Movie, item.id)
                if movie is not None and movie.collection_id is not None:
                    coll_ext = await session.scalar(
                        select(ExternalID).where(
                            ExternalID.provider == "tmdb",
                            ExternalID.entity_type == "collection",
                            ExternalID.entity_id == movie.collection_id,
                        )
                    )
                    if coll_ext is not None:
                        collection_tmdb_id = int(coll_ext.external_id)

        candidates: list[RelatedCandidate] = []
        provider = TMDBProvider(await get_redis())
        try:
            raw = (
                await provider.get_movie_recommendations(tmdb_id)
                if item.media_type == "movie"
                else await provider.get_show_recommendations(tmdb_id)
            )
            candidates.extend(
                RelatedCandidate(item.media_type, int(r["id"])) for r in raw.get("results", []) if r.get("id")
            )
        except Exception:
            logger.warning("recommendations fetch failed", tmdb_id=tmdb_id, exc_info=True)
        try:
            raw = (
                await provider.get_movie_similar(tmdb_id)
                if item.media_type == "movie"
                else await provider.get_show_similar(tmdb_id)
            )
            candidates.extend(
                RelatedCandidate(item.media_type, int(r["id"]), priority=0.5)
                for r in raw.get("results", []) if r.get("id")
            )
        except Exception:
            logger.warning("similar fetch failed", tmdb_id=tmdb_id, exc_info=True)

        if collection_tmdb_id is not None:
            try:
                raw = await provider.get_collection(collection_tmdb_id)
                candidates.extend(
                    RelatedCandidate("movie", int(p["id"]), priority=2.0)
                    for p in raw.get("parts", []) if p.get("id")
                )
            except Exception:
                logger.warning("collection fetch failed", collection_tmdb_id=collection_tmdb_id, exc_info=True)

        return candidates

    async def hydrate_side_data(self, media_type: str) -> dict:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        from otix.domain.genre import Genre, MediaGenreType
        from otix.lib.genres import normalize_genre_names

        provider = TMDBProvider(await get_redis())
        raw = await provider.get_genres(media_type)
        names = normalize_genre_names(str(g["name"]) for g in raw.get("genres", []) if g.get("name"))
        if not names:
            return {"updated": 0}

        async with async_session() as session:
            existing = await session.scalars(select(Genre).where(Genre.slug.in_(list(names))))
            genres = {g.slug: g for g in existing}
            new: list[Genre] = []
            for slug, name in names.items():
                if slug not in genres:
                    genre = Genre(name=name, slug=slug)
                    genres[slug] = genre
                    new.append(genre)
            if new:
                session.add_all(new)
                await session.flush()
            for slug in names:
                await session.execute(
                    pg_insert(MediaGenreType)
                    .values(genre_id=genres[slug].id, media_type=media_type)
                    .on_conflict_do_nothing(constraint="genre_media_types_pkey")
                )
            await session.commit()
        return {"updated": len(names)}


async def _resolve_media_item_id(media_type: str, external_id: int | str) -> str | None:
    from otix.domain.media import ExternalID

    async with async_session() as session:
        ext = await session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "tmdb",
                ExternalID.external_id == str(external_id),
                ExternalID.entity_type == "media_item",
                ExternalID.media_type == media_type,
            )
        )
        return ext.entity_id if ext is not None else None


async def _load_title(item_id: str) -> str | None:
    from otix.domain.media import MediaItem

    async with async_session() as session:
        item = await session.get(MediaItem, item_id)
        return item.title if item is not None else None

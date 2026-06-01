"""Person deduplication and wikidata backfill tasks."""

from __future__ import annotations

import structlog
from sqlalchemy import and_, not_, select
from sqlalchemy import exists as sa_exists
from sqlalchemy.orm import joinedload

from otix.domain.media import ExternalID
from otix.domain.people import Person
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async

logger = structlog.get_logger()


@app.task(name="maintenance.dedupe_people")
def dedupe_people() -> dict:
    """Merge duplicate Person records (same case-insensitive name).

    Runs safe dedup (at least one record has zero external IDs) followed by
    cross-provider dedup (wikidata_id, name+birthday, non-overlapping providers).
    Can be triggered manually or scheduled via Celery beat.
    """
    return run_async(_dedupe_people())


async def _dedupe_people() -> dict:
    from otix.services.person_service import dedupe_all_people

    async with async_session() as session:
        # Phase 1: Safe dedup (name-based, at least one has no external IDs)
        safe_result = await dedupe_all_people(session, cross_provider=False)

        # Phase 2: Cross-provider dedup (wikidata, name+birthday, non-overlapping)
        cross_result = await dedupe_all_people(session, cross_provider=True)

    return {
        "safe": safe_result,
        "cross_provider": cross_result,
        "total_merged": safe_result["people_merged"] + cross_result["people_merged"],
        "total_credits": safe_result["credits_reassigned"] + cross_result["credits_reassigned"],
    }


@app.task(name="maintenance.backfill_person_wikidata")
def backfill_person_wikidata() -> dict:
    """Backfill wikidata_id on Person records that have TMDB or MusicBrainz IDs.

    Fetches person/artist details from TMDB and MusicBrainz APIs, extracts
    wikidata_id, and stores it on the Person record. After backfill, the
    cross-provider dedup can merge records that now share a wikidata_id.
    """
    return run_async(_backfill_person_wikidata())


async def _backfill_person_wikidata() -> dict:
    from otix.providers.musicbrainz.client import MusicBrainzProvider
    from otix.providers.musicbrainz.transformer import extract_wikidata_id
    from otix.providers.tmdb.client import TMDBProvider

    redis = await get_redis()
    tmdb = TMDBProvider(redis)
    mb = MusicBrainzProvider(redis)

    async with async_session() as session:
        # Backfill TMDB people (with tmdb_id but no wikidata_id)
        has_tmdb = sa_exists().where(
            ExternalID.provider == "tmdb",
            ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        no_wikidata = sa_exists().where(
            ExternalID.provider == "wikidata",
            ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        tmdb_people = list(
            (
                await session.scalars(
                    select(Person)
                    .options(joinedload(Person._external_ids))
                    .where(
                        has_tmdb,
                        not_(no_wikidata),
                    )
                    .limit(100)
                )
            )
            .unique()
            .all()
        )

        tmdb_filled = 0
        for person in tmdb_people:
            try:
                raw = await tmdb.get_person(person.tmdb_id)
                wiki_id = (
                    raw.get("external_ids", {}).get("wikidata_id")
                    if isinstance(raw.get("external_ids"), dict)
                    else None
                )
                if wiki_id:
                    # Check for conflict
                    conflict = await session.scalar(
                        select(Person)
                        .join(
                            ExternalID,
                            and_(
                                ExternalID.entity_id == Person.id,
                                ExternalID.entity_type == "person",
                                ExternalID.provider == "wikidata",
                                ExternalID.external_id == str(wiki_id),
                            ),
                        )
                        .where(
                            Person.id != person.id,
                        )
                    )
                    if conflict is not None:
                        logger.info(
                            "wikidata_backfill_conflict",
                            person_id=person.id,
                            person_name=person.name,
                            wikidata_id=wiki_id,
                            conflict_id=conflict.id,
                            conflict_name=conflict.name,
                        )
                        continue
                    person.wikidata_id = wiki_id
                    tmdb_filled += 1
            except Exception:
                logger.debug("wikidata_backfill_tmdb_failed", tmdb_id=person.tmdb_id)

        if tmdb_filled:
            await session.commit()
            logger.info("wikidata_backfill_tmdb_complete", filled=tmdb_filled)

        # Backfill MusicBrainz artists (with MBID but no wikidata_id)
        has_mb = sa_exists().where(
            ExternalID.provider == "musicbrainz",
            ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        mb_people = list(
            (
                await session.scalars(
                    select(Person)
                    .options(joinedload(Person._external_ids))
                    .where(
                        has_mb,
                        not_(no_wikidata),
                    )
                    .limit(50)
                )
            )
            .unique()
            .all()
        )

        mb_filled = 0
        for person in mb_people:
            try:
                raw = await mb.get_artist(person.musicbrainz_artist_id)
                relations = raw.get("relations")
                wiki_id = extract_wikidata_id(relations if isinstance(relations, list) else None)
                if wiki_id:
                    conflict = await session.scalar(
                        select(Person)
                        .join(
                            ExternalID,
                            and_(
                                ExternalID.entity_id == Person.id,
                                ExternalID.entity_type == "person",
                                ExternalID.provider == "wikidata",
                                ExternalID.external_id == str(wiki_id),
                            ),
                        )
                        .where(
                            Person.id != person.id,
                        )
                    )
                    if conflict is not None:
                        logger.info(
                            "wikidata_backfill_mb_conflict",
                            person_id=person.id,
                            person_name=person.name,
                            wikidata_id=wiki_id,
                            conflict_id=conflict.id,
                            conflict_name=conflict.name,
                        )
                        continue
                    person.wikidata_id = wiki_id
                    mb_filled += 1
            except Exception:
                logger.debug("wikidata_backfill_mb_failed", mbid=person.musicbrainz_artist_id)

        if mb_filled:
            await session.commit()
            logger.info("wikidata_backfill_mb_complete", filled=mb_filled)

    return {"tmdb_filled": tmdb_filled, "mb_filled": mb_filled}

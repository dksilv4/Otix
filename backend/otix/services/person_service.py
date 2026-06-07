# TODO: Review this file
"""Person merge utilities for deduplicating artist/person records."""

from __future__ import annotations

import structlog
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.media import ExternalID
from otix.domain.people import MediaCredit, Person, PersonAsset, UserPersonFollow

logger = structlog.get_logger()


async def merge_person(
    db: AsyncSession,
    source_id: str,
    target_id: str,
) -> int:
    """Merge source person into target person.

    Reassigns all credits, assets, and followers from source → target,
    copies over any external IDs the target is missing, then deletes source.

    Returns the number of credits that were reassigned.
    """
    if source_id == target_id:
        return 0

    source = await db.scalar(select(Person).where(Person.id == source_id))
    target = await db.scalar(select(Person).where(Person.id == target_id))
    if source is None or target is None:
        return 0

    # ── Reassign media_credits ──
    # Skip credits where target already has the same (media_item, role) to
    # avoid unique-constraint violations or duplicate credits after merge.
    existing_credits = (
        await db.scalars(
            select(MediaCredit.media_item_id, MediaCredit.role)
            .where(MediaCredit.person_id == target_id)
        )
    ).all()
    existing_credit_set = set(existing_credits)

    reassigned = 0
    source_credits = (
        await db.scalars(
            select(MediaCredit).where(MediaCredit.person_id == source_id)
        )
    ).all()

    for credit in source_credits:
        if (credit.media_item_id, credit.role) in existing_credit_set:
            await db.delete(credit)
        else:
            credit.person_id = target_id
            reassigned += 1

    # ── Reassign person_assets ──
    source_assets = (
        await db.scalars(
            select(PersonAsset).where(PersonAsset.person_id == source_id)
        )
    ).all()
    for asset in source_assets:
        asset.person_id = target_id

    # ── Reassign user_person_follows ──
    source_follows = (
        await db.scalars(
            select(UserPersonFollow).where(UserPersonFollow.person_id == source_id)
        )
    ).all()
    for follow in source_follows:
        existing = await db.scalar(
            select(UserPersonFollow).where(
                UserPersonFollow.user_id == follow.user_id,
                UserPersonFollow.person_id == target_id,
            )
        )
        if existing:
            await db.delete(follow)
        else:
            follow.person_id = target_id

    # ── Copy external IDs from source → target (where target is null) ──
    id_fields = [
        "tmdb_id",
        "imdb_id",
        "musicbrainz_artist_id",
        "spotify_artist_id",
        "wikidata_id",
        "youtube_channel_id",
        "youtube_channel_title",
        "spotify_follower_count",
        "spotify_popularity",
        "spotify_genres",
        "spotify_image_url",
        "photo_url",
        "logo_url",
        "biography",
        "birthday",
        "deathday",
        "place_of_birth",
    ]
    for field in id_fields:
        src_val = getattr(source, field, None)
        tgt_val = getattr(target, field, None)
        if src_val is not None and tgt_val is None:
            setattr(target, field, src_val)

    # ── Delete source person ──
    await db.delete(source)
    await db.flush()

    logger.info(
        "merged_person",
        source_id=source_id,
        source_name=source.name,
        target_id=target_id,
        target_name=target.name,
        credits_reassigned=reassigned,
    )
    return reassigned


EXT_ID_FIELDS = [
    "musicbrainz_artist_id",
    "spotify_artist_id",
    "tmdb_id",
    "imdb_id",
]


def _count_ext_ids(person: Person) -> int:
    return sum(1 for f in EXT_ID_FIELDS if getattr(person, f) is not None)


def _ext_id_providers(person: Person) -> set[str]:
    """Return which provider categories have external IDs on this person."""
    providers: set[str] = set()
    if person.tmdb_id or person.imdb_id:
        providers.add("tmdb")
    if person.musicbrainz_artist_id:
        providers.add("musicbrainz")
    if person.spotify_artist_id:
        providers.add("spotify")
    return providers


def _providers_overlap(a: Person, b: Person) -> bool:
    """Check if two people share any provider category (same provider conflict)."""
    pa = _ext_id_providers(a)
    pb = _ext_id_providers(b)
    return bool(pa & pb)


async def find_person_duplicates(
    db: AsyncSession,
    min_name_length: int = 3,
    safe_only: bool = True,
    cross_provider: bool = False,
) -> list[tuple[str, list[Person]]]:
    """Find groups of people with the same case-insensitive name.

    When safe_only=True (default), only returns groups where at least one
    person has zero external IDs — i.e. a bare Plex-created record that
    should be merged into a richer record. This avoids incorrectly merging
    two well-identified TMDB actors who merely share a name.

    When cross_provider=True, also returns groups where people have
    non-overlapping external ID sets (different providers) — e.g. one has
    TMDB IDs and another has MusicBrainz IDs for the same real person.

    People with more external IDs are sorted first in each group (merge target).
    """
    from sqlalchemy import func as sa_func

    name_lower_col = sa_func.lower(Person.name)

    dup_names = (
        select(name_lower_col.label("name_lower"))
        .where(sa_func.length(Person.name) >= min_name_length)
        .group_by(name_lower_col)
        .having(sa_func.count(Person.id) > 1)
    ).subquery()

    all_people = (
        await db.scalars(
            select(Person)
            .options(joinedload(Person._external_ids))
            .join(dup_names, name_lower_col == dup_names.c.name_lower)
            .order_by(name_lower_col)
        )
    ).all()

    by_name: dict[str, list[Person]] = {}
    for p in all_people:
        nl = p.name.lower()
        by_name.setdefault(nl, []).append(p)

    groups: list[tuple[str, list[Person]]] = []
    for name_lower, people in by_name.items():
        if len(people) < 2:
            continue

        all_have_ids = all(_count_ext_ids(p) > 0 for p in people)

        if safe_only and not cross_provider:
            if all_have_ids:
                continue
        elif all_have_ids and cross_provider:
            # Check for non-overlapping provider sets (cross-provider dupes)
            # Only include if at least one pair has non-overlapping providers
            # and no pair has conflicting same-provider IDs
            has_cross_provider_match = False
            has_provider_conflict = False
            for i, p1 in enumerate(people):
                for p2 in people[i + 1:]:
                    if _providers_overlap(p1, p2):
                        has_provider_conflict = True
                        break
                    if _ext_id_providers(p1) and _ext_id_providers(p2):
                        has_cross_provider_match = True
                if has_provider_conflict:
                    break
            if has_provider_conflict or not has_cross_provider_match:
                continue

        people.sort(key=_count_ext_ids, reverse=True)
        groups.append((name_lower, people))

    return groups


async def find_wikidata_duplicates(
    db: AsyncSession,
) -> list[tuple[str, list[Person]]]:
    """Find groups of people sharing the same wikidata_id.

    This is the highest-confidence cross-provider match — Wikidata IDs are
    a universal identifier across TMDB and MusicBrainz.
    """
    from sqlalchemy import func as sa_func

    dup_wiki = (
        select(ExternalID.external_id.label("wikidata_id"))
        .where(
            ExternalID.provider == "wikidata",
            ExternalID.entity_type == "person",
        )
        .group_by(ExternalID.external_id)
        .having(sa_func.count(ExternalID.entity_id) > 1)
    ).subquery()

    people = (
        await db.scalars(
            select(Person)
            .options(joinedload(Person._external_ids))
            .join(ExternalID, and_(
                ExternalID.entity_id == Person.id,
                ExternalID.entity_type == "person",
                ExternalID.provider == "wikidata",
            ))
            .join(dup_wiki, ExternalID.external_id == dup_wiki.c.wikidata_id)
            .order_by(ExternalID.external_id)
        )
    ).all()

    by_wiki: dict[str, list[Person]] = {}
    for p in people:
        by_wiki.setdefault(p.wikidata_id, []).append(p)

    groups: list[tuple[str, list[Person]]] = []
    for wiki_id, group in by_wiki.items():
        if len(group) < 2:
            continue
        group.sort(key=_count_ext_ids, reverse=True)
        groups.append((wiki_id, group))

    return groups


async def find_name_birthday_duplicates(
    db: AsyncSession,
    min_name_length: int = 3,
) -> list[tuple[str, list[Person]]]:
    """Find people with the same normalized name AND same birthday.

    High-confidence cross-provider match — two records with the same name
    and birth date are almost certainly the same person, even if they have
    external IDs from different providers.
    """
    from sqlalchemy import func as sa_func

    name_lower_col = sa_func.lower(Person.name)

    dup_key = (
        select(name_lower_col.label("name_lower"), Person.birthday)
        .where(
            sa_func.length(Person.name) >= min_name_length,
            Person.birthday.isnot(None),
        )
        .group_by(name_lower_col, Person.birthday)
        .having(sa_func.count(Person.id) > 1)
    ).subquery()

    people = (
        await db.scalars(
            select(Person)
            .options(joinedload(Person._external_ids))
            .join(
                dup_key,
                sa_func.and_(
                    name_lower_col == dup_key.c.name_lower,
                    Person.birthday == dup_key.c.birthday,
                ),
            )
            .order_by(name_lower_col, Person.birthday)
        )
    ).all()

    by_key: dict[tuple, list[Person]] = {}
    for p in people:
        key = (p.name.lower(), p.birthday)
        by_key.setdefault(key, []).append(p)

    groups: list[tuple[str, list[Person]]] = []
    for (name_lower, _), group in by_key.items():
        if len(group) < 2:
            continue
        group.sort(key=_count_ext_ids, reverse=True)
        groups.append((name_lower, group))

    return groups


async def find_all_cross_provider_duplicates(
    db: AsyncSession,
) -> list[tuple[str, list[Person]]]:
    """Find all cross-provider duplicates using multiple matching strategies.

    Returns combined results from:
    1. wikidata_id matches (highest confidence)
    2. name + birthday matches (high confidence)
    3. name matches with non-overlapping external ID sets (medium confidence)
    """
    merged_ids: set[str] = set()
    all_groups: list[tuple[str, list[Person]]] = []

    # Tier 1: wikidata_id matches (gold standard)
    wiki_groups = await find_wikidata_duplicates(db)
    for key, group in wiki_groups:
        group_ids = {p.id for p in group}
        if not group_ids & merged_ids:
            all_groups.append((f"wikidata:{key}", group))
            merged_ids.update(group_ids)

    # Tier 2: name + birthday matches
    bday_groups = await find_name_birthday_duplicates(db)
    for key, group in bday_groups:
        group_ids = {p.id for p in group}
        if not group_ids & merged_ids:
            all_groups.append((f"name+bday:{key}", group))
            merged_ids.update(group_ids)

    # Tier 3: name matches with non-overlapping provider sets
    name_groups = await find_person_duplicates(db, cross_provider=True)
    for key, group in name_groups:
        group_ids = {p.id for p in group}
        if not group_ids & merged_ids:
            all_groups.append((f"name:{key}", group))
            merged_ids.update(group_ids)

    return all_groups


async def dedupe_all_people(db: AsyncSession, cross_provider: bool = False) -> dict:
    """Find and merge all duplicate people. Returns summary of merges performed.

    When cross_provider=True, uses multi-strategy matching (wikidata_id,
    name+birthday, non-overlapping provider sets) in addition to safe name matching.
    """
    if cross_provider:
        groups = await find_all_cross_provider_duplicates(db)
    else:
        groups = await find_person_duplicates(db, safe_only=True)

    total_merged = 0
    total_credits = 0

    for _group_key, people in groups:
        target = people[0]
        for source in people[1:]:
            credits = await merge_person(db, source.id, target.id)
            total_merged += 1
            total_credits += credits

    await db.commit()

    logger.info(
        "dedupe_people_complete",
        groups_found=len(groups),
        people_merged=total_merged,
        credits_reassigned=total_credits,
        cross_provider=cross_provider,
    )
    return {
        "groups_found": len(groups),
        "people_merged": total_merged,
        "credits_reassigned": total_credits,
    }

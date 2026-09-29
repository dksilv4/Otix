"""Database seeding and hydration logic for TMDB entities.

Hydrates raw TMDB payloads into the Django database models: MediaItem, Movie, Show,
Season, Episode, MediaAsset, MediaCredit, Person, Company, MediaRelease, MediaVideo,
and ExternalID rows.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from apps.company.models import Company, InvolvedCompany
from apps.media.models import (
    Episode,
    ExternalID,
    ExternalRating,
    MediaAsset,
    MediaItem,
    MediaRelease,
    MediaVideo,
    Movie,
    Season,
    Show,
)
from apps.media.models.genre import Genre, Keyword, MediaGenre, MediaGenreType, MediaKeyword
from apps.media.services.catalog_lifecycle import finish_catalog_seed
from apps.media.services.completeness import recompute_completeness
from apps.media.services.genre_simplification import simplify_genre_names
from apps.media.services.identity import attach_external_id, find_media_id
from apps.people.models import MediaCredit, Person
from core.providers.framework import (
    atomic_seed,
    prefetch_external_ids,
    safe_bulk_create,
)
from core.providers.tmdb.transformers import image_url

GENRE_MEDIA_TYPE = "movie"
_COMPANY_CT: ContentType | None = None


def _parse_date(raw: str | None) -> date | None:
    """Parse a TMDB 'YYYY-MM-DD' string to a date object."""
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except (ValueError, TypeError):
        return None


def _is_anime(raw: dict[str, Any]) -> bool:
    """Anime heuristic from TMDB detail (language + keywords + genres)."""
    keywords = [k.get("name", "").lower() for k in (raw.get("keywords") or {}).get("keywords", [])]
    language = (raw.get("original_language") or "").lower()
    if "anime" in language or "anime" in keywords:
        return True
    genres = {str(g.get("name", "")).lower() for g in raw.get("genres", []) if g.get("name")}
    return language == "ja" and "animation" in genres


def _genre_names(raw: dict[str, Any]) -> list[str]:
    """Names from the detail response's genres list, in order, simplified."""
    raw_names = [str(g["name"]) for g in raw.get("genres", []) if g.get("name")]
    return simplify_genre_names(raw_names)


def _upsert_genres(media: MediaItem, names: list[str], media_type: str = GENRE_MEDIA_TYPE) -> None:
    """Link canonical Genre rows to media (dedup by name/slug)."""
    for name in simplify_genre_names(names):
        genre, _ = Genre.objects.get_or_create(name=name, defaults={"slug": slugify(name)})
        MediaGenreType.objects.get_or_create(genre=genre, media_type=media_type)
        MediaGenre.objects.get_or_create(media_item=media, genre=genre)


def _upsert_asset(media: MediaItem, url: str | None, asset_type: str, score: int) -> None:
    """Store one image as a media asset (unique on item+url+type)."""
    if not url:
        return
    MediaAsset.objects.get_or_create(
        media_item=media,
        url=url,
        asset_type=asset_type,
        defaults={"label": "official", "provider": "tmdb", "score": score},
    )


def _credit_photo(entry: dict[str, Any]) -> str | None:
    return image_url(entry.get("profile_path"), size="w500")


def _resolve_persons(entries: list[dict[str, Any]]) -> dict[int, Person]:
    """Resolve credit persons by their TMDB ExternalID, creating stubs as needed.

    Uses ``prefetch_external_ids`` from ``core.providers.framework`` for single-query
    resolution across the batch.
    """
    wanted: dict[int, dict[str, Any]] = {}
    for entry in entries:
        tid = entry.get("id")
        name = (entry.get("name") or "").strip()
        if tid is None or not name:
            continue
        wanted.setdefault(int(tid), entry)
    if not wanted:
        return {}

    content_type = ContentType.objects.get_for_model(Person)
    tmdb_ids = {str(t) for t in wanted}
    existing_map = prefetch_external_ids(
        provider="tmdb", external_ids=tmdb_ids, content_type=content_type
    )

    persons: dict[int, Person] = {}
    if existing_map:
        object_ids = list(existing_map.values())
        by_pk = {p.pk: p for p in Person.objects.filter(pk__in=object_ids)}
        for external_id_str, object_id in existing_map.items():
            person = by_pk.get(object_id)
            if person is None:
                continue
            if person.photo_url is None:
                photo = _credit_photo(wanted.get(int(external_id_str)) or {})
                if photo:
                    person.photo_url = photo
                    person.save(update_fields=("photo_url",))
            persons[int(external_id_str)] = person

    for tid, entry in wanted.items():
        if tid in persons:
            continue
        person = Person.objects.create(
            name=entry["name"].strip(),
            photo_url=_credit_photo(entry),
        )
        ExternalID.objects.get_or_create(
            content_type=content_type,
            provider="tmdb",
            external_id=str(tid),
            defaults={"object_id": person.pk},
        )
        persons[tid] = person
    return persons


def _upsert_credits(media: MediaItem, raw: dict[str, Any]) -> None:
    """Snapshot-replace a title's cast/crew credits from TMDB detail credits.

    Uses ``safe_bulk_create`` from ``core.providers.framework`` to guarantee
    parameter limits are never exceeded.
    """
    credits = raw.get("credits") or {}
    if not credits:
        return
    cast = credits.get("cast") or []
    crew = credits.get("crew") or []
    if not cast and not crew:
        return
    persons = _resolve_persons([*cast, *crew])
    MediaCredit.objects.filter(media_item=media).delete()
    rows: list[MediaCredit] = []
    for entry in cast:
        person = persons.get(entry.get("id"))
        if person is None:
            continue
        rows.append(
            MediaCredit(
                media_item=media,
                person=person,
                role="cast",
                character_name=entry.get("character"),
                sort_order=entry.get("order", 0),
            )
        )
    for entry in crew:
        person = persons.get(entry.get("id"))
        if person is None:
            continue
        rows.append(
            MediaCredit(
                media_item=media,
                person=person,
                role="crew",
                character_name=entry.get("job"),
                sort_order=entry.get("order", 0),
            )
        )
    if rows:
        safe_bulk_create(MediaCredit, rows, ignore_conflicts=False)


def _upsert_external(
    content_type: ContentType,
    object_id: int,
    provider: str,
    external_id: str,
    media_type: str | None = "movie",
) -> None:
    """Create-or-update one ExternalID row keyed by its natural key."""
    row, created = ExternalID.objects.get_or_create(
        content_type=content_type,
        provider=provider,
        external_id=external_id,
        media_type=media_type,
        defaults={"object_id": object_id},
    )
    if not created and row.object_id != object_id:
        row.object_id = object_id
        row.save(update_fields=("object_id", "updated_at"))


def _company_content_type() -> ContentType:
    global _COMPANY_CT
    if _COMPANY_CT is None:
        _COMPANY_CT = ContentType.objects.get_for_model(Company)
    return _COMPANY_CT


def _clean_cert(value: Any) -> str | None:
    cert = str(value or "").strip()
    return cert or None


def _image_entry_asset(media: MediaItem, entry: Any, asset_type: str, score: int) -> None:
    if not isinstance(entry, dict):
        return
    url = image_url(entry.get("file_path"), size="original")
    if not url:
        return
    _upsert_asset(media, url, asset_type, score)


def _upsert_involved_companies(media: MediaItem, raw: dict[str, Any]) -> None:
    """Link the detail's companies as production companies."""
    entries = list(raw.get("production_companies") or [])
    if media.media_type == "show":
        entries += list(raw.get("networks") or [])
    company_ct = _company_content_type()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        tmdb_id = entry.get("id")
        name = str(entry.get("name") or "").strip()
        if tmdb_id is None or not name:
            continue
        slug = slugify(name) or f"tmdb-company-{tmdb_id}"
        company, _ = Company.objects.get_or_create(
            slug=slug,
            defaults={
                "name": name,
                "logo_url": image_url(entry.get("logo_path"), size="w185"),
                "origin_country": entry.get("origin_country") or None,
            },
        )
        _upsert_external(company_ct, company.pk, "tmdb", str(tmdb_id), media_type=None)
        row, _ = InvolvedCompany.objects.get_or_create(
            media_item=media, company=company, defaults={"production": True}
        )
        if not row.production:
            row.production = True
            row.save(update_fields=("production",))


def _preferred_release_entry(entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not entries:
        return None
    for entry in entries:
        if isinstance(entry, dict) and entry.get("release_type") == 3:
            return entry
    for entry in entries:
        if isinstance(entry, dict) and entry.get("release_date"):
            return entry
    return entries[0] if isinstance(entries[0], dict) else None


def _upsert_releases(media: MediaItem, raw: dict[str, Any]) -> None:
    """Map release dates and certifications onto MediaRelease rows.

    Movies store every dated TMDB release entry per country with its
    ``release_type`` (theatrical, digital, physical, …) so the calendar can
    label milestones. Shows store certification-only rows.
    """
    if media.media_type == "show":
        for country in (raw.get("content_ratings") or {}).get("results") or []:
            if not isinstance(country, dict):
                continue
            code = str(country.get("iso_3166_1") or "").upper()
            if not code:
                continue
            MediaRelease.objects.get_or_create(
                media_item=media,
                country_code=code,
                release_date=None,
                release_type=None,
                certification=_clean_cert(country.get("rating")),
            )
        return
    for group in (raw.get("release_dates") or {}).get("results") or []:
        if not isinstance(group, dict):
            continue
        code = str(group.get("iso_3166_1") or "").upper()
        if not code:
            continue
        entries = group.get("release_dates") or []
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            release_date = _parse_date(str(entry.get("release_date") or "")[:10])
            if release_date is None:
                continue
            raw_type = entry.get("release_type")
            release_type = raw_type if isinstance(raw_type, int) else None
            MediaRelease.objects.get_or_create(
                media_item=media,
                country_code=code,
                release_date=release_date,
                release_type=release_type,
                defaults={"certification": _clean_cert(entry.get("certification"))},
            )


def _upsert_videos(media: MediaItem, raw: dict[str, Any]) -> None:
    """Store the first 10 embeddable trailers/teasers as MediaVideos."""
    site_urls = {
        "YouTube": "https://www.youtube.com/watch?v={}",
        "Vimeo": "https://vimeo.com/{}",
    }
    added = 0
    for entry in (raw.get("videos") or {}).get("results") or []:
        if not isinstance(entry, dict) or added >= 10:
            continue
        template = site_urls.get(entry.get("site"))
        key = entry.get("key")
        provider_id = entry.get("id")
        if not template or not key or provider_id is None:
            continue
        _, created = MediaVideo.objects.get_or_create(
            media_item=media,
            provider="tmdb",
            provider_id=str(provider_id),
            defaults={
                "url": template.format(key),
                "video_type": entry.get("type") or None,
            },
        )
        added += int(created)


def _upsert_keywords(media: MediaItem, raw: dict[str, Any]) -> None:
    """Link the detail's keywords as Keyword + MediaKeyword rows."""
    container = raw.get("keywords")
    if isinstance(container, list):
        entries = container
    elif isinstance(container, dict):
        entries = container.get("keywords") or container.get("results") or []
    else:
        entries = []
    existing = set(
        MediaKeyword.objects.filter(media_item=media).values_list("keyword_id", flat=True)
    )
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        keyword, _ = Keyword.objects.get_or_create(name=name)
        if keyword.pk in existing:
            continue
        existing.add(keyword.pk)
        MediaKeyword.objects.create(media_item=media, keyword=keyword)


def _upsert_tmdb_images(media: MediaItem, raw: dict[str, Any]) -> None:
    """Store supplementary artwork families from the appended images payload."""
    images = raw.get("images")
    if not isinstance(images, dict):
        return
    for i, entry in enumerate((images.get("backdrops") or [])[:8]):
        _image_entry_asset(media, entry, "backdrop", 60 - i * 5)
    for i, entry in enumerate((images.get("logos") or [])[:8]):
        _image_entry_asset(media, entry, "logo", 60 - i * 5)
    textless = [e for e in (images.get("posters") or []) if e.get("iso_639_1") is None]
    for i, entry in enumerate(textless[:8]):
        _image_entry_asset(media, entry, "textless_poster", 60 - i * 5)


def _upsert_tmdb_rating(media: MediaItem, raw: dict[str, Any]) -> None:
    """Record the title's vote_average/vote_count as a TMDB ExternalRating."""
    score = raw.get("vote_average")
    if score is None:
        return
    score = float(score)
    if score <= 0 and not (raw.get("vote_count") or 0):
        return
    vote_count = raw.get("vote_count") or 0
    row = ExternalRating.objects.filter(media_item=media, provider="tmdb").first()
    if row is None:
        ExternalRating.objects.create(
            media_item=media,
            provider="tmdb",
            score=score,
            max_score=10.0,
            vote_count=vote_count,
        )
        return
    changes = {
        key: val
        for key, val in (("score", score), ("vote_count", vote_count))
        if getattr(row, key) != val
    }
    if changes:
        for key, val in changes.items():
            setattr(row, key, val)
        row.save(update_fields=tuple(changes.keys()))


def _hydrate_relations(media: MediaItem, raw: dict[str, Any]) -> None:
    """Fold relations onto media: companies, releases, videos, keywords, artwork, rating."""
    _upsert_involved_companies(media, raw)
    _upsert_releases(media, raw)
    _upsert_videos(media, raw)
    _upsert_keywords(media, raw)
    _upsert_tmdb_images(media, raw)
    _upsert_tmdb_rating(media, raw)


def _attach_tmdb_crosswalk(media_id: int, raw: dict[str, Any], media_type: str) -> None:
    imdb_id = raw.get("imdb_id") or (raw.get("external_ids") or {}).get("imdb_id")
    if imdb_id:
        attach_external_id(media_id, "imdb", str(imdb_id), media_type)
    tvdb_id = (raw.get("external_ids") or {}).get("tvdb_id")
    if tvdb_id:
        attach_external_id(media_id, "tvdb", str(tvdb_id), media_type)


def _upsert_seasons(show_pk: int, raw: dict[str, Any]) -> None:
    """Upsert Season summary rows from a TV detail's embedded seasons array."""
    for season_data in raw.get("seasons", []) or []:
        number = season_data.get("season_number")
        if not number or int(number) <= 0:
            continue
        Season.objects.update_or_create(
            show_id=show_pk,
            season_number=int(number),
            defaults={
                "name": season_data.get("name"),
                "overview": season_data.get("overview"),
                "poster_url": image_url(season_data.get("poster_path"), size="original"),
                "air_date": _parse_date(season_data.get("air_date")),
            },
        )
        if "episodes" in season_data and isinstance(season_data["episodes"], list):
            seed_episodes_from_season(show_pk, int(number), season_data)


# ── Public Hydrator Entry Points ─────────────────────────────────


def _upsert_movie_collection(media: MediaItem, raw: dict[str, Any]) -> None:
    coll_data = raw.get("belongs_to_collection")
    if not coll_data or not isinstance(coll_data, dict):
        return
    from apps.lists.services.collection import upsert_collection_from_tmdb

    upsert_collection_from_tmdb(coll_data, media)


@atomic_seed
def seed_movie_from_tmdb(raw: dict[str, Any]) -> int:
    """Create (or reuse) a MediaItem+Movie from TMDB movie detail.

    Wrapped in ``@atomic_seed`` to guarantee transactional boundary.
    """
    tmdb_id = raw.get("id")
    if tmdb_id is None:
        raise ValueError("TMDB movie detail missing 'id'")

    existing_id = find_media_id("tmdb", str(tmdb_id), "movie")
    if existing_id is not None:
        media = MediaItem.objects.filter(pk=existing_id, media_type="movie").first()
        if media is not None:
            _upsert_credits(media, raw)
            _hydrate_relations(media, raw)
            _attach_tmdb_crosswalk(media.pk, raw, "movie")
            _upsert_movie_collection(media, raw)
            finish_catalog_seed(
                media, raw, provider="tmdb", external_id=str(tmdb_id), hash_matched=False
            )
        return existing_id

    title = (raw.get("title") or raw.get("name") or "Unknown Movie").strip() or "Unknown Movie"
    overview = raw.get("overview")
    poster_url = image_url(raw.get("poster_path"), size="original")
    backdrop_url = image_url(raw.get("backdrop_path"), size="original")
    slug = re.sub(r"[^a-z0-9]+", "-", slugify(title)).strip("-")[:200] or slugify("untitled")
    release_date = _parse_date(raw.get("release_date") or raw.get("first_air_date"))

    media = MediaItem.objects.create(
        media_type="movie",
        title=title,
        overview=overview,
        slug=slug,
        release_date=release_date,
        popularity=raw.get("popularity") or 0.0,
        original_language=raw.get("original_language"),
        is_adult=bool(raw.get("adult", False)),
        completeness_score=0.15,
    )
    media_id = attach_external_id(media.pk, "tmdb", str(tmdb_id), "movie")
    if media_id != media.pk:
        winner = MediaItem.objects.get(pk=media_id)
        _upsert_credits(winner, raw)
        _hydrate_relations(winner, raw)
        _upsert_movie_collection(winner, raw)
        recompute_completeness(winner)
        _attach_tmdb_crosswalk(media_id, raw, "movie")
        finish_catalog_seed(
            winner, raw, provider="tmdb", external_id=str(tmdb_id), hash_matched=False
        )
        return media_id

    Movie.objects.create(
        media_item_id=media_id,
        runtime=raw.get("runtime"),
        budget=raw.get("budget"),
        revenue=raw.get("revenue"),
        tagline=raw.get("tagline"),
        is_anime=_is_anime(raw),
    )
    _upsert_asset(media, poster_url, "poster", 100)
    _upsert_asset(media, backdrop_url, "backdrop", 100)
    _upsert_credits(media, raw)
    _upsert_genres(media, _genre_names(raw))
    _attach_tmdb_crosswalk(media_id, raw, "movie")
    _hydrate_relations(media, raw)
    _upsert_movie_collection(media, raw)
    finish_catalog_seed(media, raw, provider="tmdb", external_id=str(tmdb_id), hash_matched=False)
    return media_id


@atomic_seed
def seed_show_from_tmdb(raw: dict[str, Any]) -> int:
    """Create (or refresh) a MediaItem+Show+Season-summary set from TV detail.

    Wrapped in ``@atomic_seed`` to guarantee transactional boundary.
    """
    tmdb_id = raw.get("id")
    if tmdb_id is None:
        raise ValueError("TMDB show detail missing 'id'")

    title = (raw.get("name") or raw.get("title") or "Unknown Show").strip() or "Unknown Show"
    overview = raw.get("overview")
    poster_url = image_url(raw.get("poster_path"), size="original")
    backdrop_url = image_url(raw.get("backdrop_path"), size="original")
    slug = re.sub(r"[^a-z0-9]+", "-", slugify(title)).strip("-")[:200] or slugify("untitled")
    first_air_date = _parse_date(raw.get("first_air_date") or raw.get("release_date"))
    last_air_date = _parse_date(raw.get("last_air_date"))
    status = raw.get("status")

    media_id = find_media_id("tmdb", str(tmdb_id), "show")
    media = MediaItem.objects.filter(pk=media_id, media_type="show").first() if media_id else None
    if media is None:
        media = MediaItem.objects.create(
            media_type="show",
            title=title,
            overview=overview,
            slug=slug,
            release_date=first_air_date,
            popularity=raw.get("popularity") or 0.0,
            original_language=raw.get("original_language"),
            is_adult=bool(raw.get("adult", False)),
            completeness_score=0.15,
        )
        media_id = attach_external_id(media.pk, "tmdb", str(tmdb_id), "show")
        if media_id != media.pk:
            media = MediaItem.objects.get(pk=media_id)
    elif media.overview is None and overview:
        media.overview = overview
        media.save(update_fields=("overview", "updated_at"))
    media_id = media.pk

    show = Show.objects.get_or_create(media_item_id=media_id)[0]
    show.status = status
    show.first_air_date = first_air_date
    show.last_air_date = last_air_date
    show.is_anime = _is_anime(raw)
    show.number_of_seasons = raw.get("number_of_seasons")
    show.number_of_episodes = raw.get("number_of_episodes")
    show.save(
        update_fields=(
            "status",
            "first_air_date",
            "last_air_date",
            "is_anime",
            "number_of_seasons",
            "number_of_episodes",
        )
    )
    _upsert_asset(media, poster_url, "poster", 100)
    _upsert_asset(media, backdrop_url, "backdrop", 100)
    _upsert_credits(media, raw)
    _upsert_seasons(media_id, raw)
    _upsert_genres(media, _genre_names(raw), media_type="show")
    attach_external_id(media_id, "tmdb", str(tmdb_id), "show")
    _attach_tmdb_crosswalk(media_id, raw, "show")
    _hydrate_relations(media, raw)
    finish_catalog_seed(media, raw, provider="tmdb", external_id=str(tmdb_id), hash_matched=False)
    return media_id


@atomic_seed
def seed_episodes_from_season(show_id: int, season_number: int, season_raw: dict[str, Any]) -> int:
    """Seed a season's Episode rows from a /tv/{id}/season/{n} payload."""
    season = Season.objects.filter(show_id=show_id, season_number=season_number).first()
    if season is None:
        return 0
    created = 0
    for ep_data in season_raw.get("episodes", []) or []:
        number = ep_data.get("episode_number")
        if number is None:
            continue
        _, was_created = Episode.objects.update_or_create(
            season=season,
            episode_number=int(number),
            defaults={
                "name": ep_data.get("name"),
                "overview": ep_data.get("overview"),
                "runtime": ep_data.get("runtime"),
                "air_date": _parse_date(ep_data.get("air_date")),
                "still_url": image_url(ep_data.get("still_path"), size="w300"),
            },
        )
        created += int(was_created)
    return created


def seed_season_from_tmdb(*args: Any, **kwargs: Any) -> int:
    """Flexible season seed accepting either positional or keyword args.

    Supports:
        seed_season_from_tmdb(show_id, season_number, season_raw)
        seed_season_from_tmdb(season_raw, show_id=..., season_number=...)
    """
    if len(args) == 3 and isinstance(args[0], int):
        return seed_episodes_from_season(args[0], args[1], args[2])
    if len(args) >= 1 and isinstance(args[0], dict):
        raw = args[0]
        show_id = kwargs.get("show_id") or raw.get("show_id")
        season_number = kwargs.get("season_number") or raw.get("season_number", 0)
        if show_id is not None:
            return seed_episodes_from_season(int(show_id), int(season_number), raw)
    if "show_id" in kwargs and "season_raw" in kwargs:
        return seed_episodes_from_season(
            int(kwargs["show_id"]),
            int(kwargs.get("season_number", 0)),
            kwargs["season_raw"],
        )
    return 0


@atomic_seed
def seed_company_from_tmdb(raw: dict[str, Any]) -> int:
    """Create or update a Company entity from a TMDB /company/{id} payload."""
    tmdb_id = raw.get("id")
    if tmdb_id is None:
        raise ValueError("TMDB company detail missing 'id'")

    company_ct = _company_content_type()
    name = str(raw.get("name") or "").strip() or f"tmdb-company-{tmdb_id}"
    slug = slugify(name) or f"tmdb-company-{tmdb_id}"

    company, _ = Company.objects.get_or_create(slug=slug, defaults={"name": name})

    updates: dict[str, Any] = {
        "name": name,
        "logo_url": image_url(raw.get("logo_path"), size="w185") or company.logo_url,
        "origin_country": raw.get("origin_country") or company.origin_country,
        "description": (raw.get("description") or "").strip() or company.description,
        "homepage": (raw.get("homepage") or "").strip() or company.homepage,
    }
    changed = [field for field, value in updates.items() if getattr(company, field) != value]
    for field in changed:
        setattr(company, field, updates[field])
    if changed:
        company.save(update_fields=changed)

    _upsert_external(company_ct, company.pk, "tmdb", str(tmdb_id), media_type=None)
    return company.pk

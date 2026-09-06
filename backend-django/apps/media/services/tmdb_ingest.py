"""TMDB media ingest — seed catalog rows from TMDB detail JSON.

The first real consumer of the ported async provider clients
(``core.providers.tmdb.TMDBProvider``). Mirrors the increment-26
``GameMatcher._seed_game_from_igdb`` idiom rather than the legacy SQLAlchemy
transformer/hydrator split: a TMDB detail dict maps straight onto the Django
MTI graph (``MediaItem`` hub + ``Movie``/``Show`` subtype) plus ``ExternalID``
rows, genre links and poster/backdrop ``MediaAsset`` rows. Movie seeding was
increment 38; TV (``seed_show_from_tmdb``) landed increment 40 and additionally
seeds ``Season`` summary rows straight from the embedded ``/tv/{id}`` seasons
array (``Season`` PK-foreign-keyed off the ``Show`` subtype, which shares the
hub's pk).

Seeding is intentionally *minimal* (a base title, not full hydration):
``completeness_score`` starts at 0.15 and ``next_sync_at`` is stamped so a later
full-hydration pass completes the row — exactly the posture increment 26 uses
for IGDB games. ``fetch_and_seed_show`` (increment 41) now also hydrates
per-season episodes by looping the detail's season summaries and fetching each
``/tv/{id}/season/{n}``. Credits (cast/crew → ``Person`` + ``MediaCredit`` rows)
are seeded by both movie and show paths (increment 42) from the appended
``credits`` payload as a delete-and-rebuild snapshot, so re-seeds track TMDB's
current billing. A re-seed of an existing show refreshes its growth-prone fields
(status, air dates, season/episode counts) and upserts any newly aired season
summaries rather than only topping up the overview.
"""

from __future__ import annotations

import re
from datetime import date
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone as dj_timezone
from django.utils.text import slugify

from apps.media.models import Episode, ExternalID, MediaAsset, MediaItem, Movie, Season, Show
from apps.media.models.genre import Genre, MediaGenre, MediaGenreType
from apps.media.services.completeness import recompute_completeness
from apps.people.models import MediaCredit, Person

if TYPE_CHECKING:
    from core.providers.tmdb import TMDBProvider

IMAGE_BASE = "https://image.tmdb.org/t/p"

# Genre names are always present and canonical on TMDB movie *detail* (the list
# of names a detail response embeds), so seeding reads them directly instead of
# going through the legacy id→name normalization map.
GENRE_MEDIA_TYPE = "movie"


def _parse_date(raw: str | None) -> date | None:
    """Parse a TMDB 'YYYY-MM-DD' string to a date object."""
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except (ValueError, TypeError):
        return None


def _image_url(path: str | None, size: str = "w500") -> str | None:
    """Absolute TMDB image URL for a stored image path."""
    if not path:
        return None
    return f"{IMAGE_BASE}/{size}{path}"


def _is_anime(raw: dict[str, Any]) -> bool:
    """Anime heuristic from TMDB movie detail (language + keywords + genres)."""
    keywords = [k.get("name", "").lower() for k in (raw.get("keywords") or {}).get("keywords", [])]
    language = (raw.get("original_language") or "").lower()
    if "anime" in language or "anime" in keywords:
        return True
    genres = {str(g.get("name", "")).lower() for g in raw.get("genres", []) if g.get("name")}
    return language == "ja" and "animation" in genres


def _genre_names(raw: dict[str, Any]) -> list[str]:
    """Names from the detail response's ``genres`` list, in order."""
    return [str(g["name"]) for g in raw.get("genres", []) if g.get("name")]


def _upsert_genres(
    media: MediaItem, names: list[str], media_type: str = GENRE_MEDIA_TYPE
) -> None:
    """Link canonical ``Genre`` rows to *media* (dedup by name/slug)."""
    for name in names:
        genre, _ = Genre.objects.get_or_create(name=name, defaults={"slug": slugify(name)})
        # Mark the genre as usable for this media type + attach it to the title.
        MediaGenreType.objects.get_or_create(genre=genre, media_type=media_type)
        MediaGenre.objects.get_or_create(media_item=media, genre=genre)


def _upsert_asset(media: MediaItem, url: str, asset_type: str, score: int) -> None:
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
    return _image_url(entry.get("profile_path"))


def _resolve_persons(entries: list[dict[str, Any]]) -> dict[int, Person]:
    """Resolve credit persons by their tmdb ``ExternalID``, creating stubs.

    Mirrors the legacy hydrator's cast/crew person resolution (its wikidata and
    name-without-tmdb cross-provider backfill phases are deferred — nothing else
    seeds ``Person`` rows yet, so a tmdb ``ExternalID`` key alone is
    idempotent). Keyed by int tmdb id so a shared actor across titles — or cast
    *and* crew of the same title — reuses one row. New stubs carry a w500
    profile photo and a content-type-``Person`` tmdb ``ExternalID`` with
    ``media_type`` NULL (the model's convention for non-media entities).
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
    existing = ExternalID.objects.filter(
        content_type=content_type, provider="tmdb", external_id__in=tmdb_ids
    ).values_list("external_id", "object_id")

    persons: dict[int, Person] = {}
    if existing:
        by_pk = {p.pk: p for p in Person.objects.filter(pk__in=[o for _, o in existing])}
        for external_id, object_id in existing:
            person = by_pk.get(object_id)
            if person is None:
                continue
            if person.photo_url is None:
                photo = _credit_photo(wanted.get(int(external_id)) or {})
                if photo:
                    person.photo_url = photo
                    person.save(update_fields=("photo_url",))
            persons[int(external_id)] = person

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
    """Snapshot-replace a title's cast/crew credits from TMDB detail ``credits``.

    Mirrors the legacy ``hydrate_credits``: the media item's existing credits
    are deleted then rebuilt from the appended ``credits`` payload, so a re-seed
    reflects TMDB's current billing (roles removed upstream vanish). Cast rows
    get ``role="cast"`` with the character; crew rows ``role="crew"`` with the
    job in ``character_name`` (the legacy convention the detail serializer
    renders); both keep TMDB ``order`` in ``sort_order``. Person rows are
    resolved/created by ``_resolve_persons``. A missing ``credits`` key or an
    empty cast+crew leaves existing rows untouched.
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
        MediaCredit.objects.bulk_create(rows)


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _upsert_external(
    content_type: ContentType,
    object_id: int,
    provider: str,
    external_id: str,
    media_type: str = "movie",
) -> None:
    """Create-or-update one ``ExternalID`` row keyed by its natural key."""
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


def seed_movie_from_tmdb(raw: dict[str, Any]) -> int:
    """Create (or reuse) a minimal MediaItem+Movie from TMDB movie detail.

    Returns the media_item id. Reuses an existing row when the TMDB id is
    already mapped or a same-slug ``movie`` catalog title exists (cross-provider
    dedup), then tops up missing overview/poster so re-seeds never duplicate.
    """
    content_type = _media_content_type()
    tmdb_id = raw.get("id")
    if tmdb_id is None:
        raise ValueError("TMDB movie detail missing 'id'")

    existing = ExternalID.objects.filter(
        content_type=content_type, provider="tmdb", external_id=str(tmdb_id), media_type="movie"
    ).first()
    if existing is not None and existing.object_id:
        media = MediaItem.objects.filter(pk=existing.object_id, media_type="movie").first()
        if media is not None:
            # A known title is not re-seeded (movie fields are static), but its
            # credit snapshot still refreshes on a re-sync like the show path.
            _upsert_credits(media, raw)
            recompute_completeness(media)
        return existing.object_id

    title = (raw.get("title") or raw.get("name") or "Unknown Movie").strip() or "Unknown Movie"
    overview = raw.get("overview")
    poster_url = _image_url(raw.get("poster_path"))
    backdrop_url = _image_url(raw.get("backdrop_path"), size="w780")
    slug = re.sub(r"[^a-z0-9]+", "-", slugify(title)).strip("-")[:200] or slugify("untitled")
    release_date = _parse_date(raw.get("release_date") or raw.get("first_air_date"))

    media = MediaItem.objects.filter(media_type="movie", slug=slug).first()
    if media is not None:
        media_id = media.pk
        Movie.objects.get_or_create(media_item_id=media_id)
        if media.overview is None and overview:
            media.overview = overview
            media.save(update_fields=("overview", "updated_at"))
        _upsert_asset(media, poster_url, "poster", 100)
        _upsert_asset(media, backdrop_url, "backdrop", 100)
    else:
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
            next_sync_at=dj_timezone.now(),
        )
        media_id = media.pk
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
    _upsert_external(content_type, media_id, "tmdb", str(tmdb_id))
    imdb_id = raw.get("imdb_id") or (raw.get("external_ids") or {}).get("imdb_id")
    if imdb_id:
        _upsert_external(content_type, media_id, "imdb", str(imdb_id))
    recompute_completeness(media)
    return media_id


def _upsert_seasons(show_pk: int, raw: dict[str, Any]) -> None:
    """Upsert Season summary rows from a TV detail's embedded ``seasons`` array.

    ``/tv/{id}`` embeds season summaries (name/overview/poster/episode_count) but
    not the episodes themselves, so the detail mapper stops at seasons; episodes
    are filled per season by ``fetch_and_seed_show`` via ``/tv/{id}/season/{n}``.
    ``show_pk`` is the ``Show`` subtype pk, which equals the hub's
    ``media_items.id``.
    """
    for season_data in raw.get("seasons", []) or []:
        number = season_data.get("season_number")
        if not number or int(number) <= 0:
            continue
        Season.objects.get_or_create(
            show_id=show_pk,
            season_number=int(number),
            defaults={
                "name": season_data.get("name"),
                "overview": season_data.get("overview"),
                "poster_url": _image_url(season_data.get("poster_path")),
            },
        )


def seed_show_from_tmdb(raw: dict[str, Any]) -> int:
    """Create (or refresh) a MediaItem+Show+Season-summary set from TV detail.

    Returns the media_item id. The row is resolved by TMDB mapping first (an
    existing tmdb ``show`` ExternalID — which survives a title change), else a
    same-slug ``show`` catalog title (so cross-provider stubs like Plex shows
    get filled in). Unlike movie seeding there is no early-out on a known id:
    a re-sync of a continuing series must refresh the Show's growth-prone fields
    (status, air dates, anime flag, season/episode counts) and upsert newly aired
    season summaries, while every row is idempotent (get_or_create) so repeats
    never duplicate.
    """
    content_type = _media_content_type()
    tmdb_id = raw.get("id")
    if tmdb_id is None:
        raise ValueError("TMDB show detail missing 'id'")

    title = (raw.get("name") or raw.get("title") or "Unknown Show").strip() or "Unknown Show"
    overview = raw.get("overview")
    poster_url = _image_url(raw.get("poster_path"))
    backdrop_url = _image_url(raw.get("backdrop_path"), size="w780")
    slug = re.sub(r"[^a-z0-9]+", "-", slugify(title)).strip("-")[:200] or slugify("untitled")
    first_air_date = _parse_date(raw.get("first_air_date") or raw.get("release_date"))
    last_air_date = _parse_date(raw.get("last_air_date"))
    status = raw.get("status")

    mapped = ExternalID.objects.filter(
        content_type=content_type,
        provider="tmdb",
        external_id=str(tmdb_id),
        media_type="show",
    ).first()
    media = None
    if mapped is not None and mapped.object_id:
        media = MediaItem.objects.filter(pk=mapped.object_id, media_type="show").first()
    if media is None:
        media = MediaItem.objects.filter(media_type="show", slug=slug).first()

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
            next_sync_at=dj_timezone.now(),
        )
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
    _upsert_external(content_type, media_id, "tmdb", str(tmdb_id), media_type="show")
    imdb_id = raw.get("imdb_id") or (raw.get("external_ids") or {}).get("imdb_id")
    if imdb_id:
        _upsert_external(content_type, media_id, "imdb", str(imdb_id), media_type="show")
    recompute_completeness(media)
    return media_id


def seed_episodes_from_season(
    show_id: int, season_number: int, season_raw: dict[str, Any]
) -> int:
    """Seed a season's Episode rows from a ``/tv/{id}/season/{n}`` payload.

    Idempotent (``get_or_create`` keyed on season + episode_number); returns how
    many episodes were newly created. ``show_id`` is the ``Show`` subtype pk (==
    hub pk) and the matching ``Season`` row must already exist —
    ``seed_show_from_tmdb`` created it from the detail's seasons summary, so a
    season missing from that array is skipped.
    """
    season = Season.objects.filter(show_id=show_id, season_number=season_number).first()
    if season is None:
        return 0
    created = 0
    for ep_data in season_raw.get("episodes", []) or []:
        number = ep_data.get("episode_number")
        if number is None:
            continue
        _, was_created = Episode.objects.get_or_create(
            season=season,
            episode_number=int(number),
            defaults={
                "name": ep_data.get("name"),
                "overview": ep_data.get("overview"),
                "runtime": ep_data.get("runtime"),
                "air_date": _parse_date(ep_data.get("air_date")),
                "still_url": _image_url(ep_data.get("still_path"), size="w300"),
            },
        )
        created += int(was_created)
    return created


async def fetch_and_seed_movie(tmdb_id: int, *, provider: TMDBProvider | None = None) -> int:
    """Fetch TMDB movie detail through a provider client, then seed it."""
    if provider is None:
        from core.providers.tmdb import TMDBProvider

        provider = TMDBProvider()
    raw = await provider.get_movie(tmdb_id)
    # The ORM write must leave the async context (Django's sync-ORM-in-async
    # guard); sync_to_async runs it in a worker thread.
    return await sync_to_async(seed_movie_from_tmdb)(raw)


async def fetch_and_seed_show(tmdb_id: int, *, provider: TMDBProvider | None = None) -> int:
    """Fetch TMDB TV detail through a provider client, then seed it.

    Also hydrates per-season episodes: after the base Show (and its Season
    summaries) is seeded from the detail, each season summary with
    ``season_number > 0`` is fetched via ``/tv/{id}/season/{n}`` and mapped onto
    ``Episode`` rows under its ``Season``. The HTTP fetches stay in the async
    context; only the ORM writes cross to a worker thread via ``sync_to_async``.
    """
    if provider is None:
        from core.providers.tmdb import TMDBProvider

        provider = TMDBProvider()
    raw = await provider.get_show(tmdb_id)
    media_id = await sync_to_async(seed_show_from_tmdb)(raw)
    for season_data in raw.get("seasons", []) or []:
        number = season_data.get("season_number")
        if not number or int(number) <= 0:
            continue
        season_raw = await provider.get_season(tmdb_id, int(number))
        await sync_to_async(seed_episodes_from_season)(media_id, int(number), season_raw)
    return media_id

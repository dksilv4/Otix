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

Seeding started *minimal* (a base title, ``completeness_score`` 0.15, with
``next_sync_at`` stamped for a later pass), but enrichment has since folded into
the seed itself. ``fetch_and_seed_show`` (increment 41) hydrates per-season
episodes by looping the detail's season summaries and fetching each
``/tv/{id}/season/{n}``. Credits (cast/crew → ``Person`` + ``MediaCredit`` rows)
are seeded by both movie and show paths (increment 42) from the appended
``credits`` payload as a delete-and-rebuild snapshot, so re-seeds track TMDB's
current billing. A re-seed of an existing show refreshes its growth-prone fields
(status, air dates, season/episode counts) and upserts any newly aired season
summaries rather than only topping up the overview.

Since increment 54 (relation hydration) both seed paths also fold the detail's
remaining relation payload onto the row before recomputing completeness:
production companies/networks (``Company`` + ``InvolvedCompany`` + a tmdb
``ExternalID``), release dates / content ratings (``MediaRelease``), videos
(``MediaVideo``), keywords (``Keyword`` + ``MediaKeyword``), supplementary
artwork from the appended ``images`` list (logo / textless-poster / backdrop
``MediaAsset`` rows) and the audience rating (``ExternalRating``). Each helper is
add-only and idempotent, so a mapped re-sync grows a previously-minimal row —
the known-title movie early-out refreshes enrichment too — without duplicating.
"""

from __future__ import annotations

import re
from datetime import date
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone as dj_timezone
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
from apps.media.services.completeness import recompute_completeness
from apps.media.services.fanart_ingest import fanart_enrich_images
from apps.media.services.omdb_ingest import omdb_enrich_ratings
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


_COMPANY_CT: ContentType | None = None


def _company_content_type() -> ContentType:
    global _COMPANY_CT
    if _COMPANY_CT is None:
        _COMPANY_CT = ContentType.objects.get_for_model(Company)
    return _COMPANY_CT


def _clean_cert(value: Any) -> str | None:
    """TMDB certifications are '' when none applies -> store as None."""
    cert = str(value or "").strip()
    return cert or None


def _image_entry_asset(media: MediaItem, entry: Any, asset_type: str, score: int) -> None:
    """Store one ``images`` list entry (``file_path`` + size) as an asset."""
    if not isinstance(entry, dict):
        return
    size = "w780" if asset_type == "backdrop" else "w500"
    url = _image_url(entry.get("file_path"), size=size)
    if not url:
        return
    _upsert_asset(media, url, asset_type, score)


def _upsert_involved_companies(media: MediaItem, raw: dict[str, Any]) -> None:
    """Link the detail's companies as production companies.

    Movies carry ``production_companies`` top-level; shows also add ``networks``
    (the airing networks). Mirrors ``igdb_ingest._upsert_game_companies``: each
    company becomes a ``Company`` (slug from name, tmdb id as its ExternalID)
    plus a ``production``-flagged ``InvolvedCompany`` on the item.
    """
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
                "logo_url": _image_url(entry.get("logo_path"), size="w185"),
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


def _upsert_releases(media: MediaItem, raw: dict[str, Any]) -> None:
    """Map release dates/certifications onto ``MediaRelease`` rows.

    Movies read ``release_dates.results`` — one row per country using the
    theatrical (type 3) entry so premiere date and certification land together.
    Shows read ``content_ratings.results`` — a certification-only row per
    country. Add-only against (item, country, date, cert) since the table has no
    natural unique constraint, so re-syncs never duplicate.
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
                certification=_clean_cert(country.get("rating")),
            )
        return
    for group in (raw.get("release_dates") or {}).get("results") or []:
        if not isinstance(group, dict):
            continue
        code = str(group.get("iso_3166_1") or "").upper()
        if not code:
            continue
        best = _preferred_release_entry(group.get("release_dates") or [])
        if best is None:
            continue
        MediaRelease.objects.get_or_create(
            media_item=media,
            country_code=code,
            release_date=_parse_date(str(best.get("release_date") or "")[:10]),
            certification=_clean_cert(best.get("certification")),
        )


def _preferred_release_entry(entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The theatrical (type 3) entry of a country's release list, else the first
    dated one, else any entry — ``None`` when the list is empty."""
    if not entries:
        return None
    for entry in entries:
        if isinstance(entry, dict) and entry.get("release_type") == 3:
            return entry
    for entry in entries:
        if isinstance(entry, dict) and entry.get("release_date"):
            return entry
    return entries[0] if isinstance(entries[0], dict) else None


def _upsert_videos(media: MediaItem, raw: dict[str, Any]) -> None:
    """Store the first 10 embeddable videos (trailers/teasers) as MediaVideos."""
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
    """Link the detail's ``keywords`` as Keyword + MediaKeyword rows (add-only).

    Movie and TV payloads nest the list under different keys (``keywords`` vs
    ``results``), so both are accepted.
    """
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
    """Store supplementary artwork families from the appended ``images`` payload.

    Backdrops/logos land as backdrop/logo assets; posters with a null
    ``iso_639_1`` are language-neutral originals, stored as textless posters.
    Unique on (item, url, type), so the existing primary poster/backdrop rows are
    never duplicated.
    """
    images = raw.get("images")
    if not isinstance(images, dict):
        return
    # Decreasing scores keep the primary poster/backdrop (score 100) on top.
    for i, entry in enumerate((images.get("backdrops") or [])[:8]):
        _image_entry_asset(media, entry, "backdrop", 60 - i * 5)
    for i, entry in enumerate((images.get("logos") or [])[:8]):
        _image_entry_asset(media, entry, "logo", 60 - i * 5)
    textless = [e for e in (images.get("posters") or []) if e.get("iso_639_1") is None]
    for i, entry in enumerate(textless[:8]):
        _image_entry_asset(media, entry, "textless_poster", 60 - i * 5)


def _upsert_tmdb_rating(media: MediaItem, raw: dict[str, Any]) -> None:
    """Record the title's ``vote_average``/``vote_count`` as a tmdb ExternalRating."""
    score = raw.get("vote_average")
    if score is None:
        return
    score = float(score)
    if score <= 0 and not (raw.get("vote_count") or 0):
        return  # placeholder 0.0/0 row, not a real audience rating
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
    """Fold the detail's relation enrichment onto *media*.

    Add-only + idempotent: production companies/networks, releases, videos,
    keywords, supplementary artwork and the tmdb rating each skip already-present
    rows, so a mapped re-sync grows a previously-minimal row without duplicating.
    Both movie and show paths share the raw shapes; keyword/release container
    differences are resolved per helper.
    """
    _upsert_involved_companies(media, raw)
    _upsert_releases(media, raw)
    _upsert_videos(media, raw)
    _upsert_keywords(media, raw)
    _upsert_tmdb_images(media, raw)
    _upsert_tmdb_rating(media, raw)


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
            # credit snapshot + relation enrichment still refresh on a re-sync
            # like the show path (how pre-1.1 minimal rows grow their data).
            _upsert_credits(media, raw)
            _hydrate_relations(media, raw)
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
    _hydrate_relations(media, raw)
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
    tvdb_id = (raw.get("external_ids") or {}).get("tvdb_id")
    if tvdb_id:
        _upsert_external(content_type, media_id, "tvdb", str(tvdb_id), media_type="show")
    _hydrate_relations(media, raw)
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


async def _omdb_enrich_after_seed(media_id: int) -> None:
    """Best-effort OMDb ratings enrich on a freshly-seeded movie/show row.

    Gated on the OMDb key being configured (the common case is unset, so this
    returns before any DB read or client build); the enrich driver itself is a
    benign no-op for a row with no IMDb id or an OMDb miss. Errors are swallowed —
    enrichment never fails the seed that produced the row.
    """
    if not settings.OMDB_API_KEY:
        return
    try:
        await omdb_enrich_ratings(media_id)
    except Exception:
        pass


async def _fanart_enrich_after_seed(media_id: int) -> None:
    """Best-effort Fanart artwork enrich on a freshly-seeded movie/show row.

    Gated on the Fanart key being configured (the common case is unset, so this
    returns before any DB read or client build); the enrich driver itself is a
    benign no-op for a movie/show with no tmdb/tvdb ExternalID or a Fanart miss.
    Errors are swallowed — enrichment never fails the seed that produced the row.
    """
    if not settings.FANART_API_KEY:
        return
    try:
        await fanart_enrich_images(media_id)
    except Exception:
        pass


async def fetch_and_seed_movie(tmdb_id: int, *, provider: TMDBProvider | None = None) -> int:
    """Fetch TMDB movie detail through a provider client, then seed it."""
    if provider is None:
        from core.providers.tmdb import TMDBProvider

        provider = TMDBProvider()
    raw = await provider.get_movie(tmdb_id)
    # The ORM write must leave the async context (Django's sync-ORM-in-async
    # guard); sync_to_async runs it in a worker thread.
    media_id = await sync_to_async(seed_movie_from_tmdb)(raw)
    await _omdb_enrich_after_seed(media_id)
    await _fanart_enrich_after_seed(media_id)
    return media_id


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
    await _omdb_enrich_after_seed(media_id)
    await _fanart_enrich_after_seed(media_id)
    return media_id

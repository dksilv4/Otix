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

import logging
from datetime import date
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.conf import settings
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
    Season,
    Show,
)
from apps.media.models.genre import Genre, Keyword, MediaGenre, MediaGenreType, MediaKeyword
from apps.media.services.catalog_lifecycle import finish_catalog_seed, payload_hash_matches
from apps.media.services.completeness import recompute_completeness
from apps.media.services.fanart_ingest import fanart_enrich_images
from apps.media.services.genre_simplification import simplify_genre_names
from apps.media.services.omdb_ingest import omdb_enrich_ratings
from apps.media.services.wikidata_distributor import wikidata_enrich_distributors
from apps.people.models import MediaCredit, Person

if TYPE_CHECKING:
    from core.providers.tmdb import TMDBProvider

logger = logging.getLogger(__name__)

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
    """Names from the detail response's ``genres`` list, in order, simplified."""
    raw_names = [str(g["name"]) for g in raw.get("genres", []) if g.get("name")]
    return simplify_genre_names(raw_names)


def _upsert_genres(media: MediaItem, names: list[str], media_type: str = GENRE_MEDIA_TYPE) -> None:
    """Link canonical ``Genre`` rows to *media* (dedup by name/slug)."""
    for name in simplify_genre_names(names):
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
    url = _image_url(entry.get("file_path"), size="original")
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

    Movies read ``release_dates.results`` — every dated entry per country is
    stored with its TMDB ``release_type`` (theatrical, digital, physical, …)
    so the calendar can label milestones correctly. Shows read
    ``content_ratings.results`` — a certification-only row per country.
    Add-only against (item, country, date, type, cert) so re-syncs never
    duplicate.
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


def _preferred_release_entry(entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The theatrical (type 3) entry of a country's release list, else the first
    dated one, else any entry — ``None`` when the list is empty.

    Kept for callers that still want a single “primary” country date; calendar
    ingest now stores every typed entry via ``_upsert_releases``.
    """
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
    else:
        changes = {
            key: val
            for key, val in (("score", score), ("vote_count", vote_count))
            if getattr(row, key) != val
        }
        if changes:
            for key, val in changes.items():
                setattr(row, key, val)
            row.save(update_fields=tuple(changes.keys()))

    media_updates: list[str] = []
    if media.avg_rating is None and score > 0:
        media.avg_rating = round(score, 2)
        media_updates.append("avg_rating")
    if not media.rating_count and vote_count > 0:
        media.rating_count = int(vote_count)
        media_updates.append("rating_count")
    if media_updates:
        media.save(update_fields=tuple(media_updates))

    from apps.media.services.rating import compute_and_store_overall_rating

    compute_and_store_overall_rating(media.pk)


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
    """Create (or reuse) a MediaItem+Movie from TMDB movie detail.

    Identity is the TMDB ExternalID only — a same-slug title is a different
    row until it holds this tmdb id.
    """
    from core.providers.tmdb.hydrators import seed_movie_from_tmdb as _seed

    return _seed(raw)


def _attach_tmdb_crosswalk(media_id: int, raw: dict[str, Any], media_type: str) -> None:
    from apps.media.services.identity import attach_external_id

    imdb_id = raw.get("imdb_id") or (raw.get("external_ids") or {}).get("imdb_id")
    if imdb_id:
        attach_external_id(media_id, "imdb", str(imdb_id), media_type)
    tvdb_id = (raw.get("external_ids") or {}).get("tvdb_id")
    if tvdb_id:
        attach_external_id(media_id, "tvdb", str(tvdb_id), media_type)


def _upsert_seasons(show_pk: int, raw: dict[str, Any]) -> None:
    """Upsert Season summary rows from a TV detail's embedded ``seasons`` array.

    ``/tv/{id}`` embeds season summaries (name/overview/poster/air_date/episode
    count) but not the episodes themselves, so the detail mapper stops at
    seasons; episodes are filled per season by ``fetch_and_seed_show`` via
    ``/tv/{id}/season/{n}``. ``show_pk`` is the ``Show`` subtype pk, which equals
    the hub's ``media_items.id``. ``update_or_create`` refreshes name/overview/
    poster and the new ``air_date`` on re-seed so existing rows get backfilled.
    """
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
                "poster_url": _image_url(season_data.get("poster_path"), size="original"),
                "air_date": _parse_date(season_data.get("air_date")),
            },
        )
        if "episodes" in season_data and isinstance(season_data["episodes"], list):
            seed_episodes_from_season(show_pk, int(number), season_data)


def seed_show_from_tmdb(raw: dict[str, Any]) -> int:
    """Create (or refresh) a MediaItem+Show+Season-summary set from TV detail.

    Identity is the TMDB ExternalID only. A re-sync of a continuing series
    refreshes growth-prone fields and upserts newly aired season summaries.
    """
    from core.providers.tmdb.hydrators import seed_show_from_tmdb as _seed

    return _seed(raw)


def seed_episodes_from_season(show_id: int, season_number: int, season_raw: dict[str, Any]) -> int:
    """Seed a season's Episode rows from a /tv/{id}/season/{n} payload."""
    from core.providers.tmdb.hydrators import seed_episodes_from_season as _seed

    return _seed(show_id, season_number, season_raw)


def show_needs_episodes(show_id: int) -> bool:
    """True if a show has regular aired seasons that are missing Episode rows.

    Ignores future unreleased seasons (air_date > today) so announced upcoming
    seasons don't lock the show into an infinite rehydration loop.
    """
    from datetime import date

    from django.db.models import Q

    show = Show.objects.filter(media_item_id=show_id).first()
    if show is None or show.number_of_episodes == 0:
        return False
    if not Episode.objects.filter(season__show_id=show_id).exists():
        return True

    today = date.today()
    return (
        Season.objects.filter(
            show_id=show_id,
            season_number__gt=0,
        )
        .filter(Q(air_date__lte=today) | Q(air_date__isnull=True))
        .filter(episodes__isnull=True)
        .exists()
    )


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


async def _wikidata_distributor_enrich_after_seed(media_id: int) -> None:
    """Best-effort Wikidata distributor enrich on a freshly-seeded movie/show row.

    TMDB carries only production companies, so distributors (e.g. A24) are missing
    from the seed's company list; this attaches them from Wikidata ``P750``. Gated
    on ``WIKIDATA_DISTRIBUTOR_ENRICH`` and a no-op for a row with no IMDb/TMDB id.
    Errors are swallowed — enrichment never fails the seed that produced the row.
    """
    if not settings.WIKIDATA_DISTRIBUTOR_ENRICH:
        return
    try:
        await wikidata_enrich_distributors(media_id)
    except Exception:
        pass


async def fetch_and_seed_movie(
    tmdb_id: int, *, provider: TMDBProvider | None = None, force: bool = False
) -> int:
    """Fetch TMDB movie detail through a provider client, then seed it."""
    if provider is None:
        from core.providers.tmdb import TMDBProvider

        provider = TMDBProvider()
    raw = await provider.get_movie(tmdb_id)
    skipped = await _skip_fresh_tmdb(raw, tmdb_id, "movie", force=force)
    if skipped is not None:
        return skipped
    media_id = await sync_to_async(seed_movie_from_tmdb)(raw)
    coll_info = raw.get("belongs_to_collection")
    if coll_info and isinstance(coll_info, dict) and coll_info.get("id"):
        cid = coll_info["id"]
        try:
            full_col = await provider.get_collection(int(cid))
            if full_col and isinstance(full_col, dict):
                from apps.lists.services.collection import upsert_collection_from_tmdb

                media_obj = await sync_to_async(MediaItem.objects.filter(pk=media_id).first)()
                await sync_to_async(upsert_collection_from_tmdb)(full_col, media_obj)
        except Exception:
            logger.debug("Failed to fetch full TMDB collection %s", cid, exc_info=True)
    await _omdb_enrich_after_seed(media_id)
    await _fanart_enrich_after_seed(media_id)
    await _wikidata_distributor_enrich_after_seed(media_id)
    await _enqueue_related_tmdb(raw, "movie", provider)
    return media_id


async def fetch_and_seed_show(
    tmdb_id: int, *, provider: TMDBProvider | None = None, force: bool = False
) -> int:
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
    skipped = await _skip_fresh_tmdb(raw, tmdb_id, "show", force=force)
    if skipped is not None:
        return skipped
    media_id = await sync_to_async(seed_show_from_tmdb)(raw)
    for season_data in raw.get("seasons", []) or []:
        number = season_data.get("season_number")
        if not number or int(number) <= 0:
            continue
        try:
            season_raw = await provider.get_season(tmdb_id, int(number))
            await sync_to_async(seed_episodes_from_season)(media_id, int(number), season_raw)
        except Exception as exc:
            logger.warning("Failed to fetch season %s for show tmdb:%s: %s", number, tmdb_id, exc)
    await _omdb_enrich_after_seed(media_id)
    await _fanart_enrich_after_seed(media_id)
    await _wikidata_distributor_enrich_after_seed(media_id)
    await _enqueue_related_tmdb(raw, "show", provider)

    def _finalize(pk: int) -> None:
        media = MediaItem.objects.filter(pk=pk).first()
        if media:
            recompute_completeness(media)

    await sync_to_async(_finalize)(media_id)
    return media_id


async def _skip_fresh_tmdb(
    raw: dict[str, Any], tmdb_id: int, media_type: str, *, force: bool
) -> int | None:
    if force:
        return None
    from apps.media.services.identity import find_media_id

    media_id = await sync_to_async(find_media_id)("tmdb", str(tmdb_id), media_type)
    if media_id is None:
        return None

    if media_type == "show" and await sync_to_async(show_needs_episodes)(media_id):
        return None

    matches = await sync_to_async(payload_hash_matches)(
        media_id, "tmdb", str(tmdb_id), media_type, raw
    )
    if not matches:
        return None

    def _stamp() -> int:
        media = MediaItem.objects.get(pk=media_id)
        finish_catalog_seed(
            media, raw, provider="tmdb", external_id=str(tmdb_id), hash_matched=True
        )
        return media.pk

    return await sync_to_async(_stamp)()


async def _enqueue_related_tmdb(
    raw: dict[str, Any], media_type: str, provider: TMDBProvider
) -> None:
    from apps.integrations.services.catalog_seed import ensure_catalog_job

    ids: list[str] = []
    collection = raw.get("belongs_to_collection") or {}
    cid = collection.get("id") if isinstance(collection, dict) else None
    if cid and media_type == "movie":
        try:
            col = await provider.get_collection(int(cid))
        except Exception:  # noqa: BLE001
            col = {}
        for part in col.get("parts") or []:
            if isinstance(part, dict) and part.get("id"):
                ids.append(str(part["id"]))
    similar_fn = provider.get_movie_similar if media_type == "movie" else provider.get_show_similar
    try:
        similar = await similar_fn(int(raw["id"]))
    except Exception:  # noqa: BLE001
        similar = {}
    for row in (similar.get("results") or [])[:12]:
        if isinstance(row, dict) and row.get("id"):
            ids.append(str(row["id"]))
    seen: set[str] = set()
    for ext in ids:
        if ext in seen or str(raw.get("id")) == ext:
            continue
        seen.add(ext)
        await sync_to_async(ensure_catalog_job)("tmdb", media_type, ext, priority=2, dispatch=False)

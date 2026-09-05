"""Catalog read logic: list/detail/genres/certifications/similar/recommendations.

Plain callables over the models. Views stay thin; serializers stay declarative.
Asset URLs are resolved here (once, off prefetched ``MediaAsset`` rows) and
attached to model instances under the same names the legacy asset resolver
used, so serializers can read ``obj.poster_url`` etc. without per-field queries.
"""

from __future__ import annotations

from datetime import date

from django.contrib.auth.models import AbstractBaseUser, AnonymousUser
from django.db.models import Avg, Count, Exists, OuterRef, Q
from django.db.models.query import QuerySet

from apps.company.models import Company
from apps.media.models import ExternalID, Genre, MediaAsset, MediaItem, MediaRelease
from apps.media.services.interaction import attach_user_interactions

_User = AbstractBaseUser | AnonymousUser | None


def media_item_or_none(media_id: int) -> MediaItem | None:
    """Resolve a media item by primary key; ``None`` when missing."""
    return MediaItem.objects.filter(pk=media_id).first()


def media_type_or_none(media_id: int) -> str | None:
    value = MediaItem.objects.filter(pk=media_id).values_list("media_type", flat=True).first()
    return value


def _pick_asset(item: MediaItem, asset_type: str) -> str | None:
    best = None
    for asset in item.assets.all():
        if (asset.asset_type or "").lower() != asset_type:
            continue
        if not asset.url:
            continue
        if best is None or (asset.score or 0) > (best.score or 0):
            best = asset
    return best.url if best else None


def _logo_color_guess(item: MediaItem) -> str | None:
    for asset in item.assets.all():
        if (asset.asset_type or "").lower() == "logo" and asset.color_guess:
            return asset.color_guess
    return None


def attach_media_urls(items: list[MediaItem]) -> None:
    """Resolve image URLs from prefetched assets and attach them to instances."""
    for item in items:
        item.poster_url = _pick_asset(item, "poster")
        item.backdrop_url = _pick_asset(item, "backdrop")
        item.logo_url = _pick_asset(item, "logo")
        item.textless_poster_url = _pick_asset(item, "textless_poster")
        item.icon_url = _pick_asset(item, "icon")
        item.logo_color_guess = _logo_color_guess(item)


def external_ids_for(
    items: list[MediaItem], providers=("tmdb", "igdb")
) -> dict[int, dict[str, str]]:
    """Resolve provider external ids for a batch of media items."""
    ids = [item.id for item in items]
    if not ids:
        return {}
    rows = ExternalID.objects.filter(
        object_id__in=ids,
        provider__in=providers,
    ).values_list("object_id", "provider", "external_id")
    out: dict[int, dict[str, str]] = {item_id: {} for item_id in ids}
    for object_id, provider, external_id in rows:
        out[object_id][provider] = external_id
    return out


def enrich_summaries(items: list[MediaItem], user: _User) -> None:
    """Attach image urls, tmdb_id and per-user interaction state to items."""
    attach_media_urls(items)
    ext_map = external_ids_for(items)
    for item in items:
        item.tmdb_id = ext_map.get(item.id, {}).get("tmdb")
        item.user_interactions = None
        _attach_summary_derived(item)
    if user is not None and user.is_authenticated:
        attach_user_interactions(items, user)


def _attach_summary_derived(item: MediaItem) -> None:
    """Fill summary/detail extras that live outside the hub row's columns.

    These mirror fields the legacy ``MediaItemSummary``/``MediaItemDetail``
    carried that greenfield has no dedicated column for (steam/plex/album
    enrichment, per-type finance and season-flag shortcuts). Defaults keep the
    read serializers total without per-item N+1 lookups.
    """
    item.new_season_released = False
    item.new_season_release_date = None
    item.steam_playtime_forever = None
    item.steam_playtime_2weeks = None
    item.steam_rtime_last_played = None
    item.plex_view_count = None
    item.plex_last_viewed_at = None
    item.album_artist_name = None
    item.album_track_count = None
    item.album_musicbrainz_release_group_id = None
    movie = getattr(item, "movie", None)
    item.revenue = movie.revenue if movie is not None else None
    item.budget = movie.budget if movie is not None else None


def list_media(
    *,
    media_type: str | None = None,
    genre: str | None = None,
    company: str | None = None,
    language: str | None = None,
    is_anime: bool | None = None,
    exclude_adult: bool = False,
    sort_by: str | None = None,
    sort_dir: str = "desc",
    person_id: int | None = None,
    has_artwork: bool = False,
    has_logo: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
) -> QuerySet:
    """Paginated catalog browse (legacy ``MediaService.list_media``).

    Financial sorts and credit-role filters that required legacy joins are
    approximated: ``revenue``/``budget`` sort against the movie subtype and
    ``person_id`` filters on credited person. ``has_artwork`` mirrors the
    legacy textless-poster rule (game/music fall back to plain poster);
    ``has_logo``/``date_from``/``date_to`` filter on logo assets and
    ``release_date``. Embedding-dependent features are not represented
    (schema defers vectors).
    """
    qs = MediaItem.objects.all()
    if media_type:
        qs = qs.filter(media_type=media_type)
    if genre:
        qs = qs.filter(media_genres__genre__slug=genre)
    if company:
        qs = qs.filter(involved_companies__company_id=company)
    if language:
        qs = qs.filter(original_language=language)
    if is_anime is not None:
        if media_type in (None, "movie"):
            qs = qs.filter(movie__is_anime=is_anime)
        if media_type in (None, "show"):
            qs = qs.filter(Q(show__is_anime=is_anime) | Q(movie__is_anime=is_anime))
    if exclude_adult:
        qs = qs.filter(is_adult=False)
    if person_id is not None:
        qs = qs.filter(credits__person_id=person_id)
    if has_artwork:
        # Movies/shows need a textless poster (TMDB+Fanart provide it); games
        # (IGDB covers) and music (album art) have text baked in, so their
        # plain poster counts. Mirrors legacy `MediaService.list_media`.
        qs = qs.annotate(
            _has_textless=Exists(
                MediaAsset.objects.filter(
                    media_item_id=OuterRef("pk"), asset_type="textless_poster"
                )
            ),
            _has_poster=Exists(
                MediaAsset.objects.filter(media_item_id=OuterRef("pk"), asset_type="poster")
            ),
        ).filter(
            Q(_has_textless=True)
            | (Q(media_type__in=["game", "music"]) & Q(_has_poster=True))
        )
    if has_logo:
        qs = qs.filter(
            Exists(
                MediaAsset.objects.filter(media_item_id=OuterRef("pk"), asset_type="logo")
            )
        )
    if date_from is not None:
        qs = qs.filter(release_date__gte=date_from)
    if date_to is not None:
        qs = qs.filter(release_date__lte=date_to)

    direction = "-" if sort_dir == "desc" else ""
    sort_map = {
        "popularity": "popularity",
        "rating": "avg_rating",
        "release_date": "release_date",
        "title": "title",
        "views": "view_count",
        "revenue": "movie__revenue",
        "budget": "movie__budget",
        "profit": "movie__revenue",
    }
    sort_field = sort_map.get(sort_by or "")
    if sort_field:
        qs = qs.order_by(f"{direction}{sort_field}", "-popularity", "id")
    else:
        qs = qs.order_by("-popularity", "id")
    return qs.distinct()


def media_detail_queryset(media_id: int) -> MediaItem | None:
    """Load one item with all relations the detail serializer needs."""
    return (
        MediaItem.objects.select_related(
            "movie",
            "show",
            "game",
            "album",
            "movie__collection",
            "game__franchise",
        )
        .prefetch_related(
            "assets",
            "videos",
            "releases",
            "media_genres__genre",
            "credits__person",
            "involved_companies__company",
            "platforms__platform",
            "game_modes__game_mode",
            "watch_providers__watch_provider",
            "show__seasons__episodes",
            "album__tracks",
            "movie__collection__movies__media_item",
        )
        .filter(pk=media_id)
        .first()
    )


def genre_list(media_type: str | None = None) -> QuerySet:
    """All genres, optionally restricted to genres used by ``media_type``."""
    qs = Genre.objects.all()
    if media_type:
        qs = qs.filter(media_genres__media_item__media_type=media_type).distinct()
    return qs.order_by("name")


def certification_list(country_code: str = "us", media_type: str | None = None) -> list[str]:
    """Distinct certification strings for a country's releases."""
    qs = MediaRelease.objects.filter(
        country_code=country_code.lower(),
        certification__isnull=False,
    ).exclude(certification="")
    if media_type:
        qs = qs.filter(media_item__media_type=media_type)
    return list(qs.values_list("certification", flat=True).distinct().order_by("certification"))


def company_by_id_or_slug(*, id: int | None = None, slug: str | None = None) -> Company | None:
    """Resolve a company for ``GET /media/company`` (id or slug, like legacy)."""
    qs = Company.objects.all()
    if id is not None:
        qs = qs.filter(pk=id)
    elif slug:
        qs = qs.filter(slug=slug)
    else:
        return None
    company = qs.first()
    if company is None:
        return None
    company.follower_count = company.followers.count()
    average = company.ratings.aggregate(avg=Avg("score"))["avg"]
    company.avg_rating = round(float(average), 1) if average is not None else None
    company.is_followed = None
    company.user_rating = None
    return company


def similar_items(media_id: int, media_type: str | None, limit: int) -> list[MediaItem]:
    """Content-based similar items.

    Legacy used embedding cosine distance; our schema defers vectors, so this
    ranks same-type catalog titles by shared-genre count then popularity (the
    same genre-overlap signal the legacy fallback path used).
    """
    try:
        source = MediaItem.objects.get(pk=media_id)
    except MediaItem.DoesNotExist:
        return []
    genre_ids = list(
        source.media_genres.values_list("genre_id", flat=True)
    )
    qs = MediaItem.objects.exclude(pk=media_id).filter(is_adult=False)
    if media_type:
        qs = qs.filter(media_type=media_type)
    elif source.media_type in ("movie", "show", "game", "music"):
        qs = qs.filter(media_type=source.media_type)
    if genre_ids:
        qs = qs.filter(media_genres__genre_id__in=genre_ids).annotate(
            shared=Count("media_genres__genre", filter=Q(media_genres__genre_id__in=genre_ids))
        )
        qs = qs.order_by("-shared", "-popularity")
    else:
        qs = qs.order_by("-popularity")
    return list(qs.distinct()[:limit])

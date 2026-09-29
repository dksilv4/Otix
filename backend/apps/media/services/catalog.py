"""Catalog read logic: list/detail/genres/certifications/similar/recommendations.

Plain callables over the models. Views stay thin; serializers stay declarative.
Asset URLs are resolved here (once, off prefetched ``MediaAsset`` rows) and
attached to model instances under the same names the legacy asset resolver
used, so serializers can read ``obj.poster_url`` etc. without per-field queries.
"""

from __future__ import annotations

from datetime import date

from django.contrib.auth.models import AbstractBaseUser, AnonymousUser
from django.contrib.contenttypes.models import ContentType
from django.db.models import Avg, Count, Exists, OuterRef, Q, prefetch_related_objects
from django.db.models.query import QuerySet

from apps.company.models import Company
from apps.media.models import ExternalID, Genre, MediaAsset, MediaItem, MediaRelease
from apps.media.services.interaction import attach_user_interactions

_User = AbstractBaseUser | AnonymousUser | None

# Card/hero images. A local copy of any of these means discover can paint
# from /api/v1/assets without waiting on a provider CDN.
LOCAL_CARD_ASSET_TYPES = ("poster", "textless_poster", "backdrop")


def local_artwork_exists(media_item_outerref=None):
    """Exists() of a mirrored poster/backdrop on the referenced media item."""
    media_item_id = media_item_outerref if media_item_outerref is not None else OuterRef("pk")
    return Exists(
        MediaAsset.objects.filter(
            media_item_id=media_item_id,
            asset_type__in=LOCAL_CARD_ASSET_TYPES,
            local_name__isnull=False,
        ).exclude(local_name="")
    )


def media_item_or_none(media_id: int) -> MediaItem | None:
    """Resolve a media item by primary key; ``None`` when missing."""
    return MediaItem.objects.filter(pk=media_id).first()


def media_type_or_none(media_id: int) -> str | None:
    value = MediaItem.objects.filter(pk=media_id).values_list("media_type", flat=True).first()
    return value


def _best_asset(item: MediaItem, asset_type: str, context: str = "general") -> MediaAsset | None:
    """Best ``asset_type`` for ``context`` with a usable remote URL.

    ``context`` decides which admin pin wins: the row pinned for that exact
    context, else a ``general`` pin (the shared default, and the fallback when a
    ``dark``/``light`` pin is absent), else the highest score. Ties are broken
    deterministically so repeated resolution picks the same row: an
    already-mirrored copy wins over an unmirrored one (keeps downloads stable
    across runs), otherwise the lower ``pk`` wins.
    """
    best = None
    for asset in item.assets.all():
        if (asset.asset_type or "").lower() != asset_type:
            continue
        if not asset.url:
            continue
        if best is None or _asset_outranks(asset, best, context):
            best = asset
    return best


SELECTION_CONTEXTS = ("general", "dark", "light")

# Theme contrast rank per asset_type and context.
# Higher score = better contrast/fit for the viewer theme.
_LOGO_THEME_RANK = {
    "dark": {
        "guess_white": 3,
        "guess_colorful": 2,
        "guess_multicolor": 2,
        None: 1,
        "guess_gray": 1,
        "guess_black": 0,
    },
    "light": {
        "guess_black": 3,
        "guess_colorful": 2,
        "guess_multicolor": 2,
        None: 1,
        "guess_gray": 1,
        "guess_white": 0,
    },
}

_BACKDROP_THEME_RANK = {
    "dark": {
        "guess_black": 2,
        "guess_colorful": 1,
        "guess_gray": 1,
        None: 1,
        "guess_white": 0,
    },
    "light": {
        "guess_white": 2,
        "guess_colorful": 1,
        "guess_gray": 1,
        None: 1,
        "guess_black": 0,
    },
}


def _theme_contrast_rank(asset: MediaAsset, context: str) -> int:
    """Evaluate how well an asset's colors contrast with the UI theme."""
    if context not in ("dark", "light"):
        return 0
    asset_type = (asset.asset_type or "").lower()
    guess = asset.color_guess
    if asset_type in ("logo", "icon"):
        return _LOGO_THEME_RANK[context].get(guess, 1)
    if asset_type in ("backdrop", "textless_backdrop"):
        return _BACKDROP_THEME_RANK[context].get(guess, 1)
    return 0


def request_context(request) -> str:
    """Resolve theme context ('dark' | 'light' | 'general') from request."""
    if request is None:
        return "general"
    params = getattr(request, "query_params", None)
    if params is None:
        params = getattr(request, "GET", None)
    theme = params.get("theme") if params else None
    if not theme and hasattr(request, "headers"):
        theme = request.headers.get("X-Otix-Theme")
    if not theme and hasattr(request, "META"):
        theme = request.META.get("HTTP_X_OTIX_THEME")
    if theme:
        normalized = str(theme).lower().strip()
        if normalized in ("dark", "light"):
            return normalized
    return "general"


def _selection_rank(asset: MediaAsset, context: str) -> int:
    """How strongly ``asset`` is pinned for ``context``: theme pin > general > none."""
    if asset.selected_context == context:
        return 3
    if context in ("dark", "light") and asset.selected_context == "general":
        return 2
    return 0


def _asset_outranks(candidate: MediaAsset, current: MediaAsset, context: str) -> bool:
    # 1. A row pinned for this context always wins; a general pin is the shared
    # fallback for the theme contexts.
    candidate_rank = _selection_rank(candidate, context)
    current_rank = _selection_rank(current, context)
    if candidate_rank != current_rank:
        return candidate_rank > current_rank

    # 2. Theme compatibility/contrast rank when context is dark or light
    if context in ("dark", "light"):
        cand_theme = _theme_contrast_rank(candidate, context)
        curr_theme = _theme_contrast_rank(current, context)
        if cand_theme != curr_theme:
            return cand_theme > curr_theme

    # 3. Community score
    if (candidate.score or 0) != (current.score or 0):
        return (candidate.score or 0) > (current.score or 0)

    # 4. Mirror state
    if bool(candidate.local_name) != bool(current.local_name):
        return bool(candidate.local_name)

    # 5. Deterministic tie-breaker
    return candidate.pk < current.pk


def _local_asset_url(asset: MediaAsset | None) -> str | None:
    """Serve URL for a locally mirrored asset, or None when not downloaded."""
    if asset is not None and asset.local_name:
        return f"/api/v1/assets/{asset.local_name}"
    return None


def _pick_asset(item: MediaItem, asset_type: str, context: str = "general") -> str | None:
    best = _best_asset(item, asset_type, context)
    if best is None:
        return None
    return _local_asset_url(best) or best.url


def _pick_backdrop(item: MediaItem, context: str = "general") -> str | None:
    """Resolve the hero backdrop, preferring the designated textless image.

    The family textless art (a pinned ``textless_backdrop`` row) always wins the
    served background in every theme — it overrides any texted ``backdrop`` pin,
    so viewers see the clean, title-free art. Falls back to the normal backdrop
    pick for the requested ``context`` when no textless backdrop is designated.
    """
    tless = _best_asset(item, "textless_backdrop", "general")
    if tless is not None:
        return _local_asset_url(tless) or tless.url
    return _pick_asset(item, "backdrop", context)


def _logo_color_guess(item: MediaItem, context: str = "general") -> str | None:
    best = _best_asset(item, "logo", context)
    return best.color_guess if best is not None else None


def attach_media_urls(items: list[MediaItem], context: str = "general") -> None:
    """Resolve image URLs from prefetched assets and attach them to instances."""
    for item in items:
        item.poster_url = _pick_asset(item, "poster", context)
        item.backdrop_url = _pick_backdrop(item, context)
        item.logo_url = _pick_asset(item, "logo", context)
        item.textless_poster_url = _pick_asset(item, "textless_poster", context)
        item.icon_url = _pick_asset(item, "icon", context)
        item.logo_color_guess = _logo_color_guess(item, context)


def external_ids_for(
    items: list[MediaItem], providers=("tmdb", "igdb", "tvdb", "imdb", "steam")
) -> dict[int, dict[str, str]]:
    """Resolve provider external ids for a batch of media items."""
    ids = [item.id for item in items]
    if not ids:
        return {}
    content_type = ContentType.objects.get_for_model(MediaItem)
    rows = ExternalID.objects.filter(
        content_type=content_type,
        object_id__in=ids,
        provider__in=providers,
    ).values_list("object_id", "provider", "external_id")
    out: dict[int, dict[str, str]] = {item_id: {} for item_id in ids}
    for object_id, provider, external_id in rows:
        out[object_id][provider] = external_id
    return out


def enrich_summaries(items: list[MediaItem], user: _User, context: str = "general") -> None:
    """Attach image urls, external ids and per-user interaction state to items."""
    if items:
        prefetch_related_objects(items, "assets")
        coll_media_items: list[MediaItem] = []
        for item in items:
            movie = getattr(item, "movie", None)
            collection = getattr(movie, "collection", None) if movie else None
            if collection:
                for cm in collection.movies.all():
                    if getattr(cm, "media_item", None):
                        coll_media_items.append(cm.media_item)
        if coll_media_items:
            prefetch_related_objects(coll_media_items, "assets")
            attach_media_urls(coll_media_items, context)
    attach_media_urls(items, context)
    ext_map = external_ids_for(items)
    for item in items:
        item.tmdb_id = ext_map.get(item.id, {}).get("tmdb")
        item.tvdb_id = ext_map.get(item.id, {}).get("tvdb")
        item.imdb_id = ext_map.get(item.id, {}).get("imdb")
        item.igdb_id = ext_map.get(item.id, {}).get("igdb")
        steam_raw = ext_map.get(item.id, {}).get("steam")
        item.steam_app_id = int(steam_raw) if steam_raw and steam_raw.isdigit() else None
        item.user_interactions = None
        _attach_summary_derived(item)
    if user is not None and user.is_authenticated:
        attach_user_interactions(items, user)


def attach_season_poster_urls(seasons: list) -> None:
    """Backfill each Season's ``poster_url`` from its show when the season has none.

    Seasons carry only their own TMDB poster, which is frequently null (TMDB does
    not always upload one per season). The trending-shows card renders the
    season's poster, so fall back to the show's best poster (then backdrop)
    asset to avoid blank cards. Mutates the instances in place for the
    serializer to read; one bulk ``MediaAsset`` fetch, no per-season N+1.
    """
    if not seasons:
        return
    show_ids = list({s.show_id for s in seasons})
    posters: dict[int, tuple[str, int]] = {}
    backdrops: dict[int, tuple[str, int]] = {}
    rows = MediaAsset.objects.filter(
        media_item_id__in=show_ids,
        asset_type__in=("poster", "backdrop"),
    ).values_list("media_item_id", "asset_type", "url", "score")
    for media_item_id, asset_type, url, score in rows:
        if not url:
            continue
        bucket = posters if asset_type == "poster" else backdrops
        if media_item_id not in bucket or (score or 0) > bucket[media_item_id][1]:
            bucket[media_item_id] = (url, score or 0)
    for season in seasons:
        if season.poster_url:
            continue
        fallback = posters.get(season.show_id) or backdrops.get(season.show_id)
        season.poster_url = fallback[0] if fallback else None


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
    movie = getattr(item, "movie", None) if getattr(item, "media_type", None) == "movie" else None
    item.revenue = movie.revenue if movie is not None else None
    item.budget = movie.budget if movie is not None else None


# A "best"/top-rated game should have been scored by more than a couple of
# IGDB critic outlets; without this floor the ranking is dominated by
# single-outlet 100s (indie + retro titles that a lone outlet rated perfectly).
_MIN_GAME_RATING_VOTES = 4


def list_media(
    *,
    media_type: str | None = None,
    genre: str | None = None,
    company: str | None = None,
    language: str | None = None,
    is_anime: bool | None = None,
    platform: str | None = None,
    exclude_adult: bool = False,
    sort_by: str | None = None,
    sort_dir: str = "desc",
    person_id: int | None = None,
    has_artwork: bool = False,
    has_logo: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
    main_games_only: bool = False,
    prefer_local: bool = False,
) -> QuerySet:
    """Paginated catalog browse (legacy ``MediaService.list_media``).

    Financial sorts and credit-role filters that required legacy joins are
    approximated: ``revenue``/``budget`` sort against the movie subtype and
    ``person_id`` filters on credited person. ``has_artwork`` mirrors the
    legacy textless-poster rule (game/music fall back to plain poster);
    ``has_logo``/``date_from``/``date_to`` filter on logo assets and
    ``release_date``. ``main_games_only`` restricts games to their stored
    ``main_game`` type so DLC/expansions never rank in curated rails. Rating
    sorts (``rating``/``rating_count``) drop rows that carry no score, since a
    null score has no business ranking. ``prefer_local`` ranks titles whose
    poster/backdrop is already mirrored to disk ahead of remote-only rows so
    discover can paint from ``/api/v1/assets``. Embedding-dependent features
    are not represented (schema defers vectors).
    """
    qs = MediaItem.objects.all()
    if media_type:
        qs = qs.filter(media_type=media_type)
        if media_type == "movie":
            qs = qs.select_related("movie")
    if genre:
        # Comma-separated slugs/ids OR together — multi-select means "any of these".
        genre_tokens = [part.strip() for part in str(genre).split(",") if part.strip()]
        if genre_tokens:
            genre_q = Q()
            for genre_str in genre_tokens:
                if genre_str.isdigit():
                    genre_q |= Q(media_genres__genre__slug=genre_str) | Q(
                        media_genres__genre_id=int(genre_str)
                    )
                else:
                    genre_q |= Q(media_genres__genre__slug=genre_str)
            qs = qs.filter(genre_q)
    if company:
        qs = qs.filter(involved_companies__company_id=company)
    if platform:
        qs = qs.filter(platforms__platform__slug=platform)
    if language:
        qs = qs.filter(original_language=language)
    if is_anime is not None:
        if media_type == "movie":
            qs = qs.filter(movie__is_anime=is_anime)
        elif media_type == "show":
            qs = qs.filter(show__is_anime=is_anime)
        elif media_type is None:
            # Movies/shows honor the flag; games (and other types) have no
            # anime bit — include them only when excluding anime.
            anime_movies = Q(media_type="movie", movie__is_anime=True)
            anime_shows = Q(media_type="show", show__is_anime=True)
            if is_anime:
                qs = qs.filter(anime_movies | anime_shows)
            else:
                qs = qs.filter(
                    ~Q(media_type__in=("movie", "show"))
                    | Q(media_type="movie", movie__is_anime=False)
                    | Q(media_type="show", show__is_anime=False)
                )
    if exclude_adult:
        qs = qs.filter(is_adult=False)
    if person_id is not None:
        qs = qs.filter(credits__person_id=person_id)
    if has_artwork:
        # Movies/shows need a textless poster (TMDB+Fanart provide it); games
        # (IGDB covers) have text baked in, so their plain poster counts.
        qs = qs.annotate(
            _has_textless=Exists(
                MediaAsset.objects.filter(
                    media_item_id=OuterRef("pk"), asset_type="textless_poster"
                )
            ),
            _has_poster=Exists(
                MediaAsset.objects.filter(media_item_id=OuterRef("pk"), asset_type="poster")
            ),
        ).filter(Q(_has_textless=True) | (Q(media_type="game") & Q(_has_poster=True)))
    if has_logo:
        qs = qs.filter(
            Exists(MediaAsset.objects.filter(media_item_id=OuterRef("pk"), asset_type="logo"))
        )
    if date_from is not None:
        qs = qs.filter(release_date__gte=date_from)
    if date_to is not None:
        qs = qs.filter(release_date__lte=date_to)

    if main_games_only:
        qs = qs.filter(game__game_type="main_game")
    direction = "-" if sort_dir == "desc" else ""
    sort_map = {
        "popularity": "popularity",
        "rating": "avg_rating",
        "rating_count": "rating_count",
        "release_date": "release_date",
        "title": "title",
        "views": "view_count",
        "revenue": "movie__revenue",
        "budget": "movie__budget",
        "profit": "movie__revenue",
    }
    sort_field = sort_map.get(sort_by or "")
    if sort_field == "avg_rating":
        qs = qs.filter(avg_rating__isnull=False).exclude(avg_rating=0)
        if main_games_only:
            qs = qs.filter(rating_count__gte=_MIN_GAME_RATING_VOTES)
    elif sort_field == "rating_count":
        qs = qs.filter(rating_count__gt=0)
    order: list[str] = []
    if prefer_local:
        # Short-circuit: if no asset has ever been mirrored the annotation is a
        # no-op that still adds an expensive correlated subquery to every row.
        # One EXISTS over the whole table (O(1) via the local_name index) avoids
        # the per-row subquery entirely when the mirror is empty or unused.
        _any_local = (
            MediaAsset.objects.filter(
                local_name__isnull=False,
                asset_type__in=LOCAL_CARD_ASSET_TYPES,
            )
            .exclude(local_name="")
            .exists()
        )
        if _any_local:
            qs = qs.annotate(_has_local=local_artwork_exists())
            order.append("-_has_local")
    if sort_field:
        order.extend([f"{direction}{sort_field}", "-popularity", "id"])
    else:
        order.extend(["-popularity", "id"])
    return qs.order_by(*order).distinct()


def media_detail_queryset(media_id: int) -> MediaItem | None:
    """Load one item with all relations the detail serializer needs."""
    return (
        MediaItem.objects.select_related(
            "movie",
            "show",
            "game",
            "movie__collection",
            "game__franchise",
        )
        .prefetch_related(
            "assets",
            "videos",
            "releases",
            "media_genres__genre",
            "credits__person",
            "characters__character",
            "involved_companies__company",
            "platforms__platform",
            "game_modes__game_mode",
            "watch_providers__watch_provider",
            "show__seasons__episodes",
            "movie__collection__movies__media_item",
            "movie__collection__movies__media_item__assets",
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


_EMBEDDING_DIM = 1024
_TASTE_SEED_LIMIT = 40
_TASTE_POSITIVE_INTERACTIONS = ("liked", "watched", "played", "owned", "watchlisted")
_TASTE_MIN_RATING = 7
# Blend weight for the page title vs the user's taste vector (For You).
_FOR_YOU_SOURCE_WEIGHT = 0.4


def _as_float_list(value) -> list[float] | None:
    """Coerce a stored embedding (list / memoryview / string) to 1024 floats."""
    if value is None:
        return None
    if isinstance(value, memoryview):
        value = value.tolist()
    if isinstance(value, str):
        import json

        try:
            value = json.loads(value)
        except Exception:
            value = [float(x.strip()) for x in value.strip("[]").split(",") if x.strip()]
    try:
        vec = [float(x) for x in value]
    except (TypeError, ValueError):
        return None
    if len(vec) != _EMBEDDING_DIM:
        return None
    return vec


def _normalize(vector: list[float]) -> list[float]:
    import math

    norm = math.sqrt(sum(v * v for v in vector))
    if norm <= 0.0:
        return vector
    return [v / norm for v in vector]


def _blend_vectors(a: list[float], b: list[float], *, a_weight: float) -> list[float]:
    """Weighted sum of two unit-ish vectors, then L2-normalize."""
    w = max(0.0, min(1.0, a_weight))
    mixed = [(w * x) + ((1.0 - w) * y) for x, y in zip(a, b, strict=True)]
    return _normalize(mixed)


def _py_cosine_distance(vec_a: list[float], vec_b: list[float]) -> float:
    import math

    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for a, b in zip(vec_a, vec_b, strict=False):
        a_f = float(a)
        b_f = float(b)
        dot += a_f * b_f
        norm_a += a_f * a_f
        norm_b += b_f * b_f
    if norm_a <= 0.0 or norm_b <= 0.0:
        return 1.0
    cos_sim = dot / (math.sqrt(norm_a) * math.sqrt(norm_b))
    return max(0.0, 1.0 - cos_sim)


_RUNTIME_BUCKETS = {
    "short": (None, 90),
    "medium": (91, 150),
    "long": (151, None),
}
_DECIDE_MEDIA_TYPES = frozenset({"movie", "show", "game"})


def _apply_decide_filters(
    qs: QuerySet,
    *,
    media_types: list[str] | None,
    genre_ids: list[int] | None,
    runtime: str | None,
) -> QuerySet:
    """Apply decide-picker filters to a MediaItem queryset."""
    from django.db.models import Avg

    from apps.media.models import MediaGenre

    if media_types:
        qs = qs.filter(media_type__in=media_types)
    if genre_ids:
        # Exists avoids distinct() which can scramble distance ORDER BY.
        qs = qs.filter(
            Exists(
                MediaGenre.objects.filter(
                    media_item_id=OuterRef("pk"),
                    genre_id__in=genre_ids,
                )
            )
        )
    if runtime and runtime in _RUNTIME_BUCKETS:
        lo, hi = _RUNTIME_BUCKETS[runtime]
        movie_clause = Q(media_type="movie")
        if lo is not None:
            movie_clause &= Q(movie__runtime__gte=lo)
        if hi is not None:
            movie_clause &= Q(movie__runtime__lte=hi)

        qs = qs.annotate(_avg_ep_runtime=Avg("show__seasons__episodes__runtime"))
        show_clause = Q(media_type="show")
        if lo is not None:
            show_clause &= Q(_avg_ep_runtime__gte=lo)
        if hi is not None:
            show_clause &= Q(_avg_ep_runtime__lte=hi)

        # Games ignore runtime; only include them when requested.
        game_clause = Q(media_type="game")
        qs = qs.filter(movie_clause | show_clause | game_clause)
    return qs


def _embedding_neighbors_ranked(
    vector: list[float],
    *,
    media_type: str | None,
    exclude_ids: set[int],
    limit: int,
    genre_ids: list[int] | None = None,
    runtime: str | None = None,
    media_types: list[str] | None = None,
) -> list[tuple[float, MediaItem]]:
    """Nearest catalog neighbors as (cosine_distance, item) pairs."""
    from django.db import connection

    qs = MediaItem.objects.filter(embedding__isnull=False, is_adult=False)
    if media_type:
        qs = qs.filter(media_type=media_type)
    qs = _apply_decide_filters(qs, media_types=media_types, genre_ids=genre_ids, runtime=runtime)
    if exclude_ids:
        qs = qs.exclude(pk__in=exclude_ids)

    fetch = max(limit * 3, limit + len(exclude_ids), limit)

    if connection.vendor == "postgresql":
        from pgvector.django import CosineDistance

        qs = qs.annotate(
            distance=CosineDistance("embedding", vector), _has_local=local_artwork_exists()
        ).order_by("distance", "-_has_local", "-popularity")[:fetch]
        return [(float(item.distance), item) for item in qs[:limit]]

    items = list(qs.annotate(_has_local=local_artwork_exists()))
    scored: list[tuple[float, MediaItem]] = []
    for item in items:
        emb = _as_float_list(item.embedding)
        if emb is None:
            continue
        scored.append((_py_cosine_distance(emb, vector), item))
    scored.sort(
        key=lambda pair: (
            pair[0],
            0 if getattr(pair[1], "_has_local", False) else 1,
            -(pair[1].popularity or 0),
        )
    )
    return scored[:limit]


def _embedding_neighbors(
    vector: list[float],
    *,
    media_type: str | None,
    exclude_ids: set[int],
    limit: int,
) -> list[MediaItem]:
    """Nearest catalog neighbors by cosine distance (pgvector; Python fallback)."""
    return [
        item
        for _, item in _embedding_neighbors_ranked(
            vector,
            media_type=media_type,
            exclude_ids=exclude_ids,
            limit=limit,
        )
    ]


def _genre_similar_items(
    source: MediaItem, media_type: str | None, exclude_ids: set[int], limit: int
) -> list[MediaItem]:
    """Shared-genre count then popularity — used when embeddings are missing."""
    genre_ids = list(source.media_genres.values_list("genre_id", flat=True))
    qs = MediaItem.objects.filter(is_adult=False)
    if exclude_ids:
        qs = qs.exclude(pk__in=exclude_ids)
    if media_type:
        qs = qs.filter(media_type=media_type)
    elif source.media_type in ("movie", "show", "game"):
        qs = qs.filter(media_type=source.media_type)
    if genre_ids:
        qs = qs.filter(media_genres__genre_id__in=genre_ids).annotate(
            shared=Count("media_genres__genre", filter=Q(media_genres__genre_id__in=genre_ids)),
            _has_local=local_artwork_exists(),
        )
        qs = qs.order_by("-_has_local", "-shared", "-popularity")
    else:
        qs = qs.annotate(_has_local=local_artwork_exists())
        qs = qs.order_by("-_has_local", "-popularity")
    return list(qs.distinct()[:limit])


def _resolve_similar_type(source: MediaItem, media_type: str | None) -> str | None:
    if media_type:
        return media_type
    if source.media_type in ("movie", "show", "game"):
        return source.media_type
    return None


def similar_items(media_id: int, media_type: str | None, limit: int) -> list[MediaItem]:
    """Content-based similar items.

    Prefers pgvector cosine neighbors when the source has an embedding; falls
    back to shared-genre count then popularity.
    """
    try:
        source = MediaItem.objects.get(pk=media_id)
    except MediaItem.DoesNotExist:
        return []
    filter_type = _resolve_similar_type(source, media_type)
    exclude = {media_id}
    source_vec = _as_float_list(source.embedding)
    if source_vec is not None:
        hits = _embedding_neighbors(
            source_vec, media_type=filter_type, exclude_ids=exclude, limit=limit
        )
        if hits:
            return hits
    return _genre_similar_items(source, filter_type, exclude, limit)


def _user_seen_media_ids(user_id: int, *, since=None) -> set[int]:
    from apps.social.models import MediaItemRating, UserMediaInteraction

    rated_qs = MediaItemRating.objects.filter(user_id=user_id)
    touched_qs = UserMediaInteraction.objects.filter(user_id=user_id)
    if since is not None:
        rated_qs = rated_qs.filter(updated_at__gt=since)
        touched_qs = touched_qs.filter(updated_at__gt=since)
    rated = rated_qs.values_list("media_item_id", flat=True)
    touched = touched_qs.values_list("media_item_id", flat=True)
    return set(rated) | set(touched)


def _user_blocked_media_ids(user_id: int) -> set[int]:
    from apps.media.models import BlockedRecommendation

    return set(
        BlockedRecommendation.objects.filter(user_id=user_id).values_list(
            "media_item_id", flat=True
        )
    )


def _user_taste_vector(user_id: int, *, since=None) -> list[float] | None:
    """Average embedding of the user's positive ratings / interactions.

    High ratings (≥7) and liked/watched/played/owned/watchlisted titles with
    embeddings are weighted and averaged into a single 1024-d taste vector.
    When ``since`` is set (``User.taste_reset_at``), only activity after that
    timestamp contributes — letting users refresh For You without wiping
    library history.
    """
    from apps.social.models import MediaItemRating, UserMediaInteraction

    weights: dict[int, float] = {}

    ratings_qs = MediaItemRating.objects.filter(user_id=user_id, score__gte=_TASTE_MIN_RATING)
    if since is not None:
        ratings_qs = ratings_qs.filter(updated_at__gt=since)
    ratings = ratings_qs.order_by("-updated_at").values_list("media_item_id", "score")[
        :_TASTE_SEED_LIMIT
    ]
    for media_item_id, score in ratings:
        weights[media_item_id] = max(weights.get(media_item_id, 0.0), float(score) / 10.0)

    interactions_qs = UserMediaInteraction.objects.filter(
        user_id=user_id, interaction_type__in=_TASTE_POSITIVE_INTERACTIONS
    )
    if since is not None:
        interactions_qs = interactions_qs.filter(updated_at__gt=since)
    interactions = interactions_qs.order_by("-updated_at").values_list(
        "media_item_id", "interaction_type"
    )[:_TASTE_SEED_LIMIT]
    interaction_weight = {
        "liked": 1.0,
        "watched": 0.75,
        "played": 0.75,
        "owned": 0.55,
        "watchlisted": 0.45,
    }
    for media_item_id, interaction_type in interactions:
        w = interaction_weight.get(interaction_type, 0.5)
        weights[media_item_id] = max(weights.get(media_item_id, 0.0), w)

    if not weights:
        return None

    # Prefer the highest-weighted seeds, then fill embeddings.
    seed_ids = sorted(weights.keys(), key=lambda mid: weights[mid], reverse=True)[
        :_TASTE_SEED_LIMIT
    ]
    embedded = {
        item.pk: _as_float_list(item.embedding)
        for item in MediaItem.objects.filter(pk__in=seed_ids, embedding__isnull=False).only(
            "id", "embedding"
        )
    }

    accumulator = [0.0] * _EMBEDDING_DIM
    total_weight = 0.0
    for media_item_id in seed_ids:
        vec = embedded.get(media_item_id)
        if vec is None:
            continue
        w = weights[media_item_id]
        total_weight += w
        for i, component in enumerate(vec):
            accumulator[i] += component * w

    if total_weight <= 0.0:
        return None
    return _normalize([v / total_weight for v in accumulator])


def recommended_items(
    media_id: int,
    media_type: str | None,
    limit: int,
    user: _User = None,
) -> list[MediaItem]:
    """Personalized "For You" neighbors for a media detail page.

    Blends the page title's embedding with a taste vector built from the
    user's ratings and interactions, then runs the same cosine neighbor
    lookup as Similar. Falls back to genre similar when embeddings or
    taste signals are unavailable.
    """
    try:
        source = MediaItem.objects.get(pk=media_id)
    except MediaItem.DoesNotExist:
        return []

    filter_type = _resolve_similar_type(source, media_type)
    exclude = {media_id}
    user_id = getattr(user, "id", None) if getattr(user, "is_authenticated", False) else None
    since = getattr(user, "taste_reset_at", None) if user_id is not None else None
    if user_id is not None:
        exclude |= _user_seen_media_ids(user_id, since=since) | _user_blocked_media_ids(user_id)

    source_vec = _as_float_list(source.embedding)
    taste_vec = _user_taste_vector(user_id, since=since) if user_id is not None else None

    query: list[float] | None = None
    if source_vec is not None and taste_vec is not None:
        query = _blend_vectors(source_vec, taste_vec, a_weight=_FOR_YOU_SOURCE_WEIGHT)
    elif taste_vec is not None:
        query = taste_vec
    elif source_vec is not None and user_id is not None:
        # Authenticated cold start: same semantic neighborhood, but hide titles
        # the user already rated / interacted with (after any taste reset).
        query = source_vec

    if query is not None:
        hits = _embedding_neighbors(query, media_type=filter_type, exclude_ids=exclude, limit=limit)
        if hits:
            return hits

    return _genre_similar_items(source, filter_type, exclude, limit)


def _popularity_candidates(
    *,
    exclude_ids: set[int],
    limit: int,
    media_types: list[str] | None,
    genre_ids: list[int] | None,
    runtime: str | None,
) -> list[MediaItem]:
    qs = MediaItem.objects.filter(is_adult=False)
    qs = _apply_decide_filters(qs, media_types=media_types, genre_ids=genre_ids, runtime=runtime)
    if exclude_ids:
        qs = qs.exclude(pk__in=exclude_ids)
    qs = qs.annotate(_has_local=local_artwork_exists()).order_by("-_has_local", "-popularity")
    return list(qs[:limit])


def _shuffle_pick_and_shortlist(
    ranked: list[tuple[float, MediaItem]],
    *,
    limit: int,
    seed: int | None,
) -> list[MediaItem]:
    """Pick a hero from the top neighborhood, then fill shortlist by distance."""
    import random

    if not ranked:
        return []

    pool_size = min(len(ranked), max(limit * 3, 15))
    pool = list(ranked[:pool_size])
    rng = random.Random(seed)
    hero_idx = rng.randrange(len(pool))
    hero_dist, hero = pool.pop(hero_idx)
    _ = hero_dist
    # Shortlist: remaining by ascending distance (original ranking).
    pool.sort(key=lambda pair: pair[0])
    shortlist = [item for _, item in pool[: max(0, limit - 1)]]
    return [hero, *shortlist]


def decide_items(
    user: _User,
    *,
    media_types: list[str] | None = None,
    genre_ids: list[int] | None = None,
    runtime: str | None = None,
    limit: int = 5,
    seed: int | None = None,
) -> tuple[list[MediaItem], bool]:
    """Standalone "Decide for me" picks from taste (no source title).

    Returns ``(items, cold_start)`` where ``items[0]`` is the hero pick and
    the rest are the shortlist. ``cold_start`` is True when the user has no
    taste vector and results fall back to popularity.
    """
    user_id = getattr(user, "id", None) if getattr(user, "is_authenticated", False) else None
    if user_id is None:
        return [], True

    types = [t for t in (media_types or ["movie", "show"]) if t in _DECIDE_MEDIA_TYPES]
    if not types:
        types = ["movie", "show"]

    since = getattr(user, "taste_reset_at", None)
    exclude = _user_seen_media_ids(user_id, since=since) | _user_blocked_media_ids(user_id)
    taste_vec = _user_taste_vector(user_id, since=since)

    fetch = max(limit * 4, 20)

    if taste_vec is not None:
        # Single untyped neighborhood filtered by requested types — one taste
        # vector ranks across movies/shows/games together.
        ranked = _embedding_neighbors_ranked(
            taste_vec,
            media_type=None,
            exclude_ids=exclude,
            limit=fetch,
            genre_ids=genre_ids,
            runtime=runtime,
            media_types=types,
        )
        if ranked:
            return _shuffle_pick_and_shortlist(ranked, limit=limit, seed=seed), False

    # Cold start: popularity under the same filters.
    popular = _popularity_candidates(
        exclude_ids=exclude,
        limit=fetch,
        media_types=types,
        genre_ids=genre_ids,
        runtime=runtime,
    )
    ranked_pop = [(float(i), item) for i, item in enumerate(popular)]
    return _shuffle_pick_and_shortlist(ranked_pop, limit=limit, seed=seed), True


def block_media_recommendation(user: _User, media_id: int) -> tuple[bool, MediaItem | None]:
    """Block a media item from recommendations for this user.

    Returns ``(created, item)`` where ``created`` is True if newly blocked, or
    False if it was already blocked. If ``item`` is None, the media item was not found.
    """
    user_id = getattr(user, "id", None) if getattr(user, "is_authenticated", False) else None
    if user_id is None:
        return False, None
    try:
        item = MediaItem.objects.get(pk=media_id)
    except MediaItem.DoesNotExist:
        return False, None

    from apps.media.models import BlockedRecommendation

    _, created = BlockedRecommendation.objects.get_or_create(
        user_id=user_id,
        media_item_id=media_id,
    )
    return created, item


def unblock_media_recommendation(user: _User, media_id: int) -> bool:
    """Unblock a media item from recommendations for this user.

    Returns True if an existing block was removed, False otherwise.
    """
    user_id = getattr(user, "id", None) if getattr(user, "is_authenticated", False) else None
    if user_id is None:
        return False

    from apps.media.models import BlockedRecommendation

    deleted, _ = BlockedRecommendation.objects.filter(
        user_id=user_id,
        media_item_id=media_id,
    ).delete()
    return bool(deleted)


def list_blocked_recommendations(user: _User) -> list[MediaItem]:
    """Return media items currently blocked from recommendations by this user."""
    user_id = getattr(user, "id", None) if getattr(user, "is_authenticated", False) else None
    if user_id is None:
        return []

    from apps.media.models import BlockedRecommendation

    blocked_ids = list(
        BlockedRecommendation.objects.filter(user_id=user_id)
        .order_by("-created_at")
        .values_list("media_item_id", flat=True)
    )
    if not blocked_ids:
        return []
    items_by_id = {item.pk: item for item in MediaItem.objects.filter(pk__in=blocked_ids)}
    return [items_by_id[mid] for mid in blocked_ids if mid in items_by_id]

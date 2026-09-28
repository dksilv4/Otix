"""Pure transformer functions for TMDB API payloads.

Converts upstream TMDB API dictionaries into strongly typed canonical instances:
``NormalizedMediaItem``, ``NormalizedCredit``, ``NormalizedAsset``, ``NormalizedCompany``,
``NormalizedVideo``, ``NormalizedSeason``, and ``NormalizedEpisode``.
"""

from __future__ import annotations

from typing import Any

from core.providers.framework import (
    NormalizedAsset,
    NormalizedCompany,
    NormalizedCredit,
    NormalizedEpisode,
    NormalizedMediaItem,
    NormalizedRating,
    NormalizedSeason,
    NormalizedVideo,
    compute_payload_hash,
    parse_iso_date,
    sanitize_text,
)

TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"


def image_url(path: str | None, size: str = "original") -> str | None:
    """Build an absolute TMDB image URL for a file path."""
    if not path or not isinstance(path, str):
        return None
    cleaned = path.strip()
    if not cleaned:
        return None
    return f"{TMDB_IMAGE_BASE}/{size}{cleaned}"


def transform_credit(raw: dict[str, Any], role: str) -> NormalizedCredit:
    """Transform a raw TMDB cast or crew dictionary into a NormalizedCredit."""
    raw_id = raw.get("id")
    person_id = str(raw_id) if raw_id is not None else None
    name = sanitize_text(raw.get("name")) or ""
    character = sanitize_text(raw.get("character")) if role == "cast" else None
    job = sanitize_text(raw.get("job")) if role == "crew" else None
    profile_path = raw.get("profile_path")
    photo_url = image_url(profile_path, size="w500")
    order = int(raw.get("order") or 0)

    return NormalizedCredit(
        person_id=person_id,
        name=name,
        role=role,
        character=character,
        job=job,
        order=order,
        photo_url=photo_url,
    )


def transform_company(raw: dict[str, Any], role: str = "production") -> NormalizedCompany:
    """Transform a raw TMDB company or network dictionary into a NormalizedCompany."""
    raw_id = raw.get("id")
    company_id = str(raw_id) if raw_id is not None else None
    name = sanitize_text(raw.get("name")) or ""
    logo_path = raw.get("logo_path")
    logo_url = image_url(logo_path, size="w185")

    return NormalizedCompany(
        company_id=company_id,
        name=name,
        role=role,
        logo_url=logo_url,
    )


def transform_video(raw: dict[str, Any]) -> NormalizedVideo | None:
    """Transform a raw TMDB video dictionary into a NormalizedVideo."""
    key = raw.get("key")
    site = (raw.get("site") or "").lower()
    if not key or not site:
        return None

    title = sanitize_text(raw.get("name")) or "Trailer"
    video_type = (raw.get("type") or "trailer").lower()

    return NormalizedVideo(
        video_id=str(key),
        title=title,
        site=site,
        video_type=video_type,
    )


def transform_asset(
    entry: dict[str, Any],
    asset_type: str,
    score: int = 0,
    size: str = "original",
) -> NormalizedAsset | None:
    """Transform a raw TMDB image entry into a NormalizedAsset."""
    path = entry.get("file_path") or entry.get("path")
    url = image_url(path, size=size)
    if not url:
        return None

    width = entry.get("width")
    height = entry.get("height")
    language = entry.get("iso_639_1")

    return NormalizedAsset(
        asset_type=asset_type,
        url=url,
        provider="tmdb",
        score=score,
        width=int(width) if width is not None else None,
        height=int(height) if height is not None else None,
        language=language if isinstance(language, str) else None,
    )


def transform_episode(raw: dict[str, Any], season_number: int = 0) -> NormalizedEpisode:
    """Transform a raw TMDB episode dictionary into a NormalizedEpisode."""
    ep_num = int(raw.get("episode_number") or 0)
    s_num = int(raw.get("season_number", season_number) or season_number)
    title = sanitize_text(raw.get("name")) or f"Episode {ep_num}"
    air_date = parse_iso_date(raw.get("air_date"))
    overview = sanitize_text(raw.get("overview"))
    runtime = raw.get("runtime")
    runtime_minutes = int(runtime) if runtime is not None else None

    return NormalizedEpisode(
        season_number=s_num,
        episode_number=ep_num,
        title=title,
        air_date=air_date,
        overview=overview,
        runtime_minutes=runtime_minutes,
    )


def transform_season(raw: dict[str, Any]) -> NormalizedSeason:
    """Transform a raw TMDB season dictionary into a NormalizedSeason."""
    season_number = int(raw.get("season_number") or 0)
    default_name = f"Season {season_number}" if season_number > 0 else "Specials"
    name = sanitize_text(raw.get("name")) or default_name
    air_date = parse_iso_date(raw.get("air_date"))
    episodes = [
        transform_episode(ep, season_number=season_number)
        for ep in (raw.get("episodes") or [])
        if isinstance(ep, dict) and ep.get("episode_number") is not None
    ]

    return NormalizedSeason(
        season_number=season_number,
        name=name,
        air_date=air_date,
        episodes=tuple(episodes),
    )


def _extract_movie_content_rating(raw: dict[str, Any]) -> str | None:
    """Extract preferred certification from movie release_dates."""
    release_dates = raw.get("release_dates") or {}
    results = release_dates.get("results") if isinstance(release_dates, dict) else None
    if not isinstance(results, list):
        return None

    # First look for US certification
    for country in results:
        if isinstance(country, dict) and country.get("iso_3166_1") == "US":
            for entry in country.get("release_dates") or []:
                if isinstance(entry, dict) and entry.get("certification"):
                    cert = sanitize_text(entry.get("certification"))
                    if cert:
                        return cert

    # Fall back to any non-empty certification
    for country in results:
        if isinstance(country, dict):
            for entry in country.get("release_dates") or []:
                if isinstance(entry, dict) and entry.get("certification"):
                    cert = sanitize_text(entry.get("certification"))
                    if cert:
                        return cert
    return None


def _extract_show_content_rating(raw: dict[str, Any]) -> str | None:
    """Extract preferred certification from show content_ratings."""
    content_ratings = raw.get("content_ratings") or {}
    results = content_ratings.get("results") if isinstance(content_ratings, dict) else None
    if not isinstance(results, list):
        return None

    # Prefer US rating
    for country in results:
        if isinstance(country, dict) and country.get("iso_3166_1") == "US":
            rating = sanitize_text(country.get("rating"))
            if rating:
                return rating

    # Fall back to any country
    for country in results:
        if isinstance(country, dict):
            rating = sanitize_text(country.get("rating"))
            if rating:
                return rating
    return None


def transform_movie(raw: dict[str, Any]) -> NormalizedMediaItem:
    """Transform a raw TMDB movie detail payload into a NormalizedMediaItem."""
    tmdb_id = raw.get("id")
    if tmdb_id is None:
        raise ValueError("TMDB movie detail missing 'id'")

    external_ids: dict[str, str] = {"tmdb": str(tmdb_id)}
    imdb_id = raw.get("imdb_id") or (raw.get("external_ids") or {}).get("imdb_id")
    if imdb_id:
        external_ids["imdb"] = str(imdb_id)
    tvdb_id = (raw.get("external_ids") or {}).get("tvdb_id")
    if tvdb_id:
        external_ids["tvdb"] = str(tvdb_id)
    wikidata_id = (raw.get("external_ids") or {}).get("wikidata_id")
    if wikidata_id:
        external_ids["wikidata"] = str(wikidata_id)

    title = sanitize_text(raw.get("title") or raw.get("name")) or "Unknown Movie"
    original_title = sanitize_text(raw.get("original_title"))
    overview = sanitize_text(raw.get("overview"))
    release_date = parse_iso_date(raw.get("release_date") or raw.get("first_air_date"))
    status = sanitize_text(raw.get("status"))

    runtime = raw.get("runtime")
    runtime_minutes = int(runtime) if runtime is not None else None

    # Genres
    genres = tuple(
        str(g["name"]).strip()
        for g in raw.get("genres", [])
        if isinstance(g, dict) and g.get("name")
    )

    # Assets
    assets_list: list[NormalizedAsset] = []
    poster_path = raw.get("poster_path")
    if poster_path:
        primary_poster = transform_asset({"file_path": poster_path}, "poster", score=100)
        if primary_poster:
            assets_list.append(primary_poster)

    backdrop_path = raw.get("backdrop_path")
    if backdrop_path:
        primary_backdrop = transform_asset({"file_path": backdrop_path}, "backdrop", score=100)
        if primary_backdrop:
            assets_list.append(primary_backdrop)

    images = raw.get("images") or {}
    if isinstance(images, dict):
        for i, entry in enumerate((images.get("backdrops") or [])[:8]):
            if isinstance(entry, dict):
                asset = transform_asset(entry, "backdrop", score=60 - i * 5)
                if asset:
                    assets_list.append(asset)
        for i, entry in enumerate((images.get("logos") or [])[:8]):
            if isinstance(entry, dict):
                asset = transform_asset(entry, "logo", score=60 - i * 5)
                if asset:
                    assets_list.append(asset)
        for i, entry in enumerate((images.get("posters") or [])[:8]):
            if isinstance(entry, dict) and entry.get("iso_639_1") is None:
                asset = transform_asset(entry, "textless_poster", score=60 - i * 5)
                if asset:
                    assets_list.append(asset)

    # Credits
    credits_list: list[NormalizedCredit] = []
    credits_raw = raw.get("credits") or {}
    if isinstance(credits_raw, dict):
        for c in credits_raw.get("cast") or []:
            if isinstance(c, dict) and c.get("name"):
                credits_list.append(transform_credit(c, "cast"))
        for c in credits_raw.get("crew") or []:
            if isinstance(c, dict) and c.get("name"):
                credits_list.append(transform_credit(c, "crew"))

    # Companies
    companies_list: list[NormalizedCompany] = []
    for c in raw.get("production_companies") or []:
        if isinstance(c, dict) and c.get("name"):
            companies_list.append(transform_company(c, "production"))

    # Ratings
    ratings_list: list[NormalizedRating] = []
    vote_avg = raw.get("vote_average")
    if vote_avg is not None and float(vote_avg) > 0:
        ratings_list.append(
            NormalizedRating(
                provider="tmdb",
                score=float(vote_avg),
                max_score=10.0,
                votes=raw.get("vote_count"),
                type="audience",
            )
        )

    # Videos
    videos_list: list[NormalizedVideo] = []
    videos_container = raw.get("videos") or {}
    if isinstance(videos_container, dict):
        for entry in (videos_container.get("results") or [])[:10]:
            if isinstance(entry, dict):
                video = transform_video(entry)
                if video:
                    videos_list.append(video)

    content_rating = _extract_movie_content_rating(raw)

    return NormalizedMediaItem(
        external_ids=external_ids,
        title=title,
        media_type="movie",
        original_title=original_title,
        overview=overview,
        release_date=release_date,
        status=status,
        runtime_minutes=runtime_minutes,
        genres=genres,
        assets=tuple(assets_list),
        credits=tuple(credits_list),
        companies=tuple(companies_list),
        ratings=tuple(ratings_list),
        videos=tuple(videos_list),
        seasons=(),
        content_rating=content_rating,
        payload_hash=compute_payload_hash(raw),
    )


def transform_show(raw: dict[str, Any]) -> NormalizedMediaItem:
    """Transform a raw TMDB TV series detail payload into a NormalizedMediaItem."""
    tmdb_id = raw.get("id")
    if tmdb_id is None:
        raise ValueError("TMDB show detail missing 'id'")

    external_ids: dict[str, str] = {"tmdb": str(tmdb_id)}
    imdb_id = raw.get("imdb_id") or (raw.get("external_ids") or {}).get("imdb_id")
    if imdb_id:
        external_ids["imdb"] = str(imdb_id)
    tvdb_id = (raw.get("external_ids") or {}).get("tvdb_id")
    if tvdb_id:
        external_ids["tvdb"] = str(tvdb_id)
    wikidata_id = (raw.get("external_ids") or {}).get("wikidata_id")
    if wikidata_id:
        external_ids["wikidata"] = str(wikidata_id)

    title = sanitize_text(raw.get("name") or raw.get("title")) or "Unknown Show"
    original_title = sanitize_text(raw.get("original_name"))
    overview = sanitize_text(raw.get("overview"))
    release_date = parse_iso_date(raw.get("first_air_date") or raw.get("release_date"))
    status = sanitize_text(raw.get("status"))

    episode_run_times = raw.get("episode_run_time") or []
    runtime_minutes = (
        int(episode_run_times[0])
        if episode_run_times and isinstance(episode_run_times[0], (int, float))
        else None
    )

    # Genres
    genres = tuple(
        str(g["name"]).strip()
        for g in raw.get("genres", [])
        if isinstance(g, dict) and g.get("name")
    )

    # Assets
    assets_list: list[NormalizedAsset] = []
    poster_path = raw.get("poster_path")
    if poster_path:
        primary_poster = transform_asset({"file_path": poster_path}, "poster", score=100)
        if primary_poster:
            assets_list.append(primary_poster)

    backdrop_path = raw.get("backdrop_path")
    if backdrop_path:
        primary_backdrop = transform_asset({"file_path": backdrop_path}, "backdrop", score=100)
        if primary_backdrop:
            assets_list.append(primary_backdrop)

    images = raw.get("images") or {}
    if isinstance(images, dict):
        for i, entry in enumerate((images.get("backdrops") or [])[:8]):
            if isinstance(entry, dict):
                asset = transform_asset(entry, "backdrop", score=60 - i * 5)
                if asset:
                    assets_list.append(asset)
        for i, entry in enumerate((images.get("logos") or [])[:8]):
            if isinstance(entry, dict):
                asset = transform_asset(entry, "logo", score=60 - i * 5)
                if asset:
                    assets_list.append(asset)
        for i, entry in enumerate((images.get("posters") or [])[:8]):
            if isinstance(entry, dict) and entry.get("iso_639_1") is None:
                asset = transform_asset(entry, "textless_poster", score=60 - i * 5)
                if asset:
                    assets_list.append(asset)

    # Credits
    credits_list: list[NormalizedCredit] = []
    credits_raw = raw.get("credits") or {}
    if isinstance(credits_raw, dict):
        for c in credits_raw.get("cast") or []:
            if isinstance(c, dict) and c.get("name"):
                credits_list.append(transform_credit(c, "cast"))
        for c in credits_raw.get("crew") or []:
            if isinstance(c, dict) and c.get("name"):
                credits_list.append(transform_credit(c, "crew"))

    # Companies & Networks
    companies_list: list[NormalizedCompany] = []
    for c in raw.get("production_companies") or []:
        if isinstance(c, dict) and c.get("name"):
            companies_list.append(transform_company(c, "production"))
    for net in raw.get("networks") or []:
        if isinstance(net, dict) and net.get("name"):
            companies_list.append(transform_company(net, "network"))

    # Ratings
    ratings_list: list[NormalizedRating] = []
    vote_avg = raw.get("vote_average")
    if vote_avg is not None and float(vote_avg) > 0:
        ratings_list.append(
            NormalizedRating(
                provider="tmdb",
                score=float(vote_avg),
                max_score=10.0,
                votes=raw.get("vote_count"),
                type="audience",
            )
        )

    # Videos
    videos_list: list[NormalizedVideo] = []
    videos_container = raw.get("videos") or {}
    if isinstance(videos_container, dict):
        for entry in (videos_container.get("results") or [])[:10]:
            if isinstance(entry, dict):
                video = transform_video(entry)
                if video:
                    videos_list.append(video)

    # Seasons
    seasons_list: list[NormalizedSeason] = []
    for s in raw.get("seasons") or []:
        if isinstance(s, dict):
            s_num = s.get("season_number")
            if s_num is not None and int(s_num) > 0:
                seasons_list.append(transform_season(s))

    content_rating = _extract_show_content_rating(raw)

    return NormalizedMediaItem(
        external_ids=external_ids,
        title=title,
        media_type="show",
        original_title=original_title,
        overview=overview,
        release_date=release_date,
        status=status,
        runtime_minutes=runtime_minutes,
        genres=genres,
        assets=tuple(assets_list),
        credits=tuple(credits_list),
        companies=tuple(companies_list),
        ratings=tuple(ratings_list),
        videos=tuple(videos_list),
        seasons=tuple(seasons_list),
        content_rating=content_rating,
        payload_hash=compute_payload_hash(raw),
    )


def transform_watch_providers(raw: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Transform a TMDB watch/providers response grouped by country code."""
    results = raw.get("results") or {}
    if not isinstance(results, dict):
        return {}

    transformed: dict[str, list[dict[str, Any]]] = {}
    for country_code, data in results.items():
        if not isinstance(data, dict):
            continue
        country_providers: list[dict[str, Any]] = []
        for method in ("flatrate", "rent", "buy", "free"):
            items = data.get(method) or []
            for item in items:
                if isinstance(item, dict) and item.get("provider_id"):
                    country_providers.append(
                        {
                            "provider_id": item["provider_id"],
                            "provider_name": item.get("provider_name", ""),
                            "logo_url": image_url(item.get("logo_path"), size="w92"),
                            "monetization_type": method,
                            "display_priority": item.get("display_priority", 0),
                        }
                    )
        if country_providers:
            transformed[country_code.upper()] = country_providers
    return transformed

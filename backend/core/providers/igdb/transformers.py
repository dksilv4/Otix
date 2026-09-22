"""Pure transformers converting raw IGDB payloads into canonical framework entities."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from core.providers.framework import (
    NormalizedAsset,
    NormalizedCompany,
    NormalizedMediaItem,
    NormalizedRating,
    NormalizedVideo,
    clamp_rating,
    compute_payload_hash,
    parse_iso_date,
    sanitize_text,
)
from core.providers.igdb.schemas import (
    AGE_RATING_LABEL_MAP,
    AGE_RATING_ORG_MAP,
    BACKDROP_MIN_ASPECT,
    COVER_IMAGE_TYPES,
    EXTERNAL_SOURCE_EPIC,
    EXTERNAL_SOURCE_GOG,
    EXTERNAL_SOURCE_STEAM,
    ICON_ARTWORK_TYPES,
    ICON_IMAGE_TYPES,
    IGDB_STATUS_MAP,
    LOGO_ARTWORK_TYPES,
    LOGO_IMAGE_TYPES,
    cover_url,
    image_url,
)


def _parse_release_date(raw_date: Any) -> date | None:
    """Parse an IGDB first_release_date (Unix seconds or ISO string) to a date."""
    if raw_date is None:
        return None
    if isinstance(raw_date, (int, float)) and not isinstance(raw_date, bool):
        try:
            return datetime.fromtimestamp(int(raw_date), tz=UTC).date()
        except (ValueError, OverflowError, OSError):
            return None
    if isinstance(raw_date, str):
        return parse_iso_date(raw_date)
    return None


def transform_asset(
    entry: dict[str, Any],
    asset_type: str,
    *,
    score: int = 50,
    size: str = "t_original",
) -> NormalizedAsset | None:
    """Transform an IGDB image entry into a NormalizedAsset."""
    url = image_url(entry.get("image_id"), size=size)
    if not url:
        return None
    width = entry.get("width")
    height = entry.get("height")
    w = int(width) if isinstance(width, (int, float)) and width > 0 else None
    h = int(height) if isinstance(height, (int, float)) and height > 0 else None
    return NormalizedAsset(
        asset_type=asset_type,
        url=url,
        provider="igdb",
        score=score,
        width=w,
        height=h,
    )


def transform_company(entry: dict[str, Any]) -> NormalizedCompany | None:
    """Transform an involved_companies entry into a NormalizedCompany."""
    company_raw = entry.get("company")
    if not isinstance(company_raw, dict):
        return None
    name = sanitize_text(str(company_raw.get("name") or ""))
    if not name:
        return None
    company_id = str(company_raw.get("id")) if company_raw.get("id") is not None else None
    role = "production"
    if entry.get("publisher") and not entry.get("developer"):
        role = "distributor"
    logo_raw = company_raw.get("logo")
    logo_url = (
        image_url(logo_raw.get("image_id"), "t_original") if isinstance(logo_raw, dict) else None
    )
    return NormalizedCompany(
        company_id=company_id,
        name=name,
        role=role,
        logo_url=logo_url,
    )


def transform_video(entry: dict[str, Any]) -> NormalizedVideo | None:
    """Transform an IGDB game_video entry into a NormalizedVideo."""
    video_id = sanitize_text(str(entry.get("video_id") or ""))
    if not video_id:
        return None
    name = sanitize_text(str(entry.get("name") or "")) or "Trailer"
    return NormalizedVideo(
        video_id=video_id,
        title=name,
        site="youtube",
        video_type="trailer",
    )


def transform_game(raw: dict[str, Any]) -> NormalizedMediaItem:
    """Transform a raw IGDB game payload dict into a NormalizedMediaItem."""
    igdb_id = str(raw.get("id") or "")
    external_ids: dict[str, str] = {}
    if igdb_id:
        external_ids["igdb"] = igdb_id

    # Map store UIDs from external_games
    for ext in raw.get("external_games") or []:
        if not isinstance(ext, dict):
            continue
        source = ext.get("external_game_source")
        uid = str(ext.get("uid") or "").strip()
        if not uid:
            continue
        if source == EXTERNAL_SOURCE_STEAM and "steam" not in external_ids:
            external_ids["steam"] = uid
        elif source == EXTERNAL_SOURCE_GOG and "gog" not in external_ids:
            external_ids["gog"] = uid
        elif source == EXTERNAL_SOURCE_EPIC and "epic" not in external_ids:
            external_ids["epic"] = uid

    title = sanitize_text(str(raw.get("name") or "")) or "Unknown Game"
    storyline = sanitize_text(str(raw.get("storyline") or ""))
    summary = sanitize_text(str(raw.get("summary") or ""))
    overview = storyline or summary

    release_date = _parse_release_date(raw.get("first_release_date"))

    status_raw = raw.get("status")
    status: str | None = None
    if isinstance(status_raw, int):
        status = IGDB_STATUS_MAP.get(status_raw, "released")
    elif isinstance(status_raw, str):
        status = sanitize_text(status_raw)

    # Extract genres
    genres_list: list[str] = []
    for g in raw.get("genres") or []:
        if isinstance(g, dict):
            g_name = sanitize_text(str(g.get("name") or ""))
            if g_name and g_name not in genres_list:
                genres_list.append(g_name)

    assets: list[NormalizedAsset] = []

    # Primary Cover
    primary_cover = raw.get("cover")
    p_url = cover_url(primary_cover, "t_original")
    primary_cover_id = primary_cover.get("image_id") if isinstance(primary_cover, dict) else None
    if p_url:
        assets.append(NormalizedAsset(asset_type="poster", url=p_url, provider="igdb", score=100))

    # Screenshots
    for i, sc in enumerate((raw.get("screenshots") or [])[:10]):
        if isinstance(sc, dict):
            asset = transform_asset(sc, "screenshot", score=max(10, 90 - i * 5))
            if asset:
                assets.append(asset)

    # Artworks
    logo_idx = icon_idx = poster_idx = backdrop_idx = 0
    for entry in (raw.get("artworks") or [])[:25]:
        if not isinstance(entry, dict):
            continue
        image_id = entry.get("image_id")
        url = image_url(image_id, "t_original")
        if not url:
            continue
        width = entry.get("width")
        height = entry.get("height")
        w = int(width) if isinstance(width, (int, float)) and width > 0 else None
        h = int(height) if isinstance(height, (int, float)) and height > 0 else None
        aspect = (w / h) if (w is not None and h is not None and h > 0) else None

        image_type = entry.get("image_type")
        artwork_type = entry.get("artwork_type")
        alpha = entry.get("alpha_channel")

        # 1. Logo
        is_logo = (
            image_type in LOGO_IMAGE_TYPES
            or artwork_type in LOGO_ARTWORK_TYPES
            or (
                image_type is None
                and artwork_type is None
                and alpha is True
                and aspect is not None
                and (aspect >= 1.5 or (h is not None and h <= 300))
            )
        )
        if is_logo:
            score = max(50, 90 - logo_idx * 5)
            logo_idx += 1
            assets.append(
                NormalizedAsset(
                    asset_type="logo", url=url, provider="igdb", score=score, width=w, height=h
                )
            )
            continue

        # 2. Icon
        is_icon = (
            image_type in ICON_IMAGE_TYPES
            or artwork_type in ICON_ARTWORK_TYPES
            or (
                image_type is None
                and artwork_type is None
                and alpha is True
                and aspect is not None
                and 0.7 <= aspect <= 1.35
                and (w is None or w <= 512)
            )
        )
        if is_icon:
            score = max(50, 90 - icon_idx * 5)
            icon_idx += 1
            assets.append(
                NormalizedAsset(
                    asset_type="icon", url=url, provider="igdb", score=score, width=w, height=h
                )
            )
            continue

        # 3. Alternative/Historical Covers
        is_cover = image_type in COVER_IMAGE_TYPES or (
            image_type is None
            and artwork_type is None
            and alpha is not True
            and aspect is not None
            and aspect < 1.0
        )
        if is_cover:
            score = max(40, 80 - poster_idx * 5)
            poster_idx += 1
            assets.append(
                NormalizedAsset(
                    asset_type="poster", url=url, provider="igdb", score=score, width=w, height=h
                )
            )
            continue

        # 4. Backdrop
        if alpha is True:
            continue
        if aspect is None or aspect < BACKDROP_MIN_ASPECT:
            continue

        score = max(40, 90 - backdrop_idx * 5)
        backdrop_idx += 1
        assets.append(
            NormalizedAsset(
                asset_type="backdrop", url=url, provider="igdb", score=score, width=w, height=h
            )
        )
        if image_type == 2:
            assets.append(
                NormalizedAsset(
                    asset_type="textless_backdrop",
                    url=url,
                    provider="igdb",
                    score=score,
                    width=w,
                    height=h,
                )
            )

    # Additional covers
    for i, c in enumerate((raw.get("all_covers") or [])[:15]):
        if isinstance(c, dict):
            c_image_id = c.get("image_id")
            if c_image_id and c_image_id != primary_cover_id:
                asset = transform_asset(c, "poster", score=max(40, 85 - i * 2))
                if asset:
                    assets.append(asset)

    # Involved Companies
    companies: list[NormalizedCompany] = []
    for comp_entry in raw.get("involved_companies") or []:
        if isinstance(comp_entry, dict):
            company = transform_company(comp_entry)
            if company and company not in companies:
                companies.append(company)

    # Ratings
    ratings: list[NormalizedRating] = []
    agg_rating = raw.get("aggregated_rating")
    if agg_rating is not None:
        votes = raw.get("aggregated_rating_count")
        ratings.append(
            NormalizedRating(
                provider="igdb",
                score=clamp_rating(float(agg_rating)),
                max_score=100.0,
                votes=int(votes) if isinstance(votes, (int, float)) else None,
                type="critic",
            )
        )
    comm_rating = raw.get("rating")
    if comm_rating is not None:
        votes = raw.get("rating_count")
        ratings.append(
            NormalizedRating(
                provider="igdb",
                score=clamp_rating(float(comm_rating)),
                max_score=100.0,
                votes=int(votes) if isinstance(votes, (int, float)) else None,
                type="audience",
            )
        )

    # Videos
    videos: list[NormalizedVideo] = []
    for vid_entry in (raw.get("videos") or [])[:10]:
        if isinstance(vid_entry, dict):
            video = transform_video(vid_entry)
            if video:
                videos.append(video)

    # Content Rating from age_rating_details
    content_rating: str | None = None
    for ard in raw.get("age_rating_details") or []:
        if isinstance(ard, dict):
            org = ard.get("organization")
            cat = ard.get("rating_category")
            if org in AGE_RATING_ORG_MAP and cat in AGE_RATING_LABEL_MAP:
                sys_name, _ = AGE_RATING_ORG_MAP[org]
                lbl = AGE_RATING_LABEL_MAP[cat]
                content_rating = f"{sys_name}: {lbl}"
                # Prefer ESRB or PEGI as primary rating if available
                if org in (1, 2):
                    break

    return NormalizedMediaItem(
        external_ids=external_ids,
        title=title,
        media_type="game",
        overview=overview,
        release_date=release_date,
        status=status,
        genres=tuple(genres_list),
        assets=tuple(assets),
        credits=(),
        companies=tuple(companies),
        ratings=tuple(ratings),
        videos=tuple(videos),
        seasons=(),
        content_rating=content_rating,
        payload_hash=compute_payload_hash(raw),
    )

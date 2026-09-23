"""Django model hydration and seeding for IGDB games."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from apps.company.models import Company, InvolvedCompany
from apps.media.models import (
    Character,
    ExternalID,
    Franchise,
    Game,
    GameMode,
    Genre,
    MediaAsset,
    MediaCharacter,
    MediaGameMode,
    MediaGenre,
    MediaItem,
    MediaPlatform,
    MediaRelease,
    MediaVideo,
    Platform,
)
from apps.media.services.catalog_lifecycle import finish_catalog_seed
from apps.media.services.catalog_link import attach_igdb_store_ids
from apps.media.services.completeness import recompute_completeness
from apps.media.services.identity import attach_external_id, find_media_id
from core.providers.framework import (
    atomic_seed,
    prefetch_external_ids,
    safe_bulk_create,
)
from core.providers.igdb.schemas import (
    AGE_RATING_LABEL_MAP,
    AGE_RATING_ORG_MAP,
    BACKDROP_MIN_ASPECT,
    COVER_IMAGE_TYPES,
    ICON_ARTWORK_TYPES,
    ICON_IMAGE_TYPES,
    IGDB_STATUS_MAP,
    LOGO_ARTWORK_TYPES,
    LOGO_IMAGE_TYPES,
    MULTIPLAYER_MODES,
    PLATFORM_NORMALIZATION,
    character_gender_label,
    character_mug_shot_url,
    character_species_label,
    cover_url,
    game_type_label,
    image_url,
)

_MEDIA_CT: ContentType | None = None
_CHARACTER_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _character_ct() -> ContentType:
    global _CHARACTER_CT
    if _CHARACTER_CT is None:
        _CHARACTER_CT = ContentType.objects.get_for_model(Character)
    return _CHARACTER_CT


def _ts_to_date(ts: Any) -> date | None:
    """IGDB first_release_date (Unix seconds) -> naive date."""
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=UTC).date()
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _game_slug(raw: dict[str, Any], title: str) -> str:
    """IGDB slug when present, else slugified title."""
    raw_slug = (raw.get("slug") or "").strip()
    base = raw_slug if raw_slug else slugify(title)
    return re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")[:200] or slugify("game")


def _upsert_poster_asset(media: MediaItem, url: str) -> None:
    """Store the IGDB cover as the best-scoring poster asset."""
    MediaAsset.objects.get_or_create(
        media_item=media,
        asset_type="poster",
        url=url,
        defaults={"label": "official", "provider": "igdb", "score": 100},
    )


def _upsert_game_image_assets(
    media: MediaItem,
    raw_entries: Any,
    *,
    asset_type: str,
    label: str,
    size: str = "t_original",
    min_aspect: float | None = None,
) -> None:
    """Store IGDB screenshots/images as MediaAsset rows."""
    if not isinstance(raw_entries, list):
        return
    for i, entry in enumerate(raw_entries[:10]):
        if not isinstance(entry, dict):
            continue
        width = entry.get("width")
        height = entry.get("height")
        w = int(width) if isinstance(width, int | float) and width > 0 else None
        h = int(height) if isinstance(height, int | float) and height > 0 else None
        if min_aspect is not None and (w is None or h is None or w / h < min_aspect):
            continue
        url = image_url(entry.get("image_id"), size)
        if not url:
            continue
        defaults: dict[str, Any] = {"label": label, "provider": "igdb", "score": 90 - i * 5}
        if w is not None and h is not None:
            defaults["width"] = w
            defaults["height"] = h
        MediaAsset.objects.get_or_create(
            media_item=media,
            asset_type=asset_type,
            url=url,
            defaults=defaults,
        )


def _upsert_game_artworks(media: MediaItem, raw_artworks: Any) -> None:
    """Classify and store IGDB artworks into logos, icons, posters, and backdrops."""
    if not isinstance(raw_artworks, list):
        return

    logo_idx = icon_idx = poster_idx = backdrop_idx = 0
    for entry in raw_artworks[:25]:
        if not isinstance(entry, dict):
            continue
        img_id = entry.get("image_id")
        url = image_url(img_id, "t_original")
        if not url:
            continue

        width = entry.get("width")
        height = entry.get("height")
        w = int(width) if isinstance(width, int | float) and width > 0 else None
        h = int(height) if isinstance(height, int | float) and height > 0 else None
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
            if image_type == 5:
                lbl = "white"
                score = 85
            elif image_type == 6:
                lbl = "black"
                score = 80
            elif image_type == 14:
                lbl = "historical"
                score = 75
            else:
                lbl = "official"
                score = max(50, 90 - logo_idx * 5)
            logo_idx += 1
            defaults = {"label": lbl, "provider": "igdb", "score": score}
            if w is not None and h is not None:
                defaults["width"] = w
                defaults["height"] = h
            MediaAsset.objects.get_or_create(
                media_item=media,
                asset_type="logo",
                url=url,
                defaults=defaults,
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
            lbl = "historical" if image_type == 15 else "icon"
            score = max(50, 90 - icon_idx * 5)
            icon_idx += 1
            defaults = {"label": lbl, "provider": "igdb", "score": score}
            if w is not None and h is not None:
                defaults["width"] = w
                defaults["height"] = h
            MediaAsset.objects.get_or_create(
                media_item=media,
                asset_type="icon",
                url=url,
                defaults=defaults,
            )
            continue

        # 3. Covers
        is_cover = image_type in COVER_IMAGE_TYPES or (
            image_type is None
            and artwork_type is None
            and alpha is not True
            and aspect is not None
            and aspect < 1.0
        )
        if is_cover:
            if image_type == 9:
                lbl = "historical"
                score = 70
            elif image_type == 10:
                lbl = "alternative"
                score = 80
            elif image_type == 11:
                lbl = "square"
                score = 75
            else:
                lbl = "alternative"
                score = max(40, 80 - poster_idx * 5)
            poster_idx += 1
            defaults = {"label": lbl, "provider": "igdb", "score": score}
            if w is not None and h is not None:
                defaults["width"] = w
                defaults["height"] = h
            MediaAsset.objects.get_or_create(
                media_item=media,
                asset_type="poster",
                url=url,
                defaults=defaults,
            )
            continue

        # 4. Backdrop
        if alpha is True:
            continue
        if aspect is None or aspect < BACKDROP_MIN_ASPECT:
            continue

        if image_type == 2:
            lbl = "textless"
        elif image_type == 3:
            lbl = "artwork"
        elif image_type == 4:
            lbl = "concept_art"
        else:
            lbl = "clean"
        score = max(40, 90 - backdrop_idx * 5)
        backdrop_idx += 1
        defaults = {"label": lbl, "provider": "igdb", "score": score}
        if w is not None and h is not None:
            defaults["width"] = w
            defaults["height"] = h

        MediaAsset.objects.get_or_create(
            media_item=media,
            asset_type="backdrop",
            url=url,
            defaults=defaults,
        )
        if image_type == 2:
            MediaAsset.objects.get_or_create(
                media_item=media,
                asset_type="textless_backdrop",
                url=url,
                defaults={**defaults, "label": "textless"},
            )


def _upsert_game_additional_covers(
    media: MediaItem, raw_covers: Any, primary_cover_id: Any
) -> None:
    """Store alternative/historical covers from IGDB /covers as MediaAsset poster rows."""
    if not isinstance(raw_covers, list):
        return
    idx = 0
    for entry in raw_covers[:15]:
        if not isinstance(entry, dict):
            continue
        img_id = entry.get("image_id")
        if not img_id or img_id == primary_cover_id:
            continue
        url = image_url(img_id, "t_original")
        if not url:
            continue
        width = entry.get("width")
        height = entry.get("height")
        w = int(width) if isinstance(width, int | float) and width > 0 else None
        h = int(height) if isinstance(height, int | float) and height > 0 else None
        image_type = entry.get("image_type")
        if image_type == 9:
            lbl = "historical"
            score = 70
        elif image_type == 10:
            lbl = "alternative"
            score = 80
        elif image_type == 11:
            lbl = "square"
            score = 75
        else:
            lbl = "alternative"
            score = max(40, 85 - idx * 2)
        idx += 1
        defaults = {"label": lbl, "provider": "igdb", "score": score}
        if w is not None and h is not None:
            defaults["width"] = w
            defaults["height"] = h
        MediaAsset.objects.get_or_create(
            media_item=media,
            asset_type="poster",
            url=url,
            defaults=defaults,
        )


def _upsert_game_videos(media: MediaItem, raw_videos: Any) -> None:
    """Store IGDB game_videos as MediaVideo rows."""
    if not isinstance(raw_videos, list):
        return
    for entry in raw_videos[:10]:
        if not isinstance(entry, dict):
            continue
        video_id = str(entry.get("video_id") or "").strip()
        if not video_id:
            continue
        MediaVideo.objects.get_or_create(
            media_item=media,
            provider="igdb",
            provider_id=video_id,
            defaults={
                "video_type": "game_video",
                "url": f"https://www.youtube.com/watch?v={video_id}",
            },
        )


def _upsert_game_age_ratings(media: MediaItem, raw_ratings: Any) -> None:
    """Store IGDB /age_ratings entries into MediaRelease certification rows."""
    if not isinstance(raw_ratings, list):
        return
    for entry in raw_ratings:
        if not isinstance(entry, dict):
            continue
        org = entry.get("organization")
        cat = entry.get("rating_category")
        if org not in AGE_RATING_ORG_MAP or cat not in AGE_RATING_LABEL_MAP:
            continue
        system, country_code = AGE_RATING_ORG_MAP[org]
        label = AGE_RATING_LABEL_MAP[cat]
        MediaRelease.objects.get_or_create(
            media_item=media,
            country_code=country_code,
            release_date=None,
            certification=f"{system}: {label}",
        )


def _upsert_game_characters(media: MediaItem, raw_characters: Any) -> None:
    """Store IGDB characters and link them to the media item (add-only, idempotent)."""
    if not isinstance(raw_characters, list) or not raw_characters:
        return

    char_ct = _character_ct()
    existing_char_ids = set(
        MediaCharacter.objects.filter(media_item=media).values_list("character_id", flat=True)
    )

    for order, entry in enumerate(raw_characters):
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue

        raw_id = entry.get("id")
        igdb_char_id = str(raw_id) if raw_id is not None else None
        slug = str(entry.get("slug") or "").strip() or slugify(name)
        description = entry.get("description")
        gender = character_gender_label(entry.get("gender"))
        species = character_species_label(entry.get("species"))
        mug_shot = character_mug_shot_url(entry.get("mug_shot"))

        character = None
        if igdb_char_id:
            ext = ExternalID.objects.filter(
                content_type=char_ct, provider="igdb", external_id=igdb_char_id
            ).first()
            if ext:
                character = Character.objects.filter(pk=ext.object_id).first()

        if character is None:
            from apps.media.services.character_enrichment import (
                get_or_create_character_for_media,
            )

            defaults = {
                "description": description or None,
                "gender": gender,
                "species": species,
                "mug_shot_url": mug_shot,
            }
            character, created = get_or_create_character_for_media(
                media, name, slug=slug, defaults=defaults
            )
            if not created:
                updates = []
                if not character.description and description:
                    character.description = description
                    updates.append("description")
                if not character.gender and gender:
                    character.gender = gender
                    updates.append("gender")
                if not character.species and species:
                    character.species = species
                    updates.append("species")
                if not character.mug_shot_url and mug_shot:
                    character.mug_shot_url = mug_shot
                    updates.append("mug_shot_url")
                if updates:
                    character.save(update_fields=updates)

            if igdb_char_id:
                ExternalID.objects.get_or_create(
                    content_type=char_ct,
                    object_id=character.pk,
                    provider="igdb",
                    external_id=igdb_char_id,
                )

        if character.pk not in existing_char_ids:
            MediaCharacter.objects.create(
                media_item=media,
                character=character,
                order=order,
            )
            existing_char_ids.add(character.pk)


def _upsert_game_genres(media: MediaItem, raw_genres: Any) -> None:
    """Link IGDB genres as genre links using safe_bulk_create."""
    if not isinstance(raw_genres, list):
        return
    existing = set(MediaGenre.objects.filter(media_item=media).values_list("genre_id", flat=True))
    to_create: list[MediaGenre] = []
    for entry in raw_genres:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        genre, _ = Genre.objects.get_or_create(name=name, defaults={"slug": slugify(name)})
        if genre.pk in existing:
            continue
        existing.add(genre.pk)
        to_create.append(MediaGenre(media_item=media, genre=genre))
    if to_create:
        safe_bulk_create(MediaGenre, to_create, ignore_conflicts=True)


def _upsert_game_platforms(media: MediaItem, raw_platforms: Any) -> None:
    """Link IGDB platforms as platform links using safe_bulk_create."""
    if not isinstance(raw_platforms, list):
        return
    existing = set(
        MediaPlatform.objects.filter(media_item=media).values_list("platform_id", flat=True)
    )
    to_create: list[MediaPlatform] = []
    for entry in raw_platforms:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        slug = PLATFORM_NORMALIZATION.get(name) or slugify(name)
        platform, _ = Platform.objects.get_or_create(slug=slug, defaults={"name": name})
        if platform.pk in existing:
            continue
        existing.add(platform.pk)
        to_create.append(MediaPlatform(media_item=media, platform=platform))
    if to_create:
        safe_bulk_create(MediaPlatform, to_create, ignore_conflicts=True)


def _upsert_game_modes(media: MediaItem, game: Game, raw_modes: Any) -> None:
    """Link IGDB game_modes and set multiplayer flag when applicable."""
    if not isinstance(raw_modes, list):
        return
    existing = set(
        MediaGameMode.objects.filter(media_item=media).values_list("game_mode_id", flat=True)
    )
    multiplayer = False
    to_create: list[MediaGameMode] = []
    for entry in raw_modes:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        if name.lower() in MULTIPLAYER_MODES:
            multiplayer = True
        mode, _ = GameMode.objects.get_or_create(slug=slugify(name), defaults={"name": name})
        if mode.pk in existing:
            continue
        existing.add(mode.pk)
        to_create.append(MediaGameMode(media_item=media, game_mode=mode))
    if to_create:
        safe_bulk_create(MediaGameMode, to_create, ignore_conflicts=True)
    if multiplayer and not game.has_multiplayer:
        game.has_multiplayer = True
        game.save(update_fields=("has_multiplayer",))


def _upsert_game_companies(media: MediaItem, raw_involved: Any) -> None:
    """Link IGDB involved_companies as role-flagged involved companies."""
    if not isinstance(raw_involved, list):
        return
    role_flags = ("developer", "publisher", "porting", "supporting")
    for entry in raw_involved:
        if not isinstance(entry, dict):
            continue
        company_raw = entry.get("company")
        if not isinstance(company_raw, dict):
            continue
        name = str(company_raw.get("name") or "").strip()
        if not name:
            continue
        flags = {flag: bool(entry.get(flag)) for flag in role_flags}
        if not any(flags.values()):
            continue
        raw_slug = str(company_raw.get("slug") or "").strip()
        slug = raw_slug or name.lower().replace(" ", "-").replace("'", "")
        company, _ = Company.objects.get_or_create(slug=slug, defaults={"name": name})
        row, _ = InvolvedCompany.objects.get_or_create(
            media_item=media, company=company, defaults=flags
        )
        changed = [flag for flag in role_flags if flags[flag] and not getattr(row, flag)]
        if changed:
            for flag in changed:
                setattr(row, flag, True)
            row.save(update_fields=(*changed,))


def _apply_game_growth(game: Game, raw: dict[str, Any]) -> None:
    """Update Game subtype growth fields."""
    updates: dict[str, Any] = {}
    status = raw.get("status")
    if isinstance(status, int):
        label = IGDB_STATUS_MAP.get(status)
        if label and game.release_status != label:
            updates["release_status"] = label
    label = game_type_label(raw)
    if label is not None and game.game_type != label:
        updates["game_type"] = label
    parent = raw.get("parent_game")
    if isinstance(parent, dict):
        parent_title = str(parent.get("name") or "").strip()
        if parent_title and game.parent_game_title != parent_title:
            updates["parent_game_title"] = parent_title
    website = _official_website(raw.get("websites"))
    if website and game.website != website:
        updates["website"] = website
    franchise_raw = raw.get("franchise")
    if (
        isinstance(franchise_raw, dict)
        and str(franchise_raw.get("name") or "").strip()
        and game.franchise_id is None
    ):
        franchise_name = str(franchise_raw["name"]).strip()
        franchise, _ = Franchise.objects.get_or_create(
            name=franchise_name, defaults={"slug": slugify(franchise_name)}
        )
        updates["franchise"] = franchise
    if updates:
        for field, value in updates.items():
            setattr(game, field, value)
        game.save(update_fields=(*updates.keys(),))


def _official_website(websites: Any) -> str | None:
    """Extract official website URL from IGDB websites."""
    if not isinstance(websites, list):
        return None
    urls = [w.get("url") for w in websites if isinstance(w, dict) and w.get("url")]
    if not urls:
        return None
    for w in websites:
        if isinstance(w, dict) and w.get("type") == 1 and w.get("url"):
            return w["url"]
    return urls[0]


def _top_up_media_popularity(media: MediaItem, raw: dict[str, Any]) -> None:
    """Populate media popularity proxy from IGDB rating if missing."""
    if media.popularity:
        return
    proxy = raw.get("aggregated_rating")
    if proxy is None:
        proxy = raw.get("rating")
    if not proxy:
        return
    media.popularity = float(proxy)
    media.save(update_fields=("popularity", "updated_at"))


def top_up_game_ratings(media: MediaItem, raw: dict[str, Any]) -> None:
    """Fill media avg_rating and rating_count from IGDB if unpopulated."""
    updates: list[str] = []
    if media.avg_rating is None:
        rating = raw.get("aggregated_rating")
        if rating is None:
            rating = raw.get("rating")
        if rating:
            media.avg_rating = float(rating)
            updates.append("avg_rating")
    if not media.rating_count:
        count = raw.get("aggregated_rating_count")
        if count is None:
            count = raw.get("rating_count")
        if count:
            media.rating_count = int(count)
            updates.append("rating_count")
    if updates:
        media.save(update_fields=(*updates, "updated_at"))


def _hydrate_game(media: MediaItem, game: Game, raw: dict[str, Any]) -> None:
    """Hydrate all related entities for a game row."""
    _upsert_game_genres(media, raw.get("genres"))
    _upsert_game_platforms(media, raw.get("platforms"))
    _upsert_game_modes(media, game, raw.get("game_modes"))
    _upsert_game_companies(media, raw.get("involved_companies"))
    _upsert_game_image_assets(
        media,
        raw.get("screenshots"),
        asset_type="screenshot",
        label="screenshot",
        size="t_original",
    )
    _upsert_game_artworks(media, raw.get("artworks"))
    primary_cover = raw.get("cover")
    primary_cover_id = primary_cover.get("image_id") if isinstance(primary_cover, dict) else None
    _upsert_game_additional_covers(media, raw.get("all_covers"), primary_cover_id)
    _upsert_game_videos(media, raw.get("videos"))
    _upsert_game_age_ratings(media, raw.get("age_rating_details"))
    _upsert_game_characters(media, raw.get("characters"))
    _apply_game_growth(game, raw)
    recompute_completeness(media)


@atomic_seed
def seed_game_from_igdb(raw: dict[str, Any], igdb_id: int) -> int:
    """Map an IGDB game payload onto MediaItem + Game, hydrate related rows, and return media PK."""
    igdb_id_str = str(igdb_id)

    # Fast prefetch external id check via framework
    external_map = prefetch_external_ids("igdb", [igdb_id_str], MediaItem)
    existing_id = external_map.get(igdb_id_str)
    if existing_id is None:
        existing_id = find_media_id("igdb", igdb_id_str, "game")

    media = MediaItem.objects.filter(pk=existing_id).first() if existing_id else None

    if media is None:
        title = (raw.get("name") or "Unknown Game").strip() or "Unknown Game"
        overview = raw.get("storyline") or raw.get("summary")
        poster_url = cover_url(raw.get("cover"))
        slug = _game_slug(raw, title)
        release_date = _ts_to_date(raw.get("first_release_date"))
        media = MediaItem.objects.create(
            media_type="game",
            title=title,
            slug=slug,
            overview=overview,
            release_date=release_date,
            completeness_score=0.15,
        )
        media_id = attach_external_id(media.pk, "igdb", igdb_id_str, "game")
        if media_id != media.pk:
            media = MediaItem.objects.get(pk=media_id)
        else:
            if poster_url:
                _upsert_poster_asset(media, poster_url)
    else:
        media_id = media.pk
        poster_url = cover_url(raw.get("cover"))
        if poster_url:
            _upsert_poster_asset(media, poster_url)

    game, _ = Game.objects.get_or_create(media_item_id=media.pk)
    _hydrate_game(media, game, raw)
    _top_up_media_popularity(media, raw)
    top_up_game_ratings(media, raw)
    attach_igdb_store_ids(media.pk, raw)
    finish_catalog_seed(media, raw, provider="igdb", external_id=str(igdb_id), hash_matched=False)
    return media.pk

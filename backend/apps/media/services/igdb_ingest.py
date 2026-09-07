"""IGDB game ingest — seed + fully hydrate catalog game rows from IGDB JSON.

The first consumer of the ported async IGDB client (``core.providers.igdb``,
increment 37). Mirrors the sync posture ``GameMatcher._seed_game_from_igdb``
established in increment 26: an IGDB game lookup maps onto the Django MTI graph
(``MediaItem`` hub with ``media_type="game"`` + ``Game`` subtype) plus a
``provider="igdb"`` ``ExternalID`` row and the cover as the top poster
``MediaAsset``. Since increment 50 the seed also folds in the game full-hydration
pass (genres/platforms/game-modes/involved companies + Game growth fields), so a
newly seeded (or re-synced) row is complete rather than the minimal posture the
increment-45 seed left for a later pass — SteamGrid artwork is attached by its
own engine (increment 46), and since increment 55 the fold also stores the game's
screenshots/artworks (MediaAsset rows), videos (MediaVideo) and age ratings
(MediaRelease certification rows; the ``age_ratings`` id list the games endpoint
returns is resolved to org/label rows through a separate IGDB ``/age_ratings``
fetch in the async driver).

Resolution is by the igdb ``ExternalID`` first; a same-slug ``game`` catalog
title is the cross-provider fallback (Steam/other seeds write an igdb id too, so
a title seeded via a different provider is refreshed rather than duplicated) —
the same semantics the GameMatcher seeder uses, so both idempotently agree.
Unlike the increment-45 early return, a mapped re-seed now falls through to the
idempotent hydration so the drain can grow previously-minimal rows. The async
fetch driver returns a bare media id; raised provider errors (or an id IGDB has
no game for) bubble to the caller (a sync engine), which turns them into an
``error`` terminal frame.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from django.utils.text import slugify

from apps.company.models import Company, InvolvedCompany
from apps.media.models import (
    ExternalID,
    Franchise,
    Game,
    GameMode,
    Genre,
    MediaAsset,
    MediaGameMode,
    MediaGenre,
    MediaItem,
    MediaPlatform,
    MediaRelease,
    MediaVideo,
    Platform,
)
from apps.media.services.completeness import recompute_completeness
from apps.media.services.igdb import _PLATFORM_NORMALIZATION, cover_url

if TYPE_CHECKING:
    from core.providers.igdb import IGDBProvider

# Field set the seed consumes — the minimal posture fields plus the hydration
# vocabulary/subtype fields the increment-50 pass maps (game modes carry the
# multiplayer flag; the official website lands on Game.website). Since increment
# 55 the set also embeds the screenshot/artwork/video image-ids the asset + video
# hydrators map; ``age_ratings`` returns as an id list the async driver resolves
# through a separate IGDB fetch before seeding.
GAME_HYDRATION_FIELDS = (
    "id,name,slug,cover.image_id,first_release_date,storyline,summary,"
    "status,game_type,franchise.name,parent_game.name,"
    "websites.url,websites.type,"
    "platforms.name,genres.name,game_modes.name,"
    "screenshots.image_id,artworks.image_id,"
    "videos.video_id,videos.name,age_ratings,"
    "involved_companies.developer,involved_companies.publisher,"
    "involved_companies.porting,involved_companies.supporting,"
    "involved_companies.company.name,involved_companies.company.slug,"
    "aggregated_rating,rating,"
    "external_games.external_game_source,external_games.uid"
)

# IGDB game ``status`` categories (returned as an int) -> the release_status text.
_IGDB_STATUS = {
    0: "released",
    2: "alpha",
    3: "beta",
    4: "early_access",
    5: "offline",
    6: "cancelled",
    7: "rumored",
    8: "delisted",
}

# IGDB game_mode names that imply other players (anything else is single-player).
_MULTIPLAYER_MODES = {
    "multiplayer",
    "co-operative",
    "online co-op",
    "split screen",
    "massively multiplayer",
    "battle royale",
}

# IGDB age-rating ``organization`` values -> (system label, ISO country code).
_AGE_RATING_ORG_MAP: dict[int, tuple[str, str]] = {
    1: ("ESRB", "US"),
    2: ("PEGI", "GB"),
    3: ("CERO", "JP"),
    4: ("USK", "DE"),
    5: ("GRAC", "KR"),
    6: ("ClassInd", "BR"),
    7: ("ACB", "AU"),
}

# IGDB age-rating ``rating_category`` values -> the per-org rating label.
_AGE_RATING_LABEL_MAP: dict[int, str] = {
    # ESRB (org=1)
    1: "RP", 2: "EC", 3: "E", 4: "E10+", 5: "T", 6: "M", 7: "AO",
    # PEGI (org=2)
    8: "3", 9: "7", 10: "12", 11: "16", 12: "18",
    # CERO (org=3)
    13: "A", 14: "B", 15: "C", 16: "D", 17: "Z",
    # USK (org=4)
    18: "0", 19: "6", 20: "12", 21: "16", 22: "18",
    # GRAC (org=5)
    23: "ALL", 24: "12+", 25: "15+", 26: "18+",
    # ClassInd (org=6)
    27: "ER", 28: "L", 29: "10", 30: "12", 31: "14", 32: "16", 33: "18",
    # ACB (org=7)
    34: "G", 35: "PG", 36: "M", 37: "MA15+", 38: "R18+",
}

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _ts_to_date(ts: Any) -> date | None:
    """IGDB ``first_release_date`` (unix seconds) -> a naive date."""
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=UTC).date()
    except (TypeError, ValueError, OverflowError):
        return None


def _game_slug(raw: dict[str, Any], title: str) -> str:
    """IGDB slug when present, else a sanitized slugify of the title."""
    raw_slug = (raw.get("slug") or "").strip()
    base = raw_slug if raw_slug else slugify(title)
    return re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")[:200] or slugify("game")


def _upsert_external(object_id: int, igdb_id: str) -> None:
    """Create-or-update the media's igdb ``ExternalID`` row."""
    row, created = ExternalID.objects.get_or_create(
        content_type=_media_ct(),
        provider="igdb",
        external_id=igdb_id,
        media_type="game",
        defaults={"object_id": object_id},
    )
    if not created and row.object_id != object_id:
        row.object_id = object_id
        row.save(update_fields=("object_id", "updated_at"))


def _upsert_poster_asset(media: MediaItem, url: str) -> None:
    """Store the IGDB cover as the best-scoring poster asset for ``media``."""
    MediaAsset.objects.get_or_create(
        media_item=media,
        asset_type="poster",
        url=url,
        defaults={"label": "official", "provider": "igdb", "score": 100},
    )


def _image_url(image_id: Any, size: str) -> str | None:
    """Build an IGDB image-CDN URL for a screenshot/artwork ``image_id``."""
    if not isinstance(image_id, str) or not image_id:
        return None
    return f"https://images.igdb.com/igdb/image/upload/{size}/{image_id}.jpg"


def _upsert_game_image_assets(
    media: MediaItem, raw_entries: Any, *, asset_type: str, label: str, size: str
) -> None:
    """Store IGDB screenshots/artworks as MediaAsset rows (add-only)."""
    if not isinstance(raw_entries, list):
        return
    for i, entry in enumerate(raw_entries[:10]):
        if not isinstance(entry, dict):
            continue
        url = _image_url(entry.get("image_id"), size)
        if not url:
            continue
        MediaAsset.objects.get_or_create(
            media_item=media,
            asset_type=asset_type,
            url=url,
            defaults={"label": label, "provider": "igdb", "score": 90 - i * 5},
        )


def _upsert_game_videos(media: MediaItem, raw_videos: Any) -> None:
    """Store IGDB ``game_videos`` as MediaVideo rows (add-only)."""
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
    """Fold IGDB ``/age_ratings`` entries into MediaRelease certification rows.

    The games endpoint returns ``age_ratings`` as an id list, so the async driver
    resolves the ids through ``get_age_ratings`` and attaches the rows as
    ``raw["age_rating_details"]`` — each an ``{"organization", "rating_category"}``
    dict. Organizations/categories outside the maps are skipped (add-only).
    """
    if not isinstance(raw_ratings, list):
        return
    for entry in raw_ratings:
        if not isinstance(entry, dict):
            continue
        org = entry.get("organization")
        cat = entry.get("rating_category")
        if org not in _AGE_RATING_ORG_MAP or cat not in _AGE_RATING_LABEL_MAP:
            continue
        system, country_code = _AGE_RATING_ORG_MAP[org]
        label = _AGE_RATING_LABEL_MAP[cat]
        MediaRelease.objects.get_or_create(
            media_item=media,
            country_code=country_code,
            release_date=None,
            certification=f"{system}: {label}",
        )


def seed_game_from_igdb(raw: dict[str, Any], igdb_id: int) -> int:
    """Map an IGDB game lookup onto a MediaItem + Game, hydrate it; return its pk.

    Idempotent: an igdb ``ExternalID`` resolves to its media row (a mapped
    re-seed is a refresh that grows a previously-minimal row); otherwise a
    same-slug ``game`` title is reused (cross-provider dedup, mirroring the
    GameMatcher); otherwise a fresh hub + subtype row is created. Every path then
    runs the add-only full-hydration pass (``_hydrate_game``), so repeated seeds
    never duplicate vocab/company links and missing subtype fields are topped up.
    """
    igdb_id_str = str(igdb_id)
    existing = ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="igdb",
        external_id=igdb_id_str,
        media_type="game",
    ).first()
    media = None
    if existing is not None and existing.object_id:
        media = MediaItem.objects.filter(pk=existing.object_id).first()

    if media is None:
        title = (raw.get("name") or "Unknown Game").strip() or "Unknown Game"
        overview = raw.get("storyline") or raw.get("summary")
        poster_url = cover_url(raw.get("cover"))
        slug = _game_slug(raw, title)
        release_date = _ts_to_date(raw.get("first_release_date"))
        media = MediaItem.objects.filter(media_type="game", slug=slug).first()
        if media is None:
            media = MediaItem.objects.create(
                media_type="game",
                title=title,
                slug=slug,
                overview=overview,
                release_date=release_date,
                completeness_score=0.15,
                next_sync_at=timezone.now(),
            )
        elif media.overview is None and overview:
            media.overview = overview
            media.save(update_fields=("overview", "updated_at"))
        if poster_url:
            _upsert_poster_asset(media, poster_url)
        _upsert_external(media.pk, igdb_id_str)

    game, _ = Game.objects.get_or_create(media_item_id=media.pk)
    _hydrate_game(media, game, raw)
    _top_up_media_popularity(media, raw)
    recompute_completeness(media)
    return media.pk


def _top_up_media_popularity(media: MediaItem, raw: dict[str, Any]) -> None:
    """Fold an IGDB popularity proxy onto a game hub row that has none yet.

    IGDB carries no ``popularity``; the discover rail's ``popular`` list sorts the
    catalog by ``MediaItem.popularity``. The closest IGDB scalar is its own
    ``aggregated_rating`` — the exact field the IGDB popular discovery source
    sorts by — so a row still at the 0.0 default (fresh seed, or a pre-fix
    minimal row) is topped up from it (falling back to the community ``rating``).
    An already-populated row is left alone so a later source (e.g. Steam play
    time) can own the field without a re-seed clobbering it.
    """
    if media.popularity:
        return
    proxy = raw.get("aggregated_rating")
    if proxy is None:
        proxy = raw.get("rating")
    if not proxy:
        return
    media.popularity = float(proxy)
    media.save(update_fields=("popularity", "updated_at"))


def _steam_app_id(raw: dict[str, Any]) -> int | None:
    """Pull the game's Steam app id out of IGDB ``external_games``.

    IGDB ``external_games.external_game_source`` category 1 is Steam; each entry
    carries the store ``uid``. Returns the first numeric Steam id, else ``None``
    (console exclusives, store-less titles).
    """
    for entry in raw.get("external_games") or []:
        if not isinstance(entry, dict):
            continue
        if entry.get("external_game_source") != 1:
            continue
        uid = str(entry.get("uid") or "").strip()
        if uid.isdigit():
            return int(uid)
    return None


async def _steamgrid_enrich_after_seed(media_id: int, steam_app_id: int | None) -> None:
    """Best-effort SteamGridDB logo/icon attach on a freshly-seeded game row.

    Gated on the SteamGridDB key being configured (the common case is unset, so
    this returns before any client build); attach is a benign no-op for a game
    SteamGridDB has no entry for. Errors are swallowed — artwork enrichment never
    fails the seed that produced the row.
    """
    if not settings.STEAMGRID_API_KEY:
        return
    try:
        from apps.media.services.steamgrid_artwork import fetch_and_attach_game_logos

        await fetch_and_attach_game_logos(media_id, steam_app_id)
    except Exception:
        pass


def _hydrate_game(media: MediaItem, game: Game, raw: dict[str, Any]) -> None:
    """Fold the IGDB full-hydration pass onto an existing media + game row.

    Add-only + idempotent (the increment-50 mirror of the MBZ album tail): each
    vocab/company link is skipped when already present, so a mapped re-seed grows
    a previously-minimal row without duplicating. Since increment 55 the fold also
    stores the game's screenshot/artwork assets, videos and age-rating releases.
    """
    _upsert_game_genres(media, raw.get("genres"))
    _upsert_game_platforms(media, raw.get("platforms"))
    _upsert_game_modes(media, game, raw.get("game_modes"))
    _upsert_game_companies(media, raw.get("involved_companies"))
    _upsert_game_image_assets(
        media,
        raw.get("screenshots"),
        asset_type="screenshot",
        label="screenshot",
        size="t_screenshot_big",
    )
    _upsert_game_image_assets(
        media,
        raw.get("artworks"),
        asset_type="backdrop",
        label="clean",
        size="t_1080p",
    )
    _upsert_game_videos(media, raw.get("videos"))
    _upsert_game_age_ratings(media, raw.get("age_rating_details"))
    _apply_game_growth(game, raw)


def _upsert_game_genres(media: MediaItem, raw_genres: Any) -> None:
    """Link IGDB ``genres`` as genre links (add-only)."""
    if not isinstance(raw_genres, list):
        return
    existing = set(
        MediaGenre.objects.filter(media_item=media).values_list("genre_id", flat=True)
    )
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
        MediaGenre.objects.create(media_item=media, genre=genre)


def _upsert_game_platforms(media: MediaItem, raw_platforms: Any) -> None:
    """Link IGDB ``platforms`` as platform links (add-only)."""
    if not isinstance(raw_platforms, list):
        return
    existing = set(
        MediaPlatform.objects.filter(media_item=media).values_list("platform_id", flat=True)
    )
    for entry in raw_platforms:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        slug = _PLATFORM_NORMALIZATION.get(name) or slugify(name)
        platform, _ = Platform.objects.get_or_create(slug=slug, defaults={"name": name})
        if platform.pk in existing:
            continue
        existing.add(platform.pk)
        MediaPlatform.objects.create(media_item=media, platform=platform)


def _upsert_game_modes(media: MediaItem, game: Game, raw_modes: Any) -> None:
    """Link IGDB ``game_modes`` and flag the game multiplayer when any imply it."""
    if not isinstance(raw_modes, list):
        return
    existing = set(
        MediaGameMode.objects.filter(media_item=media).values_list("game_mode_id", flat=True)
    )
    multiplayer = False
    for entry in raw_modes:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        if name.lower() in _MULTIPLAYER_MODES:
            multiplayer = True
        mode, _ = GameMode.objects.get_or_create(slug=slugify(name), defaults={"name": name})
        if mode.pk in existing:
            continue
        existing.add(mode.pk)
        MediaGameMode.objects.create(media_item=media, game_mode=mode)
    if multiplayer and not game.has_multiplayer:
        game.has_multiplayer = True
        game.save(update_fields=("has_multiplayer",))


def _upsert_game_companies(media: MediaItem, raw_involved: Any) -> None:
    """Link IGDB ``involved_companies`` as role-flagged involved companies."""
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
    """Top up the Game subtype's growth fields from the hydration payload."""
    updates: dict[str, Any] = {}
    status = raw.get("status")
    if isinstance(status, int):
        label = _IGDB_STATUS.get(status)
        if label and game.release_status != label:
            updates["release_status"] = label
    game_type = raw.get("game_type")
    if isinstance(game_type, str) and game_type.strip() and game.game_type != game_type.strip():
        updates["game_type"] = game_type.strip()
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
    """The official website URL from IGDB ``websites`` (fallback: the first url)."""
    if not isinstance(websites, list):
        return None
    urls = [w.get("url") for w in websites if isinstance(w, dict) and w.get("url")]
    if not urls:
        return None
    for w in websites:
        if isinstance(w, dict) and w.get("type") == 1 and w.get("url"):
            return w["url"]
    return urls[0]


async def fetch_and_seed_game(
    igdb_id: int, *, provider: IGDBProvider | None = None
) -> int:
    """Fetch an IGDB game through the async client, then seed it."""
    if provider is None:
        from core.providers.igdb import IGDBProvider  # local: avoid eager client build

        provider = IGDBProvider()
    raw = await provider.get_game(igdb_id, GAME_HYDRATION_FIELDS)
    if not raw:
        raise ValueError(f"IGDB returned no game for id {igdb_id}")
    # ``age_ratings`` comes back as an id list; resolve the org/label rows through
    # a separate /age_ratings fetch (best-effort: a sub-fetch failure shouldn't
    # abort an otherwise successful seed, mirroring the legacy hydrator).
    if isinstance(raw.get("age_ratings"), list) and raw["age_ratings"]:
        try:
            details = await provider.get_age_ratings(
                [int(r) for r in raw["age_ratings"] if r is not None]
            )
            if details:
                raw["age_rating_details"] = details
        except Exception:
            pass
    media_id = await sync_to_async(seed_game_from_igdb)(raw, igdb_id)
    await _steamgrid_enrich_after_seed(media_id, _steam_app_id(raw))
    return media_id

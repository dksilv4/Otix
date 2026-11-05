"""Script to restore and backfill media assets, subtypes, and external IDs.

Restores artwork and metadata from:
1. sample_data/ provider mock payloads (TMDB popular/trending/top_rated/upcoming, IGDB games, Fanart logos)
2. user_plex_items records (6,300+ library items with thumbnails, backdrops, logos, and external IDs)
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

# Setup Django
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
REPO_ROOT = BASE_DIR.parent
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django

django.setup()

from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify
from apps.media.models import (
    MediaItem,
    MediaAsset,
    Movie,
    Show,
    Season,
    Episode,
    Game,
    ExternalID,
)
from apps.integrations.models import UserPlexItem, UserPlexServer
from apps.integrations.services.plex import hydrate_show_seasons_from_plex

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500"
TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/original"
IGDB_COVER_BASE = "https://images.igdb.com/igdb/image/upload/t_cover_big"
IGDB_ARTWORK_BASE = "https://images.igdb.com/igdb/image/upload/t_1080p"


def upsert_asset(media_item: MediaItem, asset_type: str, url: str, score: int = 100, provider: str = "tmdb") -> bool:
    if not url or not url.strip():
        return False
    url = url.strip()
    try:
        asset, created = MediaAsset.objects.get_or_create(
            media_item=media_item,
            url=url,
            asset_type=asset_type,
            defaults={"label": "official", "provider": provider, "score": score},
        )
        return created
    except Exception:
        return False


def upsert_external_id(media_item: MediaItem, provider: str, external_id: str, media_type: str | None = None) -> bool:
    if not external_id or not str(external_id).strip():
        return False
    ext_str = str(external_id).strip()
    ct = ContentType.objects.get_for_model(MediaItem)
    mtype = media_type or media_item.media_type
    ext = ExternalID.objects.filter(
        content_type=ct,
        provider=provider,
        external_id=ext_str,
        media_type=mtype,
    ).first()
    if not ext:
        try:
            ExternalID.objects.create(
                content_type=ct,
                object_id=media_item.id,
                provider=provider,
                external_id=ext_str,
                media_type=mtype,
            )
            return True
        except Exception:
            return False
    return False


def restore_from_sample_data() -> dict:
    sample_dir = BASE_DIR / "sample_data"
    if not sample_dir.exists():
        sample_dir = REPO_ROOT / "sample_data"
    if not sample_dir.exists():
        logger.warning("sample_data directory not found at %s", sample_dir)
        return {"movies": 0, "shows": 0, "games": 0, "assets": 0}

    assets_created = 0
    movies_seeded = 0
    shows_seeded = 0
    games_seeded = 0

    # 1. TMDB Movies
    movie_files = [
        sample_dir / "tmdb" / "movie" / "popular.json",
        sample_dir / "tmdb" / "movie" / "top_rated.json",
        sample_dir / "tmdb" / "movie" / "now_playing.json",
        sample_dir / "tmdb" / "movie" / "upcoming.json",
        sample_dir / "tmdb" / "trending" / "movie" / "week.json",
        sample_dir / "tmdb" / "trending" / "movie" / "day.json",
        sample_dir / "tmdb" / "movie" / "id.json",
    ]

    movie_records = []
    for mf in movie_files:
        if not mf.exists():
            continue
        try:
            data = json.loads(mf.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "results" in data:
                movie_records.extend(data["results"])
            elif isinstance(data, dict) and "id" in data:
                movie_records.append(data)
            elif isinstance(data, list):
                movie_records.extend(data)
        except Exception as e:
            logger.warning("Error reading %s: %s", mf, e)

    seen_movie_ids = set()
    for raw in movie_records:
        mid = raw.get("id")
        title = raw.get("title") or raw.get("name")
        if not mid or not title or mid in seen_movie_ids:
            continue
        seen_movie_ids.add(mid)

        slug = slugify(title) or f"movie-{mid}"
        item = (
            MediaItem.objects.filter(media_type="movie", slug=slug).first()
            or MediaItem.objects.filter(media_type="movie", title__iexact=title).first()
        )
        if not item:
            item = MediaItem.objects.create(
                media_type="movie",
                title=title,
                slug=slug,
                overview=raw.get("overview") or "",
                release_date=raw.get("release_date") or None,
                popularity=float(raw.get("popularity") or 100.0),
                original_language=raw.get("original_language") or "en",
                completeness_score=0.9,
            )
        movies_seeded += 1

        # Ensure Movie subtype
        Movie.objects.get_or_create(
            media_item=item,
            defaults={"is_anime": False, "runtime": raw.get("runtime") or 120},
        )
        upsert_external_id(item, "tmdb", str(mid), "movie")

        poster_path = raw.get("poster_path")
        if poster_path:
            p_url = f"{TMDB_POSTER_BASE}{poster_path}"
            if upsert_asset(item, "poster", p_url, score=100, provider="tmdb"):
                assets_created += 1
            if upsert_asset(item, "textless_poster", p_url, score=90, provider="tmdb"):
                assets_created += 1

        backdrop_path = raw.get("backdrop_path")
        if backdrop_path:
            b_url = f"{TMDB_BACKDROP_BASE}{backdrop_path}"
            if upsert_asset(item, "backdrop", b_url, score=100, provider="tmdb"):
                assets_created += 1

    # 2. TMDB Shows
    show_files = [
        sample_dir / "tmdb" / "tv" / "popular.json",
        sample_dir / "tmdb" / "tv" / "top_rated.json",
        sample_dir / "tmdb" / "trending" / "tv" / "week.json",
        sample_dir / "tmdb" / "tv" / "id.json",
    ]
    show_records = []
    for sf in show_files:
        if not sf.exists():
            continue
        try:
            data = json.loads(sf.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "results" in data:
                show_records.extend(data["results"])
            elif isinstance(data, dict) and "id" in data:
                show_records.append(data)
            elif isinstance(data, list):
                show_records.extend(data)
        except Exception as e:
            logger.warning("Error reading %s: %s", sf, e)

    seen_show_ids = set()
    for raw in show_records:
        sid = raw.get("id")
        title = raw.get("name") or raw.get("title")
        if not sid or not title or sid in seen_show_ids:
            continue
        seen_show_ids.add(sid)

        slug = slugify(title) or f"show-{sid}"
        item = (
            MediaItem.objects.filter(media_type="show", slug=slug).first()
            or MediaItem.objects.filter(media_type="show", title__iexact=title).first()
        )
        if not item:
            item = MediaItem.objects.create(
                media_type="show",
                title=title,
                slug=slug,
                overview=raw.get("overview") or "",
                release_date=raw.get("first_air_date") or None,
                popularity=float(raw.get("popularity") or 100.0),
                original_language=raw.get("original_language") or "en",
                completeness_score=0.9,
            )
        shows_seeded += 1

        Show.objects.get_or_create(
            media_item=item,
            defaults={"is_anime": False, "number_of_seasons": raw.get("number_of_seasons") or 1},
        )
        upsert_external_id(item, "tmdb", str(sid), "show")

        poster_path = raw.get("poster_path")
        if poster_path:
            p_url = f"{TMDB_POSTER_BASE}{poster_path}"
            if upsert_asset(item, "poster", p_url, score=100, provider="tmdb"):
                assets_created += 1
            if upsert_asset(item, "textless_poster", p_url, score=90, provider="tmdb"):
                assets_created += 1

        backdrop_path = raw.get("backdrop_path")
        if backdrop_path:
            b_url = f"{TMDB_BACKDROP_BASE}{backdrop_path}"
            if upsert_asset(item, "backdrop", b_url, score=100, provider="tmdb"):
                assets_created += 1

    # Seed sample season and episode data (Breaking Bad)
    season_file = sample_dir / "tmdb" / "tv" / "season" / "id.json"
    if season_file.exists():
        try:
            sdata = json.loads(season_file.read_text(encoding="utf-8"))
            bb_item = (
                MediaItem.objects.filter(media_type="show", title__iexact="Breaking Bad").first()
                or MediaItem.objects.filter(media_type="show", title__icontains="Breaking Bad").first()
            )
            if bb_item:
                bb_show, _ = Show.objects.get_or_create(media_item=bb_item)
                s_num = sdata.get("season_number", 1)
                s_poster = f"{TMDB_POSTER_BASE}{sdata.get('poster_path')}" if sdata.get("poster_path") else None
                season, _ = Season.objects.update_or_create(
                    show=bb_show,
                    season_number=s_num,
                    defaults={
                        "name": sdata.get("name") or f"Season {s_num}",
                        "overview": sdata.get("overview") or "",
                        "poster_url": s_poster,
                        "air_date": sdata.get("air_date") or None,
                    },
                )
                for ep in sdata.get("episodes", []):
                    ep_num = ep.get("episode_number")
                    if ep_num is not None:
                        ep_still = f"{TMDB_POSTER_BASE}{ep.get('still_path')}" if ep.get("still_path") else None
                        Episode.objects.update_or_create(
                            season=season,
                            episode_number=int(ep_num),
                            defaults={
                                "name": ep.get("name") or f"Episode {ep_num}",
                                "overview": ep.get("overview") or "",
                                "runtime": ep.get("runtime"),
                                "air_date": ep.get("air_date") or None,
                                "still_url": ep_still,
                            },
                        )
                bb_show.number_of_seasons = Season.objects.filter(show=bb_show, season_number__gt=0).count()
                bb_show.number_of_episodes = Episode.objects.filter(season__show=bb_show).count()
                bb_show.save(update_fields=["number_of_seasons", "number_of_episodes"])
                logger.info("Seeded Breaking Bad Season %s with %s episodes", s_num, bb_show.number_of_episodes)
        except Exception as e:
            logger.warning("Error seeding sample season data: %s", e)

    # 3. IGDB Games
    game_files = [
        sample_dir / "igdb" / "games" / "popular.json",
        sample_dir / "igdb" / "games" / "recent.json",
        sample_dir / "igdb" / "games" / "upcoming.json",
        sample_dir / "igdb" / "games" / "search.json",
        sample_dir / "igdb" / "games" / "id.json",
    ]
    game_records = []
    for gf in game_files:
        if not gf.exists():
            continue
        try:
            data = json.loads(gf.read_text(encoding="utf-8"))
            if isinstance(data, list):
                game_records.extend(data)
            elif isinstance(data, dict):
                game_records.append(data)
        except Exception as e:
            logger.warning("Error reading %s: %s", gf, e)

    seen_game_ids = set()
    for raw in game_records:
        gid = raw.get("id")
        name = raw.get("name")
        if not gid or not name or gid in seen_game_ids:
            continue
        seen_game_ids.add(gid)

        slug = slugify(name) or f"game-{gid}"
        item = (
            MediaItem.objects.filter(media_type="game", slug=slug).first()
            or MediaItem.objects.filter(media_type="game", title__iexact=name).first()
        )
        if not item:
            item = MediaItem.objects.create(
                media_type="game",
                title=name,
                slug=slug,
                overview=raw.get("summary") or "",
                popularity=float(raw.get("rating") or raw.get("aggregated_rating") or 90.0),
                original_language="en",
                completeness_score=0.9,
            )
        games_seeded += 1

        Game.objects.get_or_create(
            media_item=item,
            defaults={"game_type": "main_game"},
        )
        upsert_external_id(item, "igdb", str(gid), "game")

        cover = raw.get("cover")
        if isinstance(cover, dict) and cover.get("image_id"):
            img_id = cover["image_id"]
            c_url = f"{IGDB_COVER_BASE}/{img_id}.jpg"
            if upsert_asset(item, "poster", c_url, score=100, provider="igdb"):
                assets_created += 1

        artworks = raw.get("artworks") or raw.get("screenshots") or []
        if isinstance(artworks, list) and artworks:
            first_art = artworks[0]
            if isinstance(first_art, dict) and first_art.get("image_id"):
                art_id = first_art["image_id"]
                a_url = f"{IGDB_ARTWORK_BASE}/{art_id}.jpg"
                if upsert_asset(item, "backdrop", a_url, score=100, provider="igdb"):
                    assets_created += 1

    return {
        "movies": movies_seeded,
        "shows": shows_seeded,
        "games": games_seeded,
        "assets": assets_created,
    }


def restore_from_plex_items() -> dict:
    servers = {s.id: s for s in UserPlexServer.objects.all()}
    if not servers:
        logger.warning("No UserPlexServer found.")
        return {"items_processed": 0, "assets_created": 0}

    plex_items = UserPlexItem.objects.filter(media_item__isnull=False).select_related("media_item")
    processed = 0
    assets_created = 0

    for p_item in plex_items.iterator(chunk_size=500):
        media = p_item.media_item
        server = servers.get(p_item.server_id)
        if not server or not server.base_url or not server.access_token:
            continue

        base_url = server.base_url.rstrip("/")
        token = server.access_token

        # Ensure Subtype exists so browse/discover filters don't drop it
        if media.media_type == "movie":
            Movie.objects.get_or_create(
                media_item=media,
                defaults={"is_anime": False, "runtime": 120},
            )
        elif media.media_type == "show":
            Show.objects.get_or_create(
                media_item=media,
                defaults={"is_anime": False, "number_of_seasons": 1},
            )

        # 1. Poster
        thumb = p_item.thumb_url
        if thumb:
            full_thumb = f"{base_url}{thumb}?X-Plex-Token={token}"
            if upsert_asset(media, "poster", full_thumb, score=85, provider="plex"):
                assets_created += 1
            if upsert_asset(media, "textless_poster", full_thumb, score=80, provider="plex"):
                assets_created += 1

        # 2. Raw Image components (background, clearLogo)
        raw = p_item.raw or {}
        images = raw.get("Image") or []
        for img in images:
            itype = img.get("type")
            iurl = img.get("url")
            if not iurl:
                continue
            signed = f"{base_url}{iurl}?X-Plex-Token={token}"
            if itype == "background":
                if upsert_asset(media, "backdrop", signed, score=85, provider="plex"):
                    assets_created += 1
            elif itype == "clearLogo":
                if upsert_asset(media, "logo", signed, score=85, provider="plex"):
                    assets_created += 1

        # 3. External IDs
        guids = p_item.guids or {}
        for prov in ("tmdb", "imdb", "tvdb"):
            val = guids.get(prov)
            if val:
                upsert_external_id(media, prov, str(val), media.media_type)

        processed += 1

    return {"items_processed": processed, "assets_created": assets_created}


def restore_seasons_from_plex(limit: int | None = None) -> dict:
    shows_qs = UserPlexItem.objects.filter(media_type="show", media_item__isnull=False).select_related("media_item", "server", "user")
    total_shows = shows_qs.count()
    hydrated = 0
    skipped = 0
    errors = 0
    logger.info("Starting Plex season hydration for %s linked shows...", total_shows)
    for i, p_item in enumerate(shows_qs.iterator(chunk_size=100)):
        if limit and hydrated >= limit:
            break
        # If the show already has episodes, skip
        if Episode.objects.filter(season__show_id=p_item.media_item_id).exists():
            skipped += 1
            continue
        try:
            success = hydrate_show_seasons_from_plex(
                p_item.media_item,
                user=p_item.user,
                server=p_item.server,
                plex_item=p_item,
            )
            if success:
                hydrated += 1
            else:
                errors += 1
        except Exception as e:
            logger.warning("Error hydrating show %s: %s", p_item.media_item_id, e)
            errors += 1
        if (i + 1) % 25 == 0:
            logger.info("Plex season progress: %s/%s (hydrated: %s, skipped: %s)", i + 1, total_shows, hydrated, skipped)
    return {"total": total_shows, "hydrated": hydrated, "skipped": skipped, "errors": errors}


def main():
    print("[*] Restoring assets from sample_data...")
    s_res = restore_from_sample_data()
    print(f"[*] sample_data results: {s_res}")

    print("[*] Restoring assets from user_plex_items...")
    p_res = restore_from_plex_items()
    print(f"[*] user_plex_items results: {p_res}")

    print("[*] Restoring seasons and episodes from Plex...")
    s_plex = restore_seasons_from_plex()
    print(f"[*] Plex seasons results: {s_plex}")

    total_assets = MediaAsset.objects.count()
    total_movies = Movie.objects.count()
    total_shows = Show.objects.count()
    total_seasons = Season.objects.count()
    total_episodes = Episode.objects.count()
    total_games = Game.objects.count()
    total_ext = ExternalID.objects.count()
    print("\n" + "=" * 50)
    print(f"[+] Total MediaAsset count now: {total_assets}")
    print(f"[+] Total Movie count now:      {total_movies}")
    print(f"[+] Total Show count now:       {total_shows}")
    print(f"[+] Total Season count now:     {total_seasons}")
    print(f"[+] Total Episode count now:    {total_episodes}")
    print(f"[+] Total Game count now:       {total_games}")
    print(f"[+] Total ExternalID count now: {total_ext}")
    print("=" * 50)


if __name__ == "__main__":
    main()

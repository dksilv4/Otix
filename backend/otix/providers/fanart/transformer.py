"""Fanart JSON → MediaAsset domain models.

Stateless pure functions. Each category of Fanart images maps to a standardized
asset_type on MediaAsset.
"""

from __future__ import annotations

from otix.domain.asset import MediaAsset
from otix.lib.types import JSONValue

# (fanart_category, asset_type) — order matters: HD variants first so they are
# deduped against standard variants by URL within the same asset_type bucket.
_MOVIE_CATEGORIES: list[tuple[str, str]] = [
    ("hdmovieclearart", "clearart"),
    ("movieclearart", "clearart"),
    ("hdmovielogo", "logo"),
    ("movielogo", "logo"),
    ("movieposter", "poster"),
    ("moviebackground", "backdrop"),
    ("moviebanner", "banner"),
    ("moviethumb", "thumb"),
    ("moviedisc", "disc"),
]

_SHOW_CATEGORIES: list[tuple[str, str]] = [
    ("hdclearart", "clearart"),
    ("hdtvlogo", "logo"),
    ("clearlogo", "logo"),
    ("tvlogo", "logo"),
    ("tvposter", "poster"),
    ("showbackground", "backdrop"),
    ("tvbanner", "banner"),
    ("tvthumb", "thumb"),
    ("seasonposter", "poster"),
]

_GAME_CATEGORIES: list[tuple[str, str]] = [
    ("hdgameclearart", "clearart"),
    ("gameclearart", "clearart"),
    ("hdgamelogo", "logo"),
    ("gamelogo", "logo"),
    ("gameposter", "poster"),
    ("gamebackground", "backdrop"),
    ("gamebanner", "banner"),
    ("gamethumb", "thumb"),
    ("gamedisc", "disc"),
]

_MUSIC_CATEGORIES: list[tuple[str, str]] = [
    ("hdmusiclogo", "logo"),
    ("musiclogo", "logo"),
    ("artistbackground", "backdrop"),
    ("artistthumb", "thumb"),
    ("musicbanner", "banner"),
]


def movie_images_to_assets(raw: dict[str, JSONValue], media_item_id: str) -> list[MediaAsset]:
    return _extract_assets(raw, _MOVIE_CATEGORIES, media_item_id)


def show_images_to_assets(raw: dict[str, JSONValue], media_item_id: str) -> list[MediaAsset]:
    return _extract_assets(raw, _SHOW_CATEGORIES, media_item_id)


def game_images_to_assets(raw: dict[str, JSONValue], media_item_id: str) -> list[MediaAsset]:
    return _extract_assets(raw, _GAME_CATEGORIES, media_item_id)


def music_images_to_assets(raw: dict[str, JSONValue], media_item_id: str) -> list[MediaAsset]:
    """Extract artist-level assets from Fanart music artist response.

    Only includes top-level artist artwork (logos, backgrounds, thumbs,
    banners). Album covers are handled separately via
    _extract_album_covers_by_rg so they can be matched to the correct
    release group.
    """
    return _extract_assets(raw, _MUSIC_CATEGORIES, media_item_id)


def _extract_artist_assets(raw: dict[str, JSONValue], media_item_id: str) -> list[MediaAsset]:
    """Extract artist-level assets only (no album covers)."""
    return _extract_assets(raw, _MUSIC_CATEGORIES, media_item_id)


def _extract_album_covers_by_rg(raw: dict[str, JSONValue]) -> dict[str, str]:
    """Return {release_group_mbid: best_cover_url} from Fanart music response.

    Album covers are nested under ``albums``, keyed by MusicBrainz release
    group ID. For each release group, the widest image is picked.
    """
    covers: dict[str, str] = {}
    albums = raw.get("albums", {})
    if not isinstance(albums, dict):
        return covers

    for rg_mbid, album_data in albums.items():
        if not isinstance(album_data, dict):
            continue
        entries = album_data.get("albumcover", [])
        if not isinstance(entries, list) or not entries:
            continue

        best_url = None
        best_likes = -1
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            url = entry.get("url")
            if not isinstance(url, str) or not url:
                continue
            likes = int(entry.get("likes", 0)) if entry.get("likes") else 0
            if likes > best_likes:
                best_likes = likes
                best_url = url

        if best_url:
            covers[rg_mbid] = best_url

    return covers


def _extract_assets(
    raw: dict[str, JSONValue],
    categories: list[tuple[str, str]],
    media_item_id: str,
) -> list[MediaAsset]:
    seen_urls: set[str] = set()
    assets: list[MediaAsset] = []

    for fanart_cat, asset_type in categories:
        entries = raw.get(fanart_cat, [])
        if not isinstance(entries, list):
            continue

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            url = entry.get("url")
            if not isinstance(url, str) or not url or url in seen_urls:
                continue
            seen_urls.add(url)

            lang_raw = entry.get("lang")
            lang = lang_raw[:10] if isinstance(lang_raw, str) and lang_raw else None

            assets.append(
                MediaAsset(
                    media_item_id=media_item_id,
                    asset_type=asset_type,
                    url=url,
                    lang=lang,
                    provider="fanart",
                )
            )

    return assets

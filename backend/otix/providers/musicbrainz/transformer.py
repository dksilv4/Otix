"""MusicBrainz API response → domain model mapping."""

from __future__ import annotations

import re
from datetime import date

from otix.domain.media import Album, MediaItem, Track
from otix.domain.people import Person
from otix.lib.types import JSONValue


_RELEASE_TYPE_MAP = {
    "Album": "album",
    "Single": "single",
    "EP": "ep",
    "Compilation": "compilation",
    "Live": "live",
    "Soundtrack": "soundtrack",
    "Remix": "remix",
    "Other": "album",
}


def _release_group_type(raw: dict[str, JSONValue]) -> str:
    rg = raw.get("release-group")
    if isinstance(rg, dict):
        primary = rg.get("primary-type", "Album")
        return _RELEASE_TYPE_MAP.get(str(primary), "album")
    return "album"


def _extract_date(raw: dict[str, JSONValue]) -> date | None:
    d = raw.get("date")
    if d and isinstance(d, str) and len(d) >= 10:
        try:
            return date.fromisoformat(d[:10])
        except (ValueError, TypeError):
            pass
    return None


def _cover_url_from_caa(images: list[dict]) -> str | None:
    for img in images:
        if img.get("front"):
            return img.get("image")
    if images:
        return images[0].get("image")
    return None


def extract_spotify_id(url: str | None) -> str | None:
    """Extract a Spotify album ID from a URL or URI string.

    Handles: open.spotify.com/album/{id}, spotify:album:{id},
    and legacy ws.spotify.com/lookup URIs.
    """
    if not url:
        return None
    # open.spotify.com/album/{id} or spotify.com/album/{id}
    m = re.search(r"spotify\.com/album/(\w+)", url)
    if m:
        return m.group(1)
    # spotify:album:{id} (in embed URIs or ws.spotify.com legacy URLs)
    m = re.search(r"spotify:album:(\w+)", url)
    if m:
        return m.group(1)
    return None


def extract_url_external_ids(relations: list[dict]) -> list[tuple[str, str]]:
    """Extract (provider, external_id) pairs from MusicBrainz url-rels.

    Maps streaming/download URLs to provider names and extracts the
    service-specific identifier from each URL.
    """
    results: list[tuple[str, str]] = []
    for rel in relations or []:
        if not isinstance(rel, dict):
            continue
        url_obj = rel.get("url")
        url = str(url_obj.get("resource", "")) if isinstance(url_obj, dict) else None
        if not url:
            continue
        pair = _extract_provider_id(url)
        if pair and pair not in results:
            results.append(pair)
    return results


_PROVIDER_PATTERNS: list[tuple[str, str]] = [
    # Spotify — open.spotify.com/album/{id} or spotify:album:{id}
    ("spotify", r"open\.spotify\.com/album/(\w+)"),
    ("spotify", r"spotify:album:(\w+)"),
    # YouTube Music — music.youtube.com/playlist?list={id}
    ("youtube_music", r"music\.youtube\.com/playlist\?list=([\w-]+)"),
    # Apple Music — music.apple.com/{country}/album/{name}/{id}
    ("apple_music", r"music\.apple\.com/\w+/album/[^/]+/(\d+)"),
    # Deezer — deezer.com/{country}/album/{id}
    ("deezer", r"deezer\.com/(?:\w+/)?album/(\d+)"),
    # Tidal — tidal.com/browse/album/{id} or tidal.com/album/{id}
    ("tidal", r"tidal\.com/(?:browse/)?album/(\d+)"),
    # Amazon / Amazon Music — amazon.com/dp/{ASIN} or amazon.com/gp/product/{ASIN}
    ("amazon", r"amazon\.\w+(?:\.\w+)?/(?:[^/]+/)?(?:dp|gp/product)/(\w{10})"),
    # Discogs — discogs.com/release/{id} or discogs.com/master/{id}
    ("discogs", r"discogs\.com/(?:release|master)/(\d+)"),
    # SoundCloud — soundcloud.com/{artist}/sets/{name}
    ("soundcloud", r"soundcloud\.com/([^/]+/sets/[^/?]+)"),
    # Bandcamp — {name}.bandcamp.com/album/{name}
    ("bandcamp", r"([\w-]+\.bandcamp\.com/album/[^/?]+)"),
]


def _extract_provider_id(url: str) -> tuple[str, str] | None:
    for provider, pattern in _PROVIDER_PATTERNS:
        m = re.search(pattern, url)
        if m:
            return provider, m.group(1)
    return None


def to_album(raw: dict[str, JSONValue]) -> Album:
    media = to_media_item(raw)
    tracks_raw = raw.get("media", [])
    tracks: list[Track] = []
    for medium in (tracks_raw if isinstance(tracks_raw, list) else []):
        for t in medium.get("tracks", []) or []:
            tracks.append(to_track(t))

    rg = raw.get("release-group")
    rg_id = str(rg.get("id", "")) if isinstance(rg, dict) and rg.get("id") else None

    # Extract all URL relationships as (provider, external_id) pairs
    relations = raw.get("relations", []) or []
    external_ids = extract_url_external_ids(relations)

    # Extract Spotify ID (first match) for the direct column + downstream dispatch
    spotify_id: str | None = None
    for rel in relations:
        if isinstance(rel, dict):
            sid = extract_spotify_id(
                str(rel.get("url", {}).get("resource", ""))
                if isinstance(rel.get("url"), dict)
                else None
            )
            if sid:
                spotify_id = sid
                break

    album = Album(
        release_type=_release_group_type(raw),
        track_count=len(tracks),
        disc_count=raw.get("disc-count") or 0 if isinstance(raw.get("disc-count"), int) else 0,
        musicbrainz_id=str(raw.get("id", "")),
        musicbrainz_release_group_id=rg_id,
        spotify_id=spotify_id,
        tracks=tracks,
        media_item=media,
    )
    # Non-persisted attribute carrying all external IDs for the sync task
    album._external_ids = external_ids  # type: ignore[attr-defined]
    return album


def to_media_item(raw: dict[str, JSONValue]) -> MediaItem:
    title = raw.get("title", "Unknown Album") if isinstance(raw.get("title"), str) else "Unknown Album"
    return MediaItem(
        media_type="music",
        title=title,
        overview=raw.get("disambiguation") if isinstance(raw.get("disambiguation"), str) else None,
        slug="",
        release_date=_extract_date(raw),
        original_language=None,
    )


def to_track(raw: dict[str, JSONValue]) -> Track:
    dur = raw.get("length")
    isrcs = raw.get("isrcs")
    first_isrc: str | None = None
    if isinstance(isrcs, list) and isrcs:
        first_isrc = str(isrcs[0]) if isrcs[0] else None
    return Track(
        track_number=raw.get("position", 0) if isinstance(raw.get("position"), int) else 0,
        disc_number=1,
        title=str(raw.get("title", "Unknown Track")),
        duration_ms=int(dur) if dur else None,
        musicbrainz_recording_id=str(raw.get("id", "")) if raw.get("id") else None,
        isrc=first_isrc,
    )


def to_artist(raw: dict[str, JSONValue]) -> Person:
    return Person(
        name=str(raw.get("name", "Unknown Artist")),
        musicbrainz_artist_id=str(raw.get("id", "")) if raw.get("id") else None,
        biography=raw.get("disambiguation") if isinstance(raw.get("disambiguation"), str) else None,
        birthday=_extract_date(raw) if raw.get("type") == "Person" else None,
    )

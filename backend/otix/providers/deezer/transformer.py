# TODO: Review this file
"""Deezer API response -> domain model mapping."""

from __future__ import annotations

from datetime import UTC, date, datetime

from otix.domain.media import Album, MediaItem, Track
from otix.lib.slug import slugify
from otix.lib.types import JSONValue


def _release_type(album_type: str) -> str:
    mapping = {
        "album": "album",
        "single": "single",
        "ep": "ep",
        "compilation": "compilation",
    }
    return mapping.get((album_type or "").lower(), "album")


def _extract_date(raw: dict[str, JSONValue]) -> date | None:
    d = raw.get("release_date")
    if d and isinstance(d, str) and len(d) >= 10:
        try:
            return date.fromisoformat(d[:10])
        except (ValueError, TypeError):
            pass
    return None


def _extract_isrc(track_data: dict[str, JSONValue]) -> str | None:
    isrc = track_data.get("isrc")
    if isinstance(isrc, str) and isrc:
        return isrc
    return None


def _extract_upc(album_data: dict[str, JSONValue]) -> str | None:
    upc = album_data.get("upc")
    if isinstance(upc, str) and upc and upc != "0":
        return upc
    return None


def _extract_cover_url(raw: dict[str, JSONValue]) -> str | None:
    # Deezer provides: cover, cover_small, cover_medium, cover_big, cover_xl
    for size in ("cover_xl", "cover_big", "cover_medium", "cover", "cover_small"):
        url = raw.get(size)
        if isinstance(url, str) and url:
            return url
    return None


def _extract_genre_names(raw: dict[str, JSONValue]) -> list[str]:
    genres = raw.get("genres", {})
    names: list[str] = []
    if isinstance(genres, dict):
        items = genres.get("data", [])
        if isinstance(items, list):
            for g in items:
                if isinstance(g, dict):
                    name = g.get("name")
                    if name:
                        names.append(str(name))
    return names


def _extract_album_artist_info(raw: dict[str, JSONValue]) -> tuple[str | None, str | None, str | None]:
    """Return (artist_name, artist_deezer_id, artist_picture_url) from album's artist data."""
    artist = raw.get("artist")
    if isinstance(artist, dict):
        return (
            artist.get("name") if isinstance(artist.get("name"), str) else None,
            str(artist["id"]) if artist.get("id") else None,
            artist.get("picture_medium") if isinstance(artist.get("picture_medium"), str) else None,
        )
    return None, None, None


def to_album(raw: dict[str, JSONValue], tracks_data: list[dict] | None = None) -> Album:
    """Map Deezer album JSON to domain Album.

    Args:
        raw: Album data from /album/{id} endpoint.
        tracks_data: Optional track list from /album/{id}/tracks (includes ISRCs).
                     If None, uses embedded tracks from the album endpoint (no ISRCs).
    """
    title = str(raw.get("title", "Unknown Album"))
    cover_url = _extract_cover_url(raw)
    release_date = _extract_date(raw)
    genres = _extract_genre_names(raw)
    upc = _extract_upc(raw)
    deezer_id = str(raw.get("id", ""))
    deezer_artist_id = str(raw.get("artist", {}).get("id", "")) if isinstance(raw.get("artist"), dict) else None

    if tracks_data is None:
        tracks_data = raw.get("tracks", {}).get("data", []) if isinstance(raw.get("tracks", {}), dict) else []
    tracks = [to_track(t) for t in tracks_data if isinstance(t, dict)]

    album_type = raw.get("record_type", "album") if isinstance(raw.get("record_type"), str) else "album"

    media = MediaItem(
        media_type="music",
        title=title,
        slug=slugify(title),
        release_date=release_date,
        synced_at=datetime.now(UTC),
    )
    # Cover art is stored as a media_assets row by the seed task; best-asset
    # selection is resolved at query time (asset_selection).
    if cover_url:
        media._cover_url = cover_url

    album = Album(
        release_type=_release_type(album_type),
        track_count=raw.get("nb_tracks", 0) if isinstance(raw.get("nb_tracks"), int) else len(tracks),
        duration_ms=_parse_duration(raw),
        media_item=media,
    )

    # Store tracks separately to avoid SQLAlchemy relationship back-population
    # which interferes with explicit FK assignment during insert.
    album._tracks = tracks
    album._deezer_id = deezer_id
    album._deezer_artist_id = deezer_artist_id
    album._upc = upc
    album._genre_names = genres

    return album


def to_track(raw: dict[str, JSONValue]) -> Track:
    dur = raw.get("duration")
    track = Track(
        track_number=raw.get("track_position", 0) if isinstance(raw.get("track_position"), int) else 0,
        disc_number=raw.get("disk_number", 1) if isinstance(raw.get("disk_number"), int) else 1,
        title=str(raw.get("title", "Unknown Track")),
        duration_ms=int(dur) if dur else None,
    )
    track.isrc = _extract_isrc(raw)
    return track


def _parse_duration(raw: dict[str, JSONValue]) -> int | None:
    dur = raw.get("duration")
    if isinstance(dur, int) and dur > 0:
        return dur * 1000  # Deezer gives seconds, we store ms
    return None

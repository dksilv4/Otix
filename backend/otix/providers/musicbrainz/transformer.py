"""MusicBrainz API response → domain model mapping."""

from __future__ import annotations

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


def to_album(raw: dict[str, JSONValue]) -> Album:
    media = to_media_item(raw)
    tracks_raw = raw.get("media", [])
    tracks: list[Track] = []
    for medium in (tracks_raw if isinstance(tracks_raw, list) else []):
        for t in medium.get("tracks", []) or []:
            tracks.append(to_track(t))

    rg = raw.get("release-group")
    rg_id = str(rg.get("id", "")) if isinstance(rg, dict) and rg.get("id") else None

    return Album(
        release_type=_release_group_type(raw),
        track_count=len(tracks),
        disc_count=raw.get("disc-count") or 0 if isinstance(raw.get("disc-count"), int) else 0,
        musicbrainz_id=str(raw.get("id", "")),
        musicbrainz_release_group_id=rg_id,
        tracks=tracks,
        media_item=media,
    )


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
    return Track(
        track_number=raw.get("position", 0) if isinstance(raw.get("position"), int) else 0,
        disc_number=1,
        title=str(raw.get("title", "Unknown Track")),
        duration_ms=int(dur) if dur else None,
        musicbrainz_recording_id=str(raw.get("id", "")) if raw.get("id") else None,
    )


def to_artist(raw: dict[str, JSONValue]) -> Person:
    return Person(
        name=str(raw.get("name", "Unknown Artist")),
        musicbrainz_artist_id=str(raw.get("id", "")) if raw.get("id") else None,
        biography=raw.get("disambiguation") if isinstance(raw.get("disambiguation"), str) else None,
        birthday=_extract_date(raw) if raw.get("type") == "Person" else None,
    )

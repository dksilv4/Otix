# TODO: Review this file
"""Spotify API response → domain enrichments."""

from __future__ import annotations

from otix.lib.types import JSONValue


def extract_audio_features(raw: dict[str, JSONValue]) -> dict[str, float | int]:
    return {
        "tempo": raw.get("tempo"),
        "key": raw.get("key"),
        "mode": raw.get("mode"),
        "energy": raw.get("energy"),
        "danceability": raw.get("danceability"),
        "valence": raw.get("valence"),
        "acousticness": raw.get("acousticness"),
        "instrumentalness": raw.get("instrumentalness"),
        "liveness": raw.get("liveness"),
        "speechiness": raw.get("speechiness"),
        "loudness": raw.get("loudness"),
    }


def extract_popularity(raw: dict[str, JSONValue]) -> int:
    return raw.get("popularity", 0) or 0


def extract_spotify_url(raw: dict[str, JSONValue]) -> str | None:
    ext = raw.get("external_urls")
    if isinstance(ext, dict):
        return ext.get("spotify")
    return None


def extract_image(raw: dict[str, JSONValue]) -> str | None:
    images = raw.get("images")
    if isinstance(images, list) and images:
        return images[0].get("url") if isinstance(images[0], dict) else None
    return None


def extract_artist_spotify_ids(raw: dict[str, JSONValue]) -> list[str]:
    artists = raw.get("artists", [])
    ids: list[str] = []
    if isinstance(artists, list):
        for a in artists:
            if isinstance(a, dict) and a.get("id"):
                ids.append(str(a["id"]))
    return ids


def extract_release_date(raw: dict[str, JSONValue]) -> str | None:
    return raw.get("release_date") if isinstance(raw.get("release_date"), str) else None


def extract_track_isrc(track_data: dict[str, JSONValue]) -> str | None:
    """Extract ISRC from a Spotify track object's external_ids."""
    ext = track_data.get("external_ids")
    if isinstance(ext, dict):
        isrc = ext.get("isrc")
        if isinstance(isrc, str) and isrc:
            return isrc
    return None


def extract_album_upc(album_data: dict[str, JSONValue]) -> str | None:
    """Extract UPC/EAN barcode from a Spotify album object's external_ids."""
    ext = album_data.get("external_ids")
    if isinstance(ext, dict):
        upc = ext.get("upc") or ext.get("ean")
        if isinstance(upc, str) and upc:
            return upc
    return None

"""MusicBrainz release ingest — seed catalog albums from a release lookup.

The album analogue of ``tmdb_ingest`` (which targets the ported async TMDB
client): a release MBID is fetched over the async MusicBrainz provider client
(``core.providers.musicbrainz.MusicBrainzProvider.get_release``, which embeds
mediums/tracks and the release-group) and mapped onto the Django MTI graph — a
``MediaItem`` hub with ``media_type="music"`` (the discriminator albums use; the
``Album`` subtype PK equals the hub's pk) plus ``Track`` rows under it and a
``musicbrainz`` ``ExternalID`` scoped ``media_type="music"``.

Seeding mirrors the increment-26 "minimal base seed" posture
(``completeness_score`` 0.15, ``next_sync_at`` stamped) exactly like
``seed_movie_from_tmdb``/``seed_show_from_tmdb``. Release resolution is by the
musicbrainz ``ExternalID`` only — albums share titles, so there is deliberately
no same-slug cross-provider fallback (unlike movies/shows) to avoid merging
distinct releases. Tracks are upserted add-only keyed on each recording's MBID
(the legacy ``hydrate_tracks`` semantics), so a re-sync never duplicates or
destroys existing track rows (their user ratings survive) while new tracks are
added. Credits (artist → Person/MediaCredit), labels, genres, cover art and the
url-relation provider ids (Deezer/Apple/...) remain the deferred full-hydration
tail.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType
from django.db.models import Max, Sum
from django.utils import timezone as dj_timezone
from django.utils.text import slugify

from apps.media.models import Album, ExternalID, MediaItem, Track

if TYPE_CHECKING:
    from core.providers.musicbrainz import MusicBrainzProvider

_RELEASE_TYPE_MAP: dict[str, str] = {
    "Album": "album",
    "Single": "single",
    "EP": "ep",
    "Compilation": "compilation",
    "Live": "live",
    "Soundtrack": "soundtrack",
    "Remix": "remix",
    "Demo": "demo",
    "Other": "album",
}


def _parse_date(raw: Any) -> date | None:
    """Parse a MusicBrainz 'YYYY-MM-DD' (possibly partial) string to a date."""
    if raw and isinstance(raw, str) and len(raw) >= 10:
        try:
            return date.fromisoformat(raw[:10])
        except (ValueError, TypeError):
            return None
    return None


def _media_ct() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _track_ct() -> ContentType:
    return ContentType.objects.get_for_model(Track)


def _release_type(raw: dict[str, Any]) -> str:
    rg = raw.get("release-group")
    primary = "Album"
    if isinstance(rg, dict) and rg.get("primary-type"):
        primary = str(rg["primary-type"])
    return _RELEASE_TYPE_MAP.get(primary, "album")


def _format_and_catalog(raw: dict[str, Any]) -> tuple[str | None, str | None]:
    media = raw.get("media") or []
    fmt = None
    if isinstance(media, list):
        for medium in media:
            if isinstance(medium, dict) and medium.get("format"):
                fmt = str(medium["format"])
                break
    catalog_number = None
    for li in raw.get("label-info") or []:
        if isinstance(li, dict) and li.get("catalog-number"):
            catalog_number = str(li["catalog-number"])
            break
    return fmt, catalog_number or None


def _iter_release_tracks(raw: dict[str, Any]):
    """Yield (disc_number, track_number, title, length_ms, recording_id)."""
    media = raw.get("media")
    if not isinstance(media, list):
        return
    for disc_idx, medium in enumerate(media, start=1):
        if not isinstance(medium, dict):
            continue
        disc_number = medium.get("position")
        if not isinstance(disc_number, int) or disc_number <= 0:
            disc_number = disc_idx
        tracks = medium.get("tracks")
        if not isinstance(tracks, list):
            continue
        for track_idx, track_data in enumerate(tracks, start=1):
            if not isinstance(track_data, dict):
                continue
            number = track_data.get("position")
            if not isinstance(number, int) or number <= 0:
                number = track_idx
            title = (track_data.get("title") or "").strip()
            if not title:
                continue
            length = track_data.get("length")
            recording = track_data.get("recording")
            recording_id = None
            if isinstance(recording, dict) and recording.get("id"):
                recording_id = str(recording["id"])
            elif track_data.get("id"):
                recording_id = str(track_data["id"])
            yield (
                disc_number,
                number,
                title,
                int(length) if isinstance(length, int) else None,
                recording_id,
            )


def seed_album_from_musicbrainz(raw: dict[str, Any]) -> int:
    """Create (or refresh) a MediaItem+Album+Track set from a release lookup.

    Returns the media_item id. The row is resolved by the musicbrainz
    ``ExternalID`` (``media_type="music"``) alone — no same-slug fallback, since
    album titles repeat. An existing row is not overwritten wholesale: only
    missing overview is topped up and the ``Album`` growth fields refresh; track
    rows are upserted add-only keyed on the recording MBID (re-syncs never
    duplicate or drop tracks). ``completeness_score`` starts at 0.15 so the later
    full-hydration pass (credits/labels/genres/cover) completes the row.
    """
    mbid = raw.get("id")
    if not mbid:
        raise ValueError("MusicBrainz release detail missing 'id'")
    mbid = str(mbid)

    existing = ExternalID.objects.filter(
        content_type=_media_ct(), provider="musicbrainz", external_id=mbid, media_type="music"
    ).first()
    media = None
    if existing is not None and existing.object_id:
        media = MediaItem.objects.filter(pk=existing.object_id, media_type="music").first()

    title = (raw.get("title") or "Unknown Album").strip() or "Unknown Album"
    overview = raw.get("disambiguation")
    release_date = _parse_date(raw.get("date"))
    slug = slugify(title)[:200]

    if media is None:
        media = MediaItem.objects.create(
            media_type="music",
            title=title,
            overview=overview,
            slug=slug,
            release_date=release_date,
            original_language=None,
            completeness_score=0.15,
            next_sync_at=dj_timezone.now(),
        )
    elif media.overview is None and overview:
        media.overview = overview
        media.save(update_fields=("overview", "updated_at"))
    media_id = media.pk

    album = Album.objects.get_or_create(media_item_id=media_id)[0]
    fmt, catalog_number = _format_and_catalog(raw)
    album.release_type = _release_type(raw)
    album.format = fmt
    album.catalog_number = catalog_number
    barcode = raw.get("barcode")
    album.barcode = str(barcode) if barcode else None

    existing_by_recording: dict[str, int] = {}
    existing_slots: set[tuple[int, int]] = set()
    track_rows = list(Track.objects.filter(album_id=media_id))
    if track_rows:
        pks = [t.pk for t in track_rows]
        recs = ExternalID.objects.filter(
            content_type=_track_ct(), provider="musicbrainz", object_id__in=pks
        ).values_list("object_id", "external_id")
        for object_id, recording_id in recs:
            existing_by_recording[recording_id] = object_id
        existing_slots = {(t.disc_number, t.track_number) for t in track_rows}

    seen: set[tuple[int, int]] = set()
    for (
        disc_number,
        track_number,
        track_title,
        length_ms,
        recording_id,
    ) in _iter_release_tracks(raw):
        if recording_id and recording_id in existing_by_recording:
            continue
        if (disc_number, track_number) in existing_slots or (disc_number, track_number) in seen:
            continue
        seen.add((disc_number, track_number))
        track = Track.objects.create(
            album_id=media_id,
            disc_number=disc_number,
            track_number=track_number,
            title=track_title,
            duration_ms=length_ms,
        )
        if recording_id:
            ExternalID.objects.get_or_create(
                content_type=_track_ct(),
                provider="musicbrainz",
                external_id=recording_id,
                defaults={"object_id": track.pk},
            )

    album.track_count = Track.objects.filter(album_id=media_id).count()
    album.disc_count = (
        Track.objects.filter(album_id=media_id).aggregate(max_disc=Max("disc_number"))["max_disc"]
        or 0
    )
    album.duration_ms = Track.objects.filter(album_id=media_id).aggregate(
        total=Sum("duration_ms")
    )["total"]
    album.save(
        update_fields=(
            "release_type",
            "format",
            "catalog_number",
            "barcode",
            "track_count",
            "disc_count",
            "duration_ms",
        )
    )

    ExternalID.objects.get_or_create(
        content_type=_media_ct(),
        provider="musicbrainz",
        external_id=mbid,
        media_type="music",
        defaults={"object_id": media_id},
    )
    return media_id


async def fetch_and_seed_album(mbid: str, *, provider: MusicBrainzProvider | None = None) -> int:
    """Fetch a MusicBrainz release through a provider client, then seed it."""
    if provider is None:
        from core.providers.musicbrainz import MusicBrainzProvider

        provider = MusicBrainzProvider()
    raw = await provider.get_release(mbid)
    # ORM write leaves the async context (Django's sync-ORM-in-async guard).
    return await sync_to_async(seed_album_from_musicbrainz)(raw)

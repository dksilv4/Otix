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
added. The full-hydration tail (increment 47) is folded into the same seed:
artist credits (→ Person/MediaCredit), record labels (→ Company/
InvolvedCompany), typed genres (→ Genre/MediaGenre, capped at 8), the
url-relation provider ids (Deezer/Apple/... → ExternalID rows) and — via the
async driver's separate Cover Art Archive fetch — front/back cover assets. Each
enrichment is add-only and idempotent, so re-syncs never duplicate.
"""

from __future__ import annotations

import asyncio
import re
from datetime import date
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db.models import Max, Sum
from django.utils import timezone as dj_timezone
from django.utils.text import slugify

from apps.company.models import Company, InvolvedCompany
from apps.media.models import Album, ExternalID, MediaAsset, MediaItem, Track
from apps.media.models.genre import Genre, MediaGenre
from apps.media.services.completeness import recompute_completeness
from apps.media.services.lastfm_ingest import lastfm_enrich_album
from apps.media.services.lrclib_ingest import lrclib_enrich_album
from apps.people.models import MediaCredit, Person

if TYPE_CHECKING:
    from core.providers.musicbrainz import MusicBrainzProvider

# MusicBrainz ``url-rels`` (release ``relations``) map streaming/store URLs onto
# a provider name + extracted service id, ported from the legacy transformer.
_PROVIDER_PATTERNS: list[tuple[str, str]] = [
    ("youtube_music", r"music\.youtube\.com/playlist\?list=([\w-]+)"),
    ("apple_music", r"music\.apple\.com/\w+/album/[^/]+/(\d+)"),
    ("deezer", r"deezer\.com/(?:\w+/)?album/(\d+)"),
    ("tidal", r"tidal\.com/(?:browse/)?album/(\d+)"),
    ("amazon", r"amazon\.\w+(?:\.\w+)?/(?:[^/]+/)?(?:dp|gp/product)/(\w{10})"),
    ("discogs", r"discogs\.com/(?:release|master)/(\d+)"),
    ("soundcloud", r"soundcloud\.com/([^/]+/sets/[^/?]+)"),
    ("bandcamp", r"([\w-]+\.bandcamp\.com/album/[^/?]+)"),
    ("wikidata", r"wikidata\.org/(?:wiki|entity)/(Q\d+)"),
    ("genius", r"genius\.com/albums/[^/]+/(\d+)"),
    ("rateyourmusic", r"rateyourmusic\.com/release/album/[^/]+/([^/]+)"),
    ("qobuz", r"qobuz\.com/\w+/album/[^/]+/(\w+)"),
    ("napster", r"napster\.com/artist/[^/]+/album/[^/]+/(\w+)"),
    ("allmusic", r"allmusic\.com/album/[^/]+/(mw\d+)"),
]

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


def _person_ct() -> ContentType:
    return ContentType.objects.get_for_model(Person)


def _extract_provider_id(url: str) -> tuple[str, str] | None:
    for provider, pattern in _PROVIDER_PATTERNS:
        match = re.search(pattern, url)
        if match:
            return provider, match.group(1)
    return None


def _url_external_ids(relations: list[Any]) -> list[tuple[str, str]]:
    """Extract (provider, external_id) pairs from MusicBrainz url-rels."""
    results: list[tuple[str, str]] = []
    for rel in relations:
        if not isinstance(rel, dict):
            continue
        url_obj = rel.get("url")
        url = (
            str(url_obj.get("resource", "")) if isinstance(url_obj, dict) else None
        )
        if not url:
            continue
        pair = _extract_provider_id(url)
        if pair and pair not in results:
            results.append(pair)
    return results


def _resolve_artist(mbid: str, name: str) -> Person:
    """Resolve an artist Person by musicbrainz_artist id (creating a stub).

    The legacy cross-provider wikidata lookup is deferred (nothing else seeds
    artists yet, so the musicbrainz_artist ``ExternalID`` alone is idempotent);
    a person with the same name that does *not* yet own a musicbrainz_artist id
    is backfilled instead of duplicated.
    """
    ct = _person_ct()
    existing = ExternalID.objects.filter(
        content_type=ct, provider="musicbrainz_artist", external_id=mbid
    ).first()
    if existing is not None and existing.object_id:
        person = Person.objects.filter(pk=existing.object_id).first()
        if person is not None:
            return person
    for person in Person.objects.filter(name__iexact=name):
        owns_mbid = ExternalID.objects.filter(
            content_type=ct, provider="musicbrainz_artist", object_id=person.pk
        ).exists()
        if not owns_mbid:
            ExternalID.objects.get_or_create(
                content_type=ct,
                provider="musicbrainz_artist",
                external_id=mbid,
                defaults={"object_id": person.pk},
            )
            return person
    person = Person.objects.create(name=name)
    ExternalID.objects.get_or_create(
        content_type=ct,
        provider="musicbrainz_artist",
        external_id=mbid,
        defaults={"object_id": person.pk},
    )
    return person


def _upsert_album_artists(media: MediaItem, raw: dict[str, Any]) -> None:
    """Link album ``artist-credit`` artists as add-only Person credits.

    Mirrors the legacy ``hydrate_artists``: the array position decides the role
    (``primary`` for the first entry, ``featured`` after) and the joinphrase is
    folded onto the credit's ``character_name``. Existing ``(person, role)``
    rows are left untouched, so re-syncs never duplicate credits.
    """
    credits = raw.get("artist-credit")
    if not isinstance(credits, list) or not credits:
        return
    existing = set(
        MediaCredit.objects.filter(media_item=media).values_list("person_id", "role")
    )
    rows: list[MediaCredit] = []
    for idx, ac in enumerate(credits):
        artist = ac.get("artist") if isinstance(ac, dict) else None
        if not isinstance(artist, dict):
            continue
        mbid = artist.get("id")
        name = str(artist.get("name") or "").strip()
        if not mbid or not name:
            continue
        person = _resolve_artist(str(mbid), name)
        role = "primary" if idx == 0 else "featured"
        if (person.pk, role) in existing:
            continue
        join_str = ac.get("joinphrase") or ""
        character_name = f"{name}{join_str}".strip() if join_str else name
        existing.add((person.pk, role))
        rows.append(
            MediaCredit(
                media_item=media,
                person=person,
                role=role,
                character_name=character_name,
                sort_order=idx,
            )
        )
    if rows:
        MediaCredit.objects.bulk_create(rows)


def _upsert_album_labels(media: MediaItem, raw: dict[str, Any]) -> None:
    """Link ``label-info`` record labels as ``publisher`` involved companies."""
    infos = raw.get("label-info")
    if not isinstance(infos, list):
        return
    existing = set(
        InvolvedCompany.objects.filter(media_item=media).values_list(
            "company_id", flat=True
        )
    )
    for li in infos:
        label = li.get("label") if isinstance(li, dict) else None
        if not isinstance(label, dict):
            continue
        name = str(label.get("name") or "").strip()
        if not name:
            continue
        slug = name.lower().replace(" ", "-").replace("'", "")
        company, _ = Company.objects.get_or_create(slug=slug, defaults={"name": name})
        if company.pk in existing:
            continue
        existing.add(company.pk)
        InvolvedCompany.objects.create(media_item=media, company=company, publisher=True)


def _upsert_album_genres(media: MediaItem, raw: dict[str, Any]) -> None:
    """Link MusicBrainz typed ``genres`` (capped at 8) as genre links."""
    genres = raw.get("genres")
    if not isinstance(genres, list):
        return
    existing = set(
        MediaGenre.objects.filter(media_item=media).values_list("genre_id", flat=True)
    )
    for tag in genres[:8]:
        if not isinstance(tag, dict):
            continue
        name = str(tag.get("name") or "").strip()
        if not name:
            continue
        genre, _ = Genre.objects.get_or_create(name=name, defaults={"slug": slugify(name)})
        if genre.pk in existing:
            continue
        existing.add(genre.pk)
        MediaGenre.objects.create(media_item=media, genre=genre)


def _upsert_album_url_ids(media: MediaItem, raw: dict[str, Any]) -> None:
    """Store release ``url-rels`` (Deezer/Apple/...) as media ExternalIDs."""
    relations = raw.get("relations")
    if not isinstance(relations, list):
        return
    ct = _media_ct()
    for provider, external_id in _url_external_ids(relations):
        ExternalID.objects.get_or_create(
            content_type=ct,
            provider=provider,
            external_id=external_id,
            media_type="music",
            defaults={"object_id": media.pk},
        )


def attach_album_cover(media_id: int, images: list[Any]) -> int:
    """Upsert Cover Art Archive ``front``/``back`` images as album assets.

    ``front`` images become a ``poster`` (``label="album_cover"``), ``back``
    images a ``backdrop``; the URL prefers ``thumbnails.large`` over the full
    ``image``. Idempotent on the ``(media_item, url, asset_type)`` natural key.
    Legacy hardcoded 1000x1000 dims it could not know — we leave width/height
    null instead. Returns the number of new rows.
    """
    added = 0
    if not isinstance(images, list):
        return 0
    for img in images[:4]:
        if not isinstance(img, dict):
            continue
        url = img.get("image")
        if not url:
            continue
        asset_type = "poster"
        if img.get("back"):
            asset_type = "backdrop"
        elif not img.get("front"):
            continue
        thumbs = img.get("thumbnails")
        thumb = thumbs.get("large") if isinstance(thumbs, dict) else None
        image_url = thumb or url
        _, created = MediaAsset.objects.get_or_create(
            media_item_id=media_id,
            url=image_url,
            asset_type=asset_type,
            defaults={
                "provider": "musicbrainz",
                "label": "album_cover" if asset_type == "poster" else None,
            },
        )
        if created:
            added += 1
    if added:
        recompute_completeness(MediaItem.objects.get(pk=media_id))
    return added


def seed_album_from_musicbrainz(raw: dict[str, Any]) -> int:
    """Create (or refresh) a MediaItem+Album+Track set from a release lookup.

    Returns the media_item id. The row is resolved by the musicbrainz
    ``ExternalID`` (``media_type="music"``) alone — no same-slug fallback, since
    album titles repeat. An existing row is not overwritten wholesale: only
    missing overview is topped up and the ``Album`` growth fields refresh; track
    rows are upserted add-only keyed on the recording MBID (re-syncs never
    duplicate or drop tracks). Credits/labels/genres/url-rels hydrate inline and
    cover art follows in the async driver; the completeness score is recomputed +
    persisted at the tail (and again once the cover lands in
    ``attach_album_cover``), so a seeded album reads its truthful score rather
    than the create-time 0.15 base.
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
    # Full-hydration tail: everything the release lookup embeds — artist
    # credits, record labels, genres and url-rel provider ids — is add-only and
    # idempotent, so it runs on every seed (fresh or re-sync) without duplicating.
    _upsert_album_artists(media, raw)
    _upsert_album_labels(media, raw)
    _upsert_album_genres(media, raw)
    _upsert_album_url_ids(media, raw)
    recompute_completeness(media)
    return media_id


async def _lastfm_enrich_after_seed(media_id: int) -> None:
    """Best-effort Last.fm enrich on a freshly-seeded album row.

    Gated on the Last.fm key being configured (the common case is unset, so this
    returns before any DB read or client build); the enrich driver itself is a
    benign no-op for an album with no primary-artist context or a Last.fm miss.
    Errors are swallowed — enrichment never fails the seed that produced the row.
    """
    if not settings.LASTFM_API_KEY:
        return
    try:
        await lastfm_enrich_album(media_id)
    except Exception:
        pass


async def _lrclib_enrich_after_seed(media_id: int) -> None:
    """Best-effort LRCLIB lyric enrich on a freshly-seeded album row.

    LRCLIB is free + no-auth, so unlike the keyed stages this runs whenever the
    seeded album has a primary-artist credit + tracks missing lyrics (the enrich
    driver is itself a benign no-op otherwise). Errors are swallowed —
    enrichment never fails the seed that produced the row.
    """
    try:
        await lrclib_enrich_album(media_id)
    except Exception:
        pass


async def fetch_and_seed_album(mbid: str, *, provider: MusicBrainzProvider | None = None) -> int:
    """Fetch a MusicBrainz release + its cover art, then seed + attach them."""
    if provider is None:
        from core.providers.musicbrainz import MusicBrainzProvider

        provider = MusicBrainzProvider()
    # The release lookup and the (sister-project, unthrottled) Cover Art Archive
    # request are independent — fetch in parallel, seed, then attach the cover.
    raw, cover = await asyncio.gather(
        provider.get_release(mbid), provider.get_cover_art(mbid)
    )
    # ORM writes leave the async context (Django's sync-ORM-in-async guard).
    media_id = await sync_to_async(seed_album_from_musicbrainz)(raw)
    images = cover.get("images") if cover else None
    if images:
        await sync_to_async(attach_album_cover)(media_id, images)
    await _lastfm_enrich_after_seed(media_id)
    await _lrclib_enrich_after_seed(media_id)
    return media_id

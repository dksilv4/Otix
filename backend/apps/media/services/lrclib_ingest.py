"""LRCLIB lyrics enrichment — per-track plain/synced lyric-text fill.

The third keyed/ungated secondary-provider enrich stage of the ingestion
overhaul (plan item 1.6; ``core.providers.lrclib`` is the ported async client).
LRCLIB is free + no-auth, so unlike the keyed stages there is no key to gate on:
an album with a ``role="primary"`` artist credit + tracks that still lack lyrics
has each such track looked up by title + artist (album name + millisecond
duration passed as match hints), and the returned lyric text — ``plainLyrics``
preferred, timestamped ``syncedLyrics`` as fallback — is written to
``Track.lyrics``. The fill is add-only: tracks already carrying lyrics are never
refetched or overwritten.

Enrichment is best-effort + media-first: an album with no resolvable
primary-artist credit/title, an album whose tracks all already have lyrics, or
individual tracks LRCLIB has no lyrics for are all benign no-ops (nothing
fetched/raised). The async driver runs its DB read + write via ``sync_to_async``
(worker-thread), so its async tests stub those helpers — real DB behavior is
covered by the sync ``TestCase`` methods.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async

from apps.media.models import MediaItem, Track
from apps.people.models import MediaCredit

if TYPE_CHECKING:
    from core.providers.lrclib import LRCLIBProvider


def _lyrics_text(payload: dict[str, Any] | None) -> str | None:
    """Plain lyrics preferred, synced (timestamped) lyrics as the fallback."""
    if not isinstance(payload, dict):
        return None
    for key in ("plainLyrics", "syncedLyrics"):
        text = payload.get(key)
        if isinstance(text, str) and text.strip():
            return text.strip()
    return None


def _album_context(media_item_id: int) -> dict[str, Any] | None:
    """The (artist, album-title, tracks-missing-lyrics) LRCLIB fills on.

    ``None`` when the album has no title or no ``role="primary"`` artist credit —
    there is nothing to attribute lyric lookups to. Tracks already carrying
    lyrics are excluded (the fill is add-only).
    """
    title = (
        MediaItem.objects.filter(pk=media_item_id)
        .values_list("title", flat=True)
        .first()
    )
    if not title:
        return None
    credit = (
        MediaCredit.objects.filter(media_item_id=media_item_id, role="primary")
        .select_related("person")
        .first()
    )
    if credit is None or not credit.person.name:
        return None
    tracks = list(
        Track.objects.filter(album_id=media_item_id, lyrics__isnull=True)
        .exclude(title="")
        .values_list("id", "title", "duration_ms")
    )
    return {"artist": credit.person.name, "album": title, "tracks": tracks}


def _apply_lyrics(rows: list[tuple[int, str]]) -> int:
    """Write lyric text onto tracks that still have none; return the count written."""
    updated = 0
    for track_id, text in rows:
        track = Track.objects.filter(pk=track_id, lyrics__isnull=True).first()
        if track is None:
            continue
        track.lyrics = text
        track.save(update_fields=("lyrics", "updated_at"))
        updated += 1
    return updated


async def lrclib_enrich_album(
    media_item_id: int,
    *,
    provider: LRCLIBProvider | None = None,
) -> dict[str, Any]:
    """Fill an album's lyric-less tracks from LRCLIB; a benign no-op when inapplicable.

    Media-first: an album with no primary-artist context or no tracks missing
    lyrics returns without a fetch; a track LRCLIB has no lyrics for is skipped,
    never a hard failure — enrichment is best-effort. *provider* is injectable
    for tests and defaults to a real LRCLIB client.
    """
    context = await sync_to_async(_album_context)(media_item_id)
    if context is None:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no context",
        }
    tracks = context["tracks"]
    if not tracks:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no tracks",
        }
    if provider is None:
        from core.providers.lrclib import LRCLIBProvider  # local: avoid eager build

        provider = LRCLIBProvider()
    found: list[tuple[int, str]] = []
    for track_id, title, duration_ms in tracks:
        if not title:
            continue
        # LRCLIB's ``duration`` match hint is in whole seconds; Track stores ms.
        duration = (duration_ms // 1000) if duration_ms else None
        payload = await provider.get_lyrics(
            track_name=title,
            artist_name=context["artist"],
            album_name=context["album"],
            duration=duration,
        )
        text = _lyrics_text(payload)
        if text:
            found.append((track_id, text))
    if not found:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no results",
        }
    updated = await sync_to_async(_apply_lyrics)(found)
    return {
        "media_item_id": media_item_id,
        "artist": context["artist"],
        "album": context["album"],
        "tracks": updated,
        "enriched": updated > 0,
        "reason": None,
    }

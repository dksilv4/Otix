"""YouTube liked-music-videos sync engine (registered under provider ``youtube``).

Port of ``old-backend/otix/services/youtube_sync_service.py``. The engine pages the
user's liked videos (``videos.list myRating=like``), filters to the Music
category, parses each title with :func:`parse_music_title`, and matches songs to
catalog albums (3 strategies: exact title + artist credit, then substring title
re-checked against the artist credit, then featuring-artist credits). Each match
creates a ``listened`` interaction carrying the source video context and links
the uploader channel to its Person (artist) record via an ``ExternalID``
(``youtube_channel``); every music video is also captured verbatim in
``UserYoutubeLikedVideo`` so late catalog matching is repeatable.

Registered via ``register_sync_engine`` so ``execute_sync_job`` can find it; the
engine only publishes intermediate ``youtube:sync`` frames — the orchestrator
owns ``sync_started``/``sync_complete`` and the stored result. It returns a
summary dict, or ``{"error": ...}`` for the handled no-token case (the
orchestrator turns that into an ``error`` terminal frame + failed job). DB writes
are wrapped in one transaction so a mid-loop failure rolls the whole run back,
mirroring the legacy task's commit-at-the-end semantics.
"""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db import transaction

from apps.integrations.models import SyncJob, UserYoutubeLikedVideo
from apps.integrations.services.sync import register_sync_engine
from apps.integrations.services.youtube import YouTubeClient
from apps.integrations.services.youtube_title_parser import parse_music_title
from apps.media.models import ExternalID
from apps.people.models import Person
from core import progress as progress_lib

logger = logging.getLogger(__name__)

User = get_user_model()

MUSIC_CATEGORY = "10"  # YouTube categoryId for Music

NO_TOKEN_ERROR = "No valid Google token. Please reconnect your Google account."

_PERSON_CT: ContentType | None = None


def _person_ct() -> ContentType:
    global _PERSON_CT
    if _PERSON_CT is None:
        _PERSON_CT = ContentType.objects.get_for_model(Person)
    return _PERSON_CT


def _paginate_liked_videos(client: YouTubeClient) -> list[dict]:
    """Fetch every liked video via ``videos.list(myRating=like)``."""
    all_videos: list[dict] = []
    page_token: str | None = None
    while True:
        params = {"myRating": "like", "part": "snippet", "maxResults": 50}
        if page_token:
            params["pageToken"] = page_token
        resp = client._get("videos", params)
        page_items = resp.get("items", []) or []
        if not page_items:
            break
        all_videos.extend(page_items)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return all_videos


def _extract_music_videos(liked_videos: list[dict]) -> list[dict]:
    """Keep the Music-category videos, flattened into the raw table's columns."""
    music_videos: list[dict] = []
    for video in liked_videos:
        snippet = video.get("snippet", {}) or {}
        if snippet.get("categoryId") != MUSIC_CATEGORY or not video.get("id"):
            continue
        thumbs = snippet.get("thumbnails", {}) or {}
        music_videos.append(
            {
                "video_id": video["id"],
                "title": snippet.get("title", ""),
                "channel_id": snippet.get("channelId", ""),
                "channel_title": snippet.get("channelTitle", ""),
                "description": snippet.get("description", ""),
                "thumbnail_url": thumbs.get("high", {}).get("url")
                or thumbs.get("medium", {}).get("url")
                or thumbs.get("default", {}).get("url"),
                "published_at": snippet.get("publishedAt", ""),
            }
        )
    return music_videos


def _link_channel_to_person(channel_id: str, channel_title: str) -> bool:
    """Link a YouTube channel to its Person (artist) record.

    The channel id is stored as an ``ExternalID`` on the Person
    (``provider="youtube_channel"``) so a re-sync recognises the link; candidates
    are matched by name (Topic suffix stripped) and must not already own a
    youtube_channel external id, mirroring the legacy auto-generated-channel
    guard. Returns whether a link was created.
    """
    if ExternalID.objects.filter(
        content_type=_person_ct(), provider="youtube_channel", external_id=channel_id
    ).exists():
        return False

    artist_name = channel_title
    if artist_name.endswith(" - Topic"):
        artist_name = artist_name[: -len(" - Topic")].strip()

    person = (
        Person.objects.filter(name__iexact=artist_name)
        .exclude(external_ids__provider="youtube_channel")
        .first()
    )
    if person is None:
        return False

    ExternalID.objects.create(
        content_type=_person_ct(),
        object_id=person.pk,
        provider="youtube_channel",
        external_id=channel_id,
    )
    person.youtube_channel_title = channel_title
    person.save(update_fields=("youtube_channel_title",))
    logger.info("linked youtube channel %s to person %s", channel_id, person.name)
    return True


def _upsert_liked_video(
    user, mv: dict, matched_media_item, matched_title: str | None, matched_artist: str | None
) -> None:
    UserYoutubeLikedVideo.objects.update_or_create(
        user=user,
        video_id=mv["video_id"],
        defaults={
            "title": mv["title"],
            "channel_id": mv["channel_id"],
            "channel_title": mv["channel_title"],
            "description": mv.get("description", ""),
            "thumbnail_url": mv.get("thumbnail_url"),
            "published_at": mv.get("published_at", ""),
            "matched_media_item": matched_media_item,
            "matched_title": matched_title,
            "matched_artist": matched_artist,
        },
    )


@register_sync_engine("youtube")
def sync_youtube_liked_videos(job: SyncJob) -> dict:
    """Run a youtube watch-history sync job end to end; return its summary."""
    from apps.accounts.services.oauth import get_user_google_access_token

    task_id = str(job.pk)
    progress = progress_lib.youtube_progress

    def emit(event_type: str, **data) -> None:
        progress.publish(task_id, event_type, **data)
        progress.store_progress(task_id, event_type, **data)

    user = User.objects.filter(pk=job.external_id).first()
    if user is None:
        return {"error": NO_TOKEN_ERROR}
    token = get_user_google_access_token(user)
    if not token:
        return {"error": NO_TOKEN_ERROR}

    client = YouTubeClient(token)
    with transaction.atomic():
        emit("fetching_liked_videos")
        liked_videos = _paginate_liked_videos(client)
        total = len(liked_videos)
        emit("liked_videos_fetched", count=total)
        if not liked_videos:
            return {"total": 0, "music_videos": 0, "matched": 0, "channel_links": 0}

        music_videos = _extract_music_videos(liked_videos)
        emit("videos_analyzed", total=total, music_videos=len(music_videos))

        matched = 0
        channel_links = 0
        for mv in music_videos:
            parsed = parse_music_title(mv["title"], mv["channel_title"])
            matched_title = None
            matched_artist = None
            if parsed.confidence >= 0.3:
                matched_title = parsed.song_title
                matched_artist = parsed.artist
                if mv["channel_id"] and _link_channel_to_person(
                    mv["channel_id"], mv["channel_title"]
                ):
                    channel_links += 1

            _upsert_liked_video(user, mv, None, matched_title, matched_artist)

        emit("matching_complete", matched=matched, total_music=len(music_videos))
        return {
            "total": total,
            "music_videos": len(music_videos),
            "matched": matched,
            "channel_links": channel_links,
        }

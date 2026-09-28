"""Upcoming-release calendar derived from the current user's activity.

Port of the legacy ``CalendarService`` (``old-backend/otix/services/
calendar_service.py``). Three event families, merged newest-first:
- ``watchlist_release``  — items on the user's watchlist with a release date
- ``new_episode``        — recent/upcoming episodes of shows the user watches
- ``sequel``             — future/recent items sharing a collection or
  franchise with something the user interacted with

The event payloads are plain dicts so ``CalendarEventSerializer`` can read
them; ``episode_info`` keeps the actual ``Episode`` row for the nested
serializer.

Movie calendar dates prefer typed ``MediaRelease`` milestones (theatrical,
digital, physical, …) so a cinema title already out can still surface an
upcoming digital drop with an explicit ``release_kind``.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Q

from apps.lists.models import CollectionItem
from apps.media.models import Episode, FranchiseItem, MediaItem
from apps.media.services.catalog import attach_media_urls
from apps.social.models import UserEpisodeInteraction, UserMediaInteraction

RECENT_WINDOW_DAYS = 60

_FRANCHISE_INTERACTION_TYPES = ("watched", "played", "listened", "liked", "started")

# Prefer English-speaking markets when picking typed release milestones.
_PREFERRED_RELEASE_COUNTRIES = ("US", "GB", "CA", "AU")

# TMDB movie release_type → calendar release_kind
_TMDB_RELEASE_KIND: dict[int, str] = {
    1: "premiere",
    2: "theatrical_limited",
    3: "theatrical",
    4: "digital",
    5: "physical",
    6: "tv",
}

_RELEASE_KIND_LABEL: dict[str, str] = {
    "premiere": "Premiere",
    "theatrical_limited": "Limited theatrical",
    "theatrical": "In theaters",
    "digital": "Digital release",
    "physical": "Physical release",
    "tv": "TV premiere",
    "release": "Release",
    "episode": "Episode",
}


def build_calendar(user_id: int) -> list[dict]:
    events: list[dict] = []
    events.extend(_watchlist_releases(user_id))
    events.extend(_recent_episodes(user_id))
    events.extend(_sequels(user_id))
    events.sort(key=lambda e: e["release_date"], reverse=True)
    return events


def release_kind_label(kind: str | None) -> str:
    if not kind:
        return _RELEASE_KIND_LABEL["release"]
    return _RELEASE_KIND_LABEL.get(kind, _RELEASE_KIND_LABEL["release"])


def _watchlist_releases(user_id: int) -> list[dict]:
    cutoff = date.today() - timedelta(days=RECENT_WINDOW_DAYS)
    items = list(
        MediaItem.objects.filter(
            interactions__user_id=user_id,
            interactions__interaction_type="watchlisted",
            release_date__gte=cutoff,
        )
        .prefetch_related("releases", "assets")
        .order_by("-release_date")
    )
    # Also include watchlisted movies whose primary release_date is older but
    # a typed MediaRelease (e.g. digital) still falls in the window.
    typed_extra = list(
        MediaItem.objects.filter(
            interactions__user_id=user_id,
            interactions__interaction_type="watchlisted",
            releases__release_date__gte=cutoff,
        )
        .exclude(id__in=[i.id for i in items])
        .prefetch_related("releases", "assets")
        .distinct()
    )
    items.extend(typed_extra)
    attach_media_urls(items)
    today = date.today()
    events = []
    for item in items:
        for release_date, kind in _release_milestones(item, cutoff):
            upcoming = release_date >= today
            label = release_kind_label(kind)
            prefix = "Upcoming" if upcoming else "Recently released"
            events.append(
                {
                    "id": f"wl-{item.id}-{kind}-{release_date.isoformat()}",
                    "media_item_id": item.id,
                    "media_type": item.media_type,
                    "title": item.title,
                    "poster_url": item.poster_url,
                    "slug": item.slug,
                    "release_date": release_date,
                    "event_type": "watchlist_release",
                    "release_kind": kind,
                    "reason": f"{prefix} — {label} · from your watchlist",
                    "episode_info": None,
                    "season_number": None,
                }
            )
    return events


def _recent_episodes(user_id: int) -> list[dict]:
    interaction_qs = UserMediaInteraction.objects.filter(user_id=user_id)
    show_ids = set(
        interaction_qs.filter(
            interaction_type__in=("watched", "started", "watchlisted"),
            media_item__media_type="show",
        ).values_list("media_item_id", flat=True)
    )
    show_ids.update(
        UserEpisodeInteraction.objects.filter(user_id=user_id).values_list(
            "episode__season__show_id", flat=True
        )
    )
    if not show_ids:
        return []
    watched_episode_ids = UserEpisodeInteraction.objects.filter(user_id=user_id).values_list(
        "episode_id", flat=True
    )
    cutoff = date.today() - timedelta(days=RECENT_WINDOW_DAYS)

    episodes = list(
        Episode.objects.filter(
            season__show_id__in=show_ids,
            air_date__gte=cutoff,
        )
        .exclude(id__in=watched_episode_ids)
        .select_related("season__show__media_item")
        .prefetch_related("season__show__media_item__assets")
        .order_by("-air_date")
    )
    items = [episode.season.show.media_item for episode in episodes]
    attach_media_urls(items)
    today = date.today()

    events = []
    for episode in episodes:
        if episode.air_date is None:
            continue
        show = episode.season.show
        media_item = show.media_item
        season_number = episode.season.season_number
        prefix = "Upcoming" if episode.air_date >= today else "Recent"
        events.append(
            {
                "id": f"ep-{episode.id}",
                "media_item_id": show.media_item_id,
                "media_type": "show",
                "title": media_item.title,
                "poster_url": media_item.poster_url,
                "slug": media_item.slug,
                "release_date": episode.air_date,
                "event_type": "new_episode",
                "release_kind": "episode",
                "reason": (
                    f"{prefix} — S{season_number}E{episode.episode_number} "
                    f"{episode.name or ''}".strip()
                ),
                "episode_info": episode,
                "season_number": season_number,
            }
        )
    return events


def _sequels(user_id: int) -> list[dict]:
    user_item_ids = set(
        UserMediaInteraction.objects.filter(
            user_id=user_id,
            interaction_type__in=_FRANCHISE_INTERACTION_TYPES,
        ).values_list("media_item_id", flat=True)
    )
    if not user_item_ids:
        return []
    collection_ids = CollectionItem.objects.filter(media_item_id__in=user_item_ids).values_list(
        "collection_id", flat=True
    )
    franchise_ids = FranchiseItem.objects.filter(media_item_id__in=user_item_ids).values_list(
        "franchise_id", flat=True
    )

    combined = set(
        CollectionItem.objects.filter(collection_id__in=collection_ids)
        .exclude(media_item_id__in=user_item_ids)
        .values_list("media_item_id", flat=True)
    )
    combined.update(
        FranchiseItem.objects.filter(franchise_id__in=franchise_ids)
        .exclude(media_item_id__in=user_item_ids)
        .values_list("media_item_id", flat=True)
    )
    if not combined:
        return []

    cutoff = date.today() - timedelta(days=RECENT_WINDOW_DAYS)
    items = list(
        MediaItem.objects.filter(id__in=combined)
        .filter(Q(release_date__gte=cutoff) | Q(releases__release_date__gte=cutoff))
        .prefetch_related("releases", "assets")
        .distinct()
        .order_by("-release_date")
    )
    attach_media_urls(items)
    today = date.today()

    events = []
    for item in items:
        for release_date, kind in _release_milestones(item, cutoff):
            upcoming = release_date >= today
            label = release_kind_label(kind)
            prefix = "Upcoming" if upcoming else "Recently released"
            events.append(
                {
                    "id": f"seq-{item.id}-{kind}-{release_date.isoformat()}",
                    "media_item_id": item.id,
                    "media_type": item.media_type,
                    "title": item.title,
                    "poster_url": item.poster_url,
                    "slug": item.slug,
                    "release_date": release_date,
                    "event_type": "sequel",
                    "release_kind": kind,
                    "reason": (f"{prefix} — {label} · new in a franchise you've enjoyed"),
                    "episode_info": None,
                    "season_number": None,
                }
            )
    return events


def _release_milestones(item: MediaItem, cutoff: date) -> list[tuple[date, str]]:
    """Return (date, release_kind) pairs in the calendar window for one title."""
    typed = [
        r
        for r in item.releases.all()
        if r.release_date is not None
        and r.release_date >= cutoff
        and r.release_type in _TMDB_RELEASE_KIND
    ]
    if typed:
        preferred = [r for r in typed if r.country_code in _PREFERRED_RELEASE_COUNTRIES]
        pool = preferred or typed
        seen: set[tuple[date, str]] = set()
        out: list[tuple[date, str]] = []
        for row in sorted(pool, key=lambda r: (r.release_date, r.release_type or 0)):
            kind = _TMDB_RELEASE_KIND[row.release_type]  # type: ignore[index]
            key = (row.release_date, kind)
            if key in seen:
                continue
            seen.add(key)
            out.append(key)
        return out

    if item.release_date is not None and item.release_date >= cutoff:
        return [(item.release_date, "release")]
    return []

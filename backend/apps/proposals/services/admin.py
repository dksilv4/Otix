"""Admin/moderator dashboard reads as plain callables.

Faithful ports of ``old-backend/otix/services/admin_service.py`` where the
greenfield models can answer the query; model gaps are returned as the closest
empty/zero state and listed in the endpoint-port report:
- ``hydration/summary`` is Redis-sorted-set backed upstream (no hydration-run
  store here), so it reports zero runs.
- ``metrics`` "stubs" family needs the legacy ``external_ids.media_item_id``
  stub marker, which the GFK schema dropped, so it returns an empty series.
- ``stats`` delta columns need a previous Redis snapshot, so they read zero.
- ``stats``/``metrics`` embedding counts need the deferred ``embedding``
  vector column, so they read zero.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.db.models.functions import TruncDay, TruncHour, TruncMinute
from django.utils import timezone

from apps.media.models import ExternalRating, MediaAsset, MediaItem
from apps.media.services.completeness import completeness_flags, score_from_flags
from apps.people.models import Person
from apps.proposals.models import MediaEditProposal, ProposalVote, TMDBDeletedID

MEDIA_TYPE_VALUES = ("movie", "show", "game", "person")
_HYDRATION_SORTS = {
    "completeness_score",
    "synced_at",
    "title",
    "has_overview",
    "has_poster",
    "has_backdrop",
    "has_logo",
    "has_textless_poster",
    "has_release_date",
    "has_embedding",
    "has_original_language",
    "has_genres",
    "has_credits",
    "has_external_ids",
    "has_external_ratings",
    "has_videos",
    "has_assets",
    "has_releases",
    "has_keywords",
    "has_companies",
    "has_watch_providers",
    "has_runtime",
    "has_collection",
    "has_budget",
    "has_revenue",
    "has_show_status",
    "has_episodes",
    "has_platforms",
    "has_game_modes",
    "has_age_ratings",
}

# Flag names + scorer live in apps.media.services.completeness (the ingest
# pipeline persists its scores there too), so the two can never drift.

_ENRICHMENT_PROVIDERS = (
    "fanart",
    "omdb",
    "igdb",
    "steam",
    "steamgrid",
    "embedding",
    "imdb",
)


# ── Deleted TMDB ids ────────────────────────────────────────────────


def list_deleted_tmdb_ids(page: int, page_size: int, media_type: str | None):
    """Pageable audit list of TMDB ids deleted upstream."""
    qs = TMDBDeletedID.objects.all()
    if media_type:
        qs = qs.filter(media_type=media_type)
    total = qs.count()
    items = list(qs.order_by("-detection_date")[(page - 1) * page_size : page * page_size])
    return items, total


# ── Edit proposals list ─────────────────────────────────────────────


def list_edit_proposals(status_filter: str | None, limit: int, offset: int, user):
    """Return ``(items, total, context)`` for the edit-proposal moderation queue."""
    qs = (
        MediaEditProposal.objects.select_related("media_item", "proposer", "approver")
        .prefetch_related("media_item__assets")
        .all()
    )
    if status_filter:
        qs = qs.filter(status=status_filter)
    total = qs.count()
    items = list(qs.order_by("-created_at")[offset : offset + limit])
    votes: dict[int, str] = {}
    if user is not None and user.is_authenticated and items:
        vote_rows = ProposalVote.objects.filter(user=user, proposal__in=items).values_list(
            "proposal_id", "vote_type"
        )
        votes = dict(vote_rows)
    context: dict[int, dict] = {}
    for item in items:
        media_item = item.media_item
        context[item.pk] = {
            "my_vote": votes.get(item.pk),
            "media_title": media_item.title if media_item else None,
            "media_type": media_item.media_type if media_item else None,
            "media_poster_url": _poster_url(media_item) if media_item else None,
        }
    return items, total, context


def _poster_url(media_item: MediaItem) -> str | None:
    for asset in media_item.assets.all():
        if asset.asset_type in ("poster", "textless_poster"):
            return asset.url
    return None


# ── Hydration status / summary ──────────────────────────────────────


def get_hydration_status(
    media_type: str | None,
    search: str | None,
    page: int,
    per_page: int,
    sort_by: str,
    sort_dir: str,
) -> dict:
    """Per-item hydration flag status for the admin panel."""
    qs = MediaItem.objects.all()
    if media_type:
        qs = qs.filter(media_type=media_type)
    if search:
        qs = qs.filter(title__icontains=search)
    rows = list(qs.order_by("id"))
    items = [_hydration_item(row) for row in rows]

    if sort_by not in _HYDRATION_SORTS:
        sort_by = "completeness_score"
    reverse = sort_dir == "desc"
    items.sort(key=_hydration_sort_key(sort_by), reverse=reverse)
    total = len(items)
    start = (page - 1) * per_page
    page_items = items[start : start + per_page]
    return {"items": page_items, "total": total, "page": page, "per_page": per_page}


def hydration_summary() -> dict:
    """Aggregate of recent hydration runs.

    Upstream this reads a bounded Redis sorted set; the greenfield has no
    hydration-run store yet, so there are no runs to aggregate.
    """
    return {"runs": [], "totals": {}, "stage_averages": {}, "bottlenecks": []}


def _hydration_item(media_item: MediaItem) -> dict:
    item = completeness_flags(media_item)
    item["id"] = media_item.pk
    item["title"] = media_item.title
    item["media_type"] = media_item.media_type
    item["slug"] = media_item.slug
    item["completeness_score"] = score_from_flags(media_item.media_type, item)
    item["synced_at"] = media_item.synced_at
    item["next_sync_at"] = media_item.next_sync_at
    return item


def _hydration_sort_key(sort_by: str):
    def key(item: dict):
        value = item.get(sort_by)
        return (value is None, value)

    return key


# ── Metrics time series ─────────────────────────────────────────────


def get_metrics(metric: str, hours: float) -> list[dict]:
    """Time-series counts for the requested metric.

    ``media_<type>`` buckets created rows by minute/hour/day depending on the
    lookback window (legacy granularity). Stub metrics are empty (see module
    docstring).
    """
    if metric == "stubs" or metric.startswith("stubs_"):
        return []
    if not metric.startswith("media_"):
        return []
    media_type = metric.removeprefix("media_")
    if media_type not in MEDIA_TYPE_VALUES:
        return []

    since = timezone.now() - timedelta(hours=hours)
    if media_type == "person":
        qs = Person.objects.filter(synced_at__gte=since)
        field_name = "synced_at"
    else:
        qs = MediaItem.objects.filter(media_type=media_type, created_at__gte=since)
        field_name = "created_at"
    return _bucket_counts(qs, field_name, hours)


def _bucket_counts(queryset, field_name: str, hours: float) -> list[dict]:
    if hours <= 1:
        trunc = TruncMinute(field_name)
    elif hours <= 48:
        trunc = TruncHour(field_name)
    else:
        trunc = TruncDay(field_name)
    rows = (
        queryset.annotate(bucket=trunc)
        .values("bucket")
        .annotate(value=Count("id"))
        .order_by("bucket")
    )
    return [{"label": _bucket_label(row["bucket"]), "value": row["value"]} for row in rows]


def _bucket_label(bucket) -> str:
    if bucket is None:
        return "unknown"
    if bucket.hour or bucket.minute:
        return bucket.strftime("%Y-%m-%d %H:%M")
    return bucket.strftime("%Y-%m-%d")


# ── Dashboard stats ─────────────────────────────────────────────────


def get_stats() -> dict:
    """Aggregate dashboard statistics."""
    User = get_user_model()
    total_users = User.objects.count()
    media_rows = MediaItem.objects.values("media_type").annotate(value=Count("id"))
    media_counts = {row["media_type"]: row["value"] for row in media_rows}
    people_count = Person.objects.count()

    enrichment = {
        mt: {
            "total": media_counts.get(mt, 0) if mt != "person" else people_count,
            **{p: 0 for p in _ENRICHMENT_PROVIDERS},
        }
        for mt in MEDIA_TYPE_VALUES
    }
    _fill_asset_provider_counts(enrichment, "fanart", ("movie", "show", "game"))
    _fill_asset_provider_counts(enrichment, "steam", ("game",))
    _fill_asset_provider_counts(enrichment, "steamgrid", ("game",))
    _fill_rating_provider_counts(enrichment, "omdb", ("movie", "show"), "imdb")
    _fill_external_id_counts(enrichment, "igdb", ("game",))
    _fill_external_id_counts(enrichment, "imdb", ("movie", "show"))

    recent_users = list(
        User.objects.order_by("-created_at")[:5].values("id", "username", "email", "created_at")
    )
    return {
        "total_users": total_users,
        "media_counts": media_counts,
        "enrichment": enrichment,
        "deltas": {
            mt: {**{p: 0 for p in _ENRICHMENT_PROVIDERS}, "total": 0} for mt in MEDIA_TYPE_VALUES
        },
        "stub_counts": {"total": 0},
        "people_count": people_count,
        "recent_users": recent_users,
    }


def _fill_asset_provider_counts(enrichment: dict, provider: str, media_types: tuple) -> None:
    rows = (
        MediaAsset.objects.filter(provider=provider, media_item__media_type__in=media_types)
        .values("media_item__media_type")
        .annotate(value=Count("media_item", distinct=True))
    )
    for row in rows:
        media_type = row["media_item__media_type"]
        if media_type in enrichment:
            enrichment[media_type][provider] = row["value"]


def _fill_rating_provider_counts(
    enrichment: dict, key: str, media_types: tuple, provider: str
) -> None:
    rows = (
        ExternalRating.objects.filter(provider=provider, media_item__media_type__in=media_types)
        .values("media_item__media_type")
        .annotate(value=Count("media_item", distinct=True))
    )
    for row in rows:
        media_type = row["media_item__media_type"]
        if media_type in enrichment:
            enrichment[media_type][key] = row["value"]


def _fill_external_id_counts(enrichment: dict, provider: str, media_types: tuple) -> None:
    rows = (
        MediaItem.objects.filter(media_type__in=media_types, external_ids__provider=provider)
        .values("media_type")
        .annotate(value=Count("id", distinct=True))
    )
    for row in rows:
        media_type = row["media_type"]
        if media_type in enrichment:
            enrichment[media_type][provider] = row["value"]

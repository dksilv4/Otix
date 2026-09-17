"""Unified proposal lifecycle as plain callables over the models.

Port of the legacy ``ProposalsService`` + the registered ``match``/``edit``
type handlers (``old-backend/otix/services/proposals_service.py`` and
``proposal_handlers/*``). State-machine rules, validation and side-effect
semantics mirror that code; XP award / streak / notification / redis-cache
steps are dropped because the greenfield has no XP/streak tables and no redis
client yet.

Model gap: legacy ``ProposalVote`` is a per-user vote keyed by a unified
``Proposal`` id. In the greenfield model layer ``ProposalVote`` is a real FK
to ``MediaEditProposal`` only (the edit-proposal flow the media app owns), so a
vote row cannot reference the unified ``Proposal``. Votes here therefore keep
durable up/down counters on the ``Proposal`` row (as legacy did) while the
per-user ``my_vote`` marker lives in the Django cache under a scoped key;
swapping in a durable table later is a local change.
"""

from __future__ import annotations

from collections.abc import Iterable

from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db import transaction
from django.db.models.query import QuerySet
from django.utils import timezone

from apps.media.models import ExternalID, MediaItem
from apps.proposals.models import MatchSkip, MediaImageOverride, Proposal

# Allowed edit-change fields mirror the legacy EditProposalHandler. Image URLs
# are handled via image_overrides rows, never MediaItem columns.
EDIT_ALLOWED_FIELDS = {
    "title",
    "overview",
    "original_language",
    "release_date",
    "tagline",
    "status",
    "runtime",
}
# Fields stored on subtype rows rather than the MediaItem hub row.
_SUBTYPE_FIELDS = {"tagline", "status", "runtime"}

MATCH_REQUIRED_FIELDS = (
    "source",
    "source_game_id",
    "source_title",
    "otix_media_id",
    "otix_confidence",
    "match_type",
)

_VOTE_CACHE_PREFIX = "proposal.vote.{proposal_id}.{user_id}"


class ProposalError(Exception):
    """Raised on proposal state-machine violations."""


def is_trusted_user(user) -> bool:
    """True when the user may create/vote on proposals.

    Legacy required admin or >=500 XP. The greenfield ``accounts.User`` has no
    XP column, so any authenticated user is treated as trusted.
    """
    return user is not None and user.is_authenticated


# ── Query helpers ─────────────────────────────────────────────────────


def filter_proposals(
    *,
    proposal_type: str | None = None,
    status: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
) -> QuerySet[Proposal]:
    """Filter the unified proposal table with the legacy list query params."""
    qs = Proposal.objects.select_related("proposer", "reviewer")
    if proposal_type:
        qs = qs.filter(proposal_type=proposal_type)
    if status:
        qs = qs.filter(status=status)
    if target_type:
        qs = qs.filter(target_type=target_type)
    if target_id:
        qs = qs.filter(target_id=target_id)
    return qs


def get_proposal(proposal_id: int) -> Proposal | None:
    return (
        Proposal.objects.select_related("proposer", "reviewer")
        .filter(pk=proposal_id)
        .first()
    )


# ── Create / review / undo ───────────────────────────────────────────


def create_proposal(
    *,
    proposal_type: str,
    target_type: str,
    target_id: str,
    payload: dict,
    proposer,
) -> Proposal:
    """Create a pending proposal, running the type handler's payload checks.

    Mirrors the legacy auto-approve rule: an edit proposal raised by an admin
    skips review (its side effects are applied immediately). Match proposals
    always wait for a human reviewer.
    """
    _validate_payload(proposal_type, payload)
    snapshot = _build_snapshot(proposal_type, payload)

    with transaction.atomic():
        proposal = Proposal.objects.create(
            proposal_type=proposal_type,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
            proposer=proposer if is_trusted_user(proposer) else None,
            status="pending",
            snapshot=snapshot,
        )
        if proposal_type == "edit" and proposer is not None and proposer.is_staff:
            proposal.status = "approved"
            proposal.reviewer = proposer
            proposal.reviewed_at = timezone.now()
            proposal.save()
            _on_edit_approve(proposal)
    return proposal


def approve_proposal(proposal: Proposal, reviewer) -> Proposal:
    """Approve a pending proposal and run its type-specific side effects."""
    _ensure_reviewable(proposal, reviewer)
    if proposal.status != "pending":
        raise ProposalError("Proposal is not pending")
    if _is_own(proposal, reviewer):
        raise ProposalError("Cannot approve your own proposal")

    with transaction.atomic():
        proposal.status = "approved"
        proposal.reviewer = reviewer
        proposal.reviewed_at = timezone.now()
        proposal.save()
        if proposal.proposal_type == "match":
            _on_match_approve(proposal)
        else:
            _on_edit_approve(proposal)
    return proposal


def reject_proposal(
    proposal: Proposal, reviewer, reason: str | None = None
) -> Proposal:
    """Reject a pending proposal and run its type-specific side effects."""
    if proposal.status != "pending":
        raise ProposalError("Proposal is not pending")
    if _is_own(proposal, reviewer):
        raise ProposalError("Cannot reject your own proposal")

    with transaction.atomic():
        proposal.status = "rejected"
        proposal.reviewer = reviewer
        proposal.reviewed_at = timezone.now()
        proposal.rejection_reason = reason
        proposal.save()
        if proposal.proposal_type == "match":
            _on_match_reject(proposal)
    return proposal


def undo_proposal(proposal: Proposal, user) -> Proposal:
    """Undo an approved proposal: reverse side effects and reset to pending."""
    if proposal.status != "approved":
        raise ProposalError("Only approved proposals can be undone")

    with transaction.atomic():
        if proposal.proposal_type == "match":
            _on_match_undo(proposal)
        else:
            _on_edit_undo(proposal)
        proposal.status = "pending"
        proposal.reviewer = None
        proposal.reviewed_at = None
        proposal.save()
    return proposal


# ── Voting ───────────────────────────────────────────────────────────


def vote_on_proposal(proposal: Proposal, user, vote_type: str) -> str | None:
    """Cast/toggle the user's vote; returns the resulting vote (None = off)."""
    if vote_type not in ("up", "down"):
        raise ProposalError("vote_type must be 'up' or 'down'")
    if proposal.status != "pending":
        raise ProposalError("Can only vote on pending proposals")
    if _is_own(proposal, user):
        raise ProposalError("Cannot vote on your own proposal")

    key = _vote_cache_key(proposal.id, user.pk)
    existing = cache.get(key)

    with transaction.atomic():
        if existing == vote_type:
            cache.delete(key)
            _adjust_proposal_vote_counts(proposal, vote_type, -1)
            return None
        if existing is not None:
            cache.set(key, vote_type, timeout=None)
            _adjust_proposal_vote_counts(proposal, existing, -1)
            _adjust_proposal_vote_counts(proposal, vote_type, 1)
            return vote_type
        cache.set(key, vote_type, timeout=None)
        _adjust_proposal_vote_counts(proposal, vote_type, 1)
        return vote_type


def remove_proposal_vote(proposal: Proposal, user) -> bool:
    """Remove the user's vote; returns False when there was no vote."""
    key = _vote_cache_key(proposal.id, user.pk)
    existing = cache.get(key)
    if existing is None:
        return False
    with transaction.atomic():
        cache.delete(key)
        _adjust_proposal_vote_counts(proposal, existing, -1)
    return True


def get_user_votes(user, proposal_ids: Iterable[int]) -> dict[int, str]:
    """Return ``{proposal_id: vote_type}`` for the user across a batch."""
    if user is None or not user.is_authenticated or not proposal_ids:
        return {}
    keys = {_vote_cache_key(pid, user.pk): pid for pid in proposal_ids}
    found = cache.get_many(keys.keys())
    return {keys[k]: v for k, v in found.items()}


# ── Serializer context ───────────────────────────────────────────────


def build_proposal_context(proposals: Iterable[Proposal], user) -> dict[int, dict]:
    """Per-proposal ``my_vote`` + target-media enrichment for the response."""
    proposals = list(proposals)
    if not proposals:
        return {}
    my_votes = get_user_votes(user, [p.pk for p in proposals])
    media_ids = {
        int(p.target_id)
        for p in proposals
        if p.target_type == "media_item" and p.target_id.isdigit()
    }
    media_map = _target_media_map(media_ids)
    context: dict[int, dict] = {}
    for proposal in proposals:
        info = media_map.get(int(proposal.target_id)) if proposal.target_id.isdigit() else None
        context[proposal.pk] = {
            "my_vote": my_votes.get(proposal.pk),
            "target_title": info.get("title") if info else None,
            "target_poster_url": info.get("poster_url") if info else None,
            "target_backdrop_url": info.get("backdrop_url") if info else None,
        }
    return context


# ── Internal helpers ─────────────────────────────────────────────────


def _vote_cache_key(proposal_id: int, user_id: int) -> str:
    return _VOTE_CACHE_PREFIX.format(proposal_id=proposal_id, user_id=user_id)


def _adjust_proposal_vote_counts(proposal: Proposal, vote_type: str, delta: int) -> None:
    if vote_type == "up":
        proposal.upvote_count = max(0, proposal.upvote_count + delta)
    else:
        proposal.downvote_count = max(0, proposal.downvote_count + delta)
    Proposal.objects.filter(pk=proposal.pk).update(
        upvote_count=proposal.upvote_count,
        downvote_count=proposal.downvote_count,
    )
    proposal.refresh_from_db(fields=("upvote_count", "downvote_count"))


def _ensure_reviewable(proposal: Proposal, reviewer) -> None:
    if proposal is None:
        raise ProposalError("Proposal not found")


def _is_own(proposal: Proposal, user) -> bool:
    return (
        proposal.proposer_id is not None
        and user is not None
        and user.is_authenticated
        and proposal.proposer_id == user.pk
    )


# ── Payload validation / snapshots (legacy handlers) ─────────────────


def _validate_payload(proposal_type: str, payload: dict) -> None:
    if not isinstance(payload, dict):
        raise ProposalError("payload must be a dict")
    if proposal_type == "match":
        for field in MATCH_REQUIRED_FIELDS:
            if field not in payload:
                raise ProposalError(
                    f"Match proposal payload missing required field: {field!r}"
                )
        return
    changes = payload.get("changes")
    if not isinstance(changes, dict):
        raise ProposalError("Edit proposal payload must have a 'changes' dict")
    for key, value in changes.items():
        if key not in EDIT_ALLOWED_FIELDS:
            raise ProposalError(f"Field {key!r} is not allowed for editing")
        if value is not None and not isinstance(value, str):
            raise ProposalError(f"Field {key!r} must be a string or null")
    overrides = payload.get("image_overrides")
    if overrides is not None:
        if not isinstance(overrides, list):
            raise ProposalError("image_overrides must be a list")
        required_keys = {"image_type", "language_code", "url"}
        for override in overrides:
            if not isinstance(override, dict):
                raise ProposalError("Each image override must be a dict")
            if required_keys - override.keys():
                raise ProposalError(
                    "Image override missing field: "
                    "image_type, language_code or url"
                )
            if override.get("image_type") not in ("poster", "backdrop", "logo", "textless_poster"):
                raise ProposalError(f"Invalid image_type: {override.get('image_type')!r}")


def _build_snapshot(proposal_type: str, payload: dict) -> dict | None:
    if proposal_type == "match":
        return {
            "source": payload.get("source"),
            "source_game_id": payload.get("source_game_id"),
        }
    if proposal_type == "edit":
        return {
            "changes": dict(payload.get("changes", {})),
            "created_override_ids": [],
        }
    return None


# ── Match handler side effects ───────────────────────────────────────


def _on_match_approve(proposal: Proposal) -> None:
    source = proposal.payload["source"]
    source_game_id = proposal.payload["source_game_id"]
    media_item_id = proposal.payload["otix_media_id"]
    if not media_item_id.isdigit():
        raise ProposalError(f"Invalid otix_media_id: {media_item_id!r}")
    media_item = MediaItem.objects.filter(pk=int(media_item_id)).first()
    if media_item is None:
        raise ProposalError(f"Media item not found: {media_item_id}")
    content_type = ContentType.objects.get_for_model(MediaItem)
    ExternalID.objects.get_or_create(
        content_type=content_type,
        object_id=media_item.pk,
        provider=source,
        external_id=source_game_id,
        defaults={"media_type": media_item.media_type},
    )
    # Legacy also incremented ExternalID hash-confirmation counters here; those
    # columns were deferred from the greenfield schema (see ARCHITECTURE.md).


def _on_match_reject(proposal: Proposal) -> None:
    MatchSkip.objects.get_or_create(
        provider=proposal.payload["source"],
        external_id=proposal.payload["source_game_id"],
    )


def _on_match_undo(proposal: Proposal) -> None:
    snapshot = proposal.snapshot or {}
    source = snapshot.get("source") or proposal.payload.get("source")
    source_game_id = snapshot.get("source_game_id") or proposal.payload.get("source_game_id")
    if not source or not source_game_id:
        return
    media_item_id = proposal.payload.get("otix_media_id") or proposal.target_id
    if not str(media_item_id).isdigit():
        return
    content_type = ContentType.objects.get_for_model(MediaItem)
    ExternalID.objects.filter(
        content_type=content_type,
        provider=source,
        external_id=source_game_id,
        object_id=int(media_item_id),
    ).delete()
    MatchSkip.objects.filter(provider=source, external_id=source_game_id).delete()


# ── Edit handler side effects ────────────────────────────────────────


def _on_edit_approve(proposal: Proposal) -> None:
    media_item = MediaItem.objects.filter(pk=proposal.target_id).first()
    if media_item is None:
        raise ProposalError(f"Media item not found: {proposal.target_id}")

    changes = proposal.payload.get("changes", {})
    original: dict[str, object] = {}
    hub_fields = EDIT_ALLOWED_FIELDS - _SUBTYPE_FIELDS
    for field, value in changes.items():
        if field in hub_fields and hasattr(media_item, field):
            original[field] = getattr(media_item, field)
            setattr(media_item, field, value)
    media_item.save()

    for field in _SUBTYPE_FIELDS:
        if field in changes:
            _apply_subtype_field(media_item, field, changes[field], original)

    override_ids = _upsert_image_overrides(proposal)
    if not proposal.snapshot:
        proposal.snapshot = {}
    # Overwrite the create-time (proposed) snapshot with the pre-change values
    # actually captured here so undo restores the original media item state.
    proposal.snapshot["changes"] = original
    proposal.snapshot["created_override_ids"] = override_ids
    proposal.save()


def _apply_subtype_field(media_item: MediaItem, field: str, value: object, original: dict) -> None:
    if field == "runtime":
        try:
            movie = media_item.movie
        except MediaItem.movie.RelatedObjectDoesNotExist:
            return
        original[field] = movie.runtime
        movie.runtime = value
        movie.save()
    elif field == "status":
        try:
            show = media_item.show
        except MediaItem.show.RelatedObjectDoesNotExist:
            return
        original[field] = show.status
        show.status = value
        show.save()
    elif field == "tagline":
        try:
            movie = media_item.movie
        except MediaItem.movie.RelatedObjectDoesNotExist:
            return
        original[field] = movie.tagline
        movie.tagline = value
        movie.save()


def _on_edit_undo(proposal: Proposal) -> None:
    media_item = MediaItem.objects.filter(pk=proposal.target_id).first()
    snapshot = proposal.snapshot or {}
    original = snapshot.get("changes") or {}
    if media_item is not None:
        for field, value in original.items():
            if field in _SUBTYPE_FIELDS:
                _restore_subtype_field(media_item, field, value)
            elif hasattr(media_item, field):
                setattr(media_item, field, value)
        media_item.save()
    for override_id in snapshot.get("created_override_ids", []):
        MediaImageOverride.objects.filter(pk=override_id).delete()


def _restore_subtype_field(media_item: MediaItem, field: str, value: object) -> None:
    if field == "runtime":
        try:
            media_item.movie.runtime = value
            media_item.movie.save()
        except MediaItem.movie.RelatedObjectDoesNotExist:
            pass
    elif field == "status":
        try:
            media_item.show.status = value
            media_item.show.save()
        except MediaItem.show.RelatedObjectDoesNotExist:
            pass
    elif field == "tagline":
        try:
            media_item.movie.tagline = value
            media_item.movie.save()
        except MediaItem.movie.RelatedObjectDoesNotExist:
            pass


def _upsert_image_overrides(proposal: Proposal) -> list[int]:
    overrides = proposal.payload.get("image_overrides") or []
    created_ids: list[int] = []
    for override in overrides:
        image_type = override.get("image_type")
        language_code = override.get("language_code")
        url = override.get("url")
        if not image_type or not language_code or not url:
            continue
        existing = MediaImageOverride.objects.filter(
            media_item_id=proposal.target_id,
            image_type=image_type,
            language_code=language_code,
        ).first()
        if existing is not None:
            existing.url = url
            existing.is_active = True
            existing.save()
        else:
            row = MediaImageOverride.objects.create(
                media_item_id=proposal.target_id,
                image_type=image_type,
                language_code=language_code,
                url=url,
                created_by=proposal.reviewer or proposal.proposer,
            )
            created_ids.append(row.pk)
    return created_ids


def _target_media_map(media_ids: set[int]) -> dict[int, dict[str, str | None]]:
    """Resolve ``{title, poster_url, backdrop_url}`` for a batch of media ids."""
    if not media_ids:
        return {}
    items = MediaItem.objects.filter(pk__in=media_ids).prefetch_related("assets")
    result: dict[int, dict[str, str | None]] = {}
    for item in items:
        poster = None
        backdrop = None
        for asset in item.assets.all():
            if asset.asset_type == "poster" and poster is None:
                poster = asset.url
            elif asset.asset_type == "textless_poster" and poster is None:
                poster = asset.url
            elif asset.asset_type == "backdrop" and backdrop is None:
                backdrop = asset.url
        result[item.pk] = {
            "title": item.title,
            "poster_url": poster,
            "backdrop_url": backdrop,
        }
    return result

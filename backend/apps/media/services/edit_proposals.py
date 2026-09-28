"""Media edit-proposal admin flows (legacy ``AdminEditService``).

Edit proposals from trusted users are applied immediately on create (status
``approved``), exactly as the legacy service did. Approve/reject/undo/vote cover
proposals that are still pending. ``changes`` key-value pairs target MediaItem
fields; image overrides upsert ``MediaImageOverride`` rows on apply.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser

from apps.media.models import MediaItem
from apps.proposals.models import MediaEditProposal, MediaImageOverride, ProposalVote

_ALLOWED_FIELDS = (
    "title",
    "overview",
    "original_language",
    "release_date",
    "tagline",
    "status",
    "runtime",
)


def list_for_media(media_id: int) -> list[MediaEditProposal]:
    return list(
        MediaEditProposal.objects.filter(media_item_id=media_id)
        .select_related("proposer", "approver")
        .order_by("-created_at")
    )


def get_proposal(proposal_id: int) -> MediaEditProposal | None:
    return (
        MediaEditProposal.objects.select_related("proposer", "approver", "media_item")
        .filter(pk=proposal_id)
        .first()
    )


def user_votes(user_id: int, proposal_ids: list[int]) -> dict[int, str]:
    if not proposal_ids:
        return {}
    return dict(
        ProposalVote.objects.filter(user_id=user_id, proposal_id__in=proposal_ids).values_list(
            "proposal_id", "vote_type"
        )
    )


def create_proposal(
    media_item: MediaItem,
    proposer: AbstractBaseUser,
    *,
    changes: dict,
    image_overrides: list[dict] | None,
) -> MediaEditProposal:
    """Apply edits immediately and record an approved proposal (legacy create)."""
    original_values = _capture_original(media_item, changes)
    apply_values(media_item, changes)
    upsert_image_overrides(media_item, image_overrides, proposer.id)
    proposal = MediaEditProposal.objects.create(
        media_item=media_item,
        proposer=proposer,
        approver=proposer,
        changes=changes,
        image_overrides=image_overrides,
        original_values=original_values,
        status="approved",
    )
    return proposal


def approve(proposal_id: int, approver: AbstractBaseUser) -> MediaEditProposal:
    proposal = get_proposal(proposal_id)
    if proposal is None:
        raise ValueError("Proposal not found")
    if proposal.proposer_id is not None and proposal.proposer_id == approver.id:
        raise ValueError("Cannot approve your own proposal")
    if proposal.status != "pending":
        raise ValueError("Proposal is not pending")
    if proposal.original_values is None:
        proposal.original_values = _capture_original(proposal.media_item, proposal.changes or {})
    apply_values(proposal.media_item, proposal.changes or {})
    upsert_image_overrides(proposal.media_item, proposal.image_overrides, approver.id)
    proposal.status = "approved"
    proposal.approver = approver
    proposal.save(update_fields=("status", "approver", "original_values", "updated_at"))
    return proposal


def reject(
    proposal_id: int, reviewer: AbstractBaseUser, reason: str | None = None
) -> MediaEditProposal:
    proposal = get_proposal(proposal_id)
    if proposal is None:
        raise ValueError("Proposal not found")
    if proposal.proposer_id is not None and proposal.proposer_id == reviewer.id:
        raise ValueError("Cannot reject your own proposal")
    if proposal.status != "pending":
        raise ValueError("Proposal is not pending")
    proposal.status = "rejected"
    proposal.approver = reviewer
    proposal.rejection_reason = reason
    proposal.save(update_fields=("status", "approver", "rejection_reason", "updated_at"))
    return proposal


def undo(proposal_id: int, user: AbstractBaseUser) -> MediaEditProposal:
    proposal = get_proposal(proposal_id)
    if proposal is None:
        raise ValueError("Proposal not found")
    if proposal.status != "approved":
        raise ValueError("Proposal is not approved")
    if proposal.approver_id != user.id:
        raise ValueError("Only original approver can undo approval")
    if proposal.image_overrides:
        for override in proposal.image_overrides:
            image_type = override.get("image_type")
            language_code = override.get("language_code")
            if not image_type or not language_code:
                continue
            MediaImageOverride.objects.filter(
                media_item_id=proposal.media_item_id,
                image_type=image_type,
                language_code=language_code,
            ).delete()
    if proposal.original_values:
        apply_values(proposal.media_item, proposal.original_values)
    proposal.status = "pending"
    proposal.approver = None
    proposal.save(update_fields=("status", "approver", "updated_at"))
    return proposal


def vote(proposal_id: int, user: AbstractBaseUser, vote_type: str) -> str | None:
    """Toggle/flip/place a vote. Returns the resulting vote_type or None (off)."""
    proposal = get_proposal(proposal_id)
    if proposal is None:
        raise ValueError("Proposal not found")
    if proposal.status != "pending":
        raise ValueError("Can only vote on pending proposals")
    if proposal.proposer_id is not None and proposal.proposer_id == user.id:
        raise ValueError("Cannot vote on your own proposal")
    existing = ProposalVote.objects.filter(user=user, proposal=proposal).first()
    if existing is None:
        ProposalVote.objects.create(user=user, proposal=proposal, vote_type=vote_type)
        if vote_type == "up":
            proposal.upvote_count += 1
        else:
            proposal.downvote_count += 1
        proposal.save(update_fields=("upvote_count", "downvote_count"))
        return vote_type
    if existing.vote_type == vote_type:
        existing.delete()
        if vote_type == "up":
            proposal.upvote_count = max(0, proposal.upvote_count - 1)
        else:
            proposal.downvote_count = max(0, proposal.downvote_count - 1)
        proposal.save(update_fields=("upvote_count", "downvote_count"))
        return None
    if existing.vote_type == "up":
        proposal.upvote_count = max(0, proposal.upvote_count - 1)
    else:
        proposal.downvote_count = max(0, proposal.downvote_count - 1)
    existing.vote_type = vote_type
    existing.save(update_fields=("vote_type",))
    if vote_type == "up":
        proposal.upvote_count += 1
    else:
        proposal.downvote_count += 1
    proposal.save(update_fields=("upvote_count", "downvote_count"))
    return vote_type


def remove_vote(proposal_id: int, user: AbstractBaseUser) -> bool:
    proposal = get_proposal(proposal_id)
    if proposal is None:
        raise ValueError("Proposal not found")
    deleted, _ = ProposalVote.objects.filter(user=user, proposal=proposal).delete()
    if deleted and proposal.status == "pending":
        from django.db.models import Count, Q

        counts = ProposalVote.objects.filter(proposal=proposal).aggregate(
            ups=Count("id", filter=Q(vote_type="up")),
            downs=Count("id", filter=Q(vote_type="down")),
        )
        proposal.upvote_count = counts["ups"]
        proposal.downvote_count = counts["downs"]
        proposal.save(update_fields=("upvote_count", "downvote_count"))
    return bool(deleted)


def _subtype_of(media_item: MediaItem):
    """First present subtype row (movie/show/game), if any."""
    for accessor in ("movie", "show", "game"):
        try:
            return getattr(media_item, accessor)
        except Exception:
            continue
    return None


def _capture_original(media_item: MediaItem, changes: dict) -> dict:
    """Snapshot current values of the fields a proposal will change."""
    original = {}
    subtype = _subtype_of(media_item)
    for field in changes:
        if field in _ALLOWED_FIELDS and field not in ("status", "runtime", "tagline"):
            if hasattr(media_item, field):
                original[field] = getattr(media_item, field)
        elif subtype is not None and hasattr(subtype, field):
            original[field] = getattr(subtype, field)
    return original


def apply_values(media_item: MediaItem, values: dict) -> None:
    """Set field values on the hub or its subtype row (mirrors legacy apply)."""
    subtype = _subtype_of(media_item)
    for field, value in values.items():
        if field == "color_guess":
            continue
        if hasattr(media_item, field):
            setattr(media_item, field, value)
        elif subtype is not None and hasattr(subtype, field):
            setattr(subtype, field, value)
    update_fields = [f for f in values if f != "color_guess" and hasattr(media_item, f)]
    media_item.save(update_fields=update_fields or None)
    if subtype is not None:
        subtype_fields = [f for f in values if f != "color_guess" and hasattr(subtype, f)]
        if subtype_fields:
            subtype.save(update_fields=subtype_fields)


def upsert_image_overrides(
    media_item: MediaItem, image_overrides: list[dict] | None, created_by_id: int | None
) -> None:
    if not image_overrides:
        return
    for override in image_overrides:
        image_type = override.get("image_type")
        language_code = override.get("language_code")
        url = override.get("url")
        if not image_type or not language_code or not url:
            continue
        MediaImageOverride.objects.update_or_create(
            media_item=media_item,
            image_type=image_type,
            language_code=language_code,
            defaults={
                "url": url,
                "is_active": True,
                "created_by_id": created_by_id or 1,
            },
        )

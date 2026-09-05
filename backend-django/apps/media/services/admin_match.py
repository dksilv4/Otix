"""Match-proposal admin endpoints (legacy ``/media/admin/match-proposals``).

These deprecated endpoints delegate to the unified ``proposals.Proposal`` table
(proposal_type='match'); the greenfield ``MatchProposal`` denormalized row is a
separate scanner artifact and is not used here. ``match/propose`` mirrors the
legacy wrapper exactly.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser
from django.utils import timezone

from apps.proposals.models import Proposal


def match_payload_to_out(proposal: Proposal) -> dict:
    """Map a unified match Proposal to the old inline ``ProposalOut`` shape."""
    payload = proposal.payload or {}
    proposer = proposal.proposer
    reviewer = proposal.reviewer
    return {
        "id": proposal.id,
        "source": payload.get("source", ""),
        "source_game_id": payload.get("source_game_id", ""),
        "source_title": payload.get("source_title", ""),
        "developer": payload.get("developer"),
        "release_year": payload.get("release_year"),
        "poster_url": payload.get("poster_url"),
        "otix_media_id": payload.get("otix_media_id", ""),
        "otix_title": payload.get("otix_title", ""),
        "otix_poster_url": payload.get("otix_poster_url"),
        "otix_release_year": payload.get("otix_release_year"),
        "otix_confidence": payload.get("otix_confidence", 0),
        "match_type": payload.get("match_type", ""),
        "status": proposal.status,
        "proposed_by": proposer.username if proposer else "auto",
        "proposer_avatar": proposer.avatar_url if proposer else None,
        "proposer_xp": getattr(proposer, "total_xp", 0) if proposer else 0,
        "reviewed_by": reviewer.username if reviewer else None,
        "created_at": proposal.created_at.isoformat() if proposal.created_at else "",
        "reviewed_at": proposal.reviewed_at.isoformat() if proposal.reviewed_at else None,
    }


def list_match_proposals(
    *, status: str = "pending", source: str | None = None, limit: int = 50, offset: int = 0
) -> tuple[list[Proposal], int]:
    qs = Proposal.objects.filter(proposal_type="match").order_by("-created_at")
    if status:
        qs = qs.filter(status=status)
    if source:
        qs = qs.filter(payload__source=source)
    total = qs.count()
    return list(qs.select_related("proposer", "reviewer")[offset : offset + limit]), total


def propose_match(user: AbstractBaseUser | None, body: dict) -> dict:
    """Submit a match proposal (returns the auto-approval flag)."""
    parts = body["query_id"].split(":", 1)
    source = parts[0] if parts else "unknown"
    source_game_id = parts[1] if len(parts) > 1 else body["query_id"]
    payload = {
        "source": source,
        "source_game_id": source_game_id,
        "source_title": body["source_title"],
        "developer": body.get("developer"),
        "release_year": body.get("release_year"),
        "poster_url": body.get("poster_url"),
        "otix_media_id": body["media_item_id"],
        "otix_title": body["otix_title"],
        "otix_confidence": body["otix_confidence"],
        "match_type": body["match_type"],
    }
    proposal = Proposal.objects.create(
        proposal_type="match",
        target_type="media_item",
        target_id=str(body["media_item_id"]),
        payload=payload,
        proposer=user if user is not None and user.is_authenticated else None,
        status="pending",
    )
    return {
        "success": True,
        "status": proposal.status,
        "auto_approved": proposal.status == "approved",
    }


def _approve_reject(proposal_id: int, user: AbstractBaseUser | None, new_status: str) -> dict:
    proposal = Proposal.objects.filter(pk=proposal_id, proposal_type="match").first()
    if proposal is None:
        return {"success": False, "error": "Proposal not found"}
    if proposal.status != "pending":
        return {"success": False, "error": f"Proposal is already {proposal.status}"}
    proposal.status = new_status
    proposal.reviewer = user if user is not None and user.is_authenticated else None
    proposal.reviewed_at = timezone.now()
    proposal.save(update_fields=("status", "reviewer", "reviewed_at", "updated_at"))
    return {"success": True}


def approve_match(proposal_id: int, user: AbstractBaseUser | None) -> dict:
    return _approve_reject(proposal_id, user, "approved")


def reject_match(proposal_id: int, user: AbstractBaseUser | None) -> dict:
    return _approve_reject(proposal_id, user, "rejected")

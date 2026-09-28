"""Edit-proposal and deprecated match-proposal endpoints.

Port of the legacy ``admin.py`` (assets handled in ``catalog.py``) and
``match_proposal.py``. ``create``/``list``/``vote`` mirror legacy
``get_trusted_or_admin_user`` (trusted is approximated by any authenticated
user, matching ``apps/proposals``); ``approve``/``reject``/``undo`` remain
admin-only.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media import services
from apps.media.serializers.proposals import (
    ApproveRejectBodySerializer,
    MatchProposalListSerializer,
    MatchProposeResponseSerializer,
    MediaEditProposalCreateBodySerializer,
    MediaEditProposalListSerializer,
    MediaEditProposalOutSerializer,
    ProposalVoteBodySerializer,
    ProposeMatchBodySerializer,
    VoteResponseSerializer,
)


def _media_or_404(media_id: int):
    item = services.media_item_or_none(media_id)
    if item is None:
        raise NotFound("Media item not found")
    return item


def _require_admin(user) -> None:
    if not getattr(user, "is_staff", False):
        raise PermissionDenied("Admin privileges required")


def _edit_proposal_data(proposal) -> dict:
    return MediaEditProposalOutSerializer(proposal).data


class EditProposalListCreateView(APIView):
    """``GET``/``POST /media/{media_id}/edit-proposals``."""

    def get(self, request, media_id: int) -> Response:
        _media_or_404(media_id)
        proposals = services.list_for_media(media_id)
        votes = services.user_votes(request.user.id, [p.id for p in proposals]) if proposals else {}
        items = []
        for proposal in proposals:
            proposal.my_vote = votes.get(proposal.id)
            items.append(_edit_proposal_data(proposal))
        return Response(MediaEditProposalListSerializer({"items": items, "total": len(items)}).data)

    def post(self, request, media_id: int) -> Response:
        item = _media_or_404(media_id)
        body = MediaEditProposalCreateBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        proposal = services.create_proposal(
            item,
            request.user,
            changes=body.validated_data.get("changes", {}),
            image_overrides=body.validated_data.get("image_overrides"),
        )
        return Response(_edit_proposal_data(proposal))


class EditProposalModerationView(APIView):
    """``POST .../approve``, ``.../reject``, ``.../undo`` (admin-only)."""

    action = None

    def post(self, request, media_id: int, proposal_id: int) -> Response:
        _require_admin(request.user)
        try:
            if self.action == "approve":
                proposal = services.approve(proposal_id, request.user)
            elif self.action == "undo":
                proposal = services.undo(proposal_id, request.user)
            else:
                reason = None
                if request.data:
                    body = ApproveRejectBodySerializer(data=request.data)
                    body.is_valid(raise_exception=True)
                    reason = body.validated_data.get("rejection_reason")
                proposal = services.reject(proposal_id, request.user, reason)
        except ValueError as exc:
            raise ValidationError(str(exc)) from None
        return Response(_edit_proposal_data(proposal))


class EditProposalVoteView(APIView):
    """``POST``/``DELETE /media/{media_id}/edit-proposals/{proposal_id}/vote``."""

    def post(self, request, media_id: int, proposal_id: int) -> Response:
        body = ProposalVoteBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        vote_type = body.validated_data["vote_type"]
        if vote_type not in ("up", "down"):
            raise ValidationError("vote_type must be 'up' or 'down'")
        try:
            result = services.vote(proposal_id, request.user, vote_type)
        except ValueError as exc:
            raise ValidationError(str(exc)) from None
        proposal = services.get_proposal(proposal_id)
        if proposal is None:
            raise NotFound("Proposal not found")
        return Response(
            VoteResponseSerializer(
                {
                    "my_vote": result,
                    "upvote_count": proposal.upvote_count,
                    "downvote_count": proposal.downvote_count,
                }
            ).data
        )

    def delete(self, request, media_id: int, proposal_id: int) -> Response:
        try:
            deleted = services.remove_vote(proposal_id, request.user)
        except ValueError as exc:
            raise ValidationError(str(exc)) from None
        if not deleted:
            raise NotFound("Vote not found")
        return Response(status=status.HTTP_204_NO_CONTENT)


class MatchProposalAdminListView(APIView):
    """``GET /media/admin/match-proposals`` — deprecated unified match proposals."""

    def get(self, request) -> Response:
        params = request.query_params
        limit = _clamp_int(params.get("limit"), 50, 1, 200)
        offset = _clamp_int(params.get("offset"), 0, 0, None)
        proposals, total = services.list_match_proposals(
            status=params.get("status") or "pending",
            source=params.get("source"),
            limit=limit,
            offset=offset,
        )
        items = [services.match_payload_to_out(p) for p in proposals]
        return Response(MatchProposalListSerializer({"proposals": items, "total": total}).data)


class MatchProposalModerationView(APIView):
    """``POST /media/admin/match-proposals/{proposal_id}/approve|reject``."""

    action = None

    def post(self, request, proposal_id: int) -> Response:
        if self.action == "approve":
            result = services.approve_match(proposal_id, request.user)
        else:
            result = services.reject_match(proposal_id, request.user)
        return Response(result)


class MatchProposeView(APIView):
    """``POST /media/match/propose`` — deprecated auto-match wrapper."""

    def post(self, request) -> Response:
        body = ProposeMatchBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        result = services.propose_match(request.user, body.validated_data)
        return Response(MatchProposeResponseSerializer(result).data)


def _clamp_int(raw, default: int, lo: int, hi: int | None) -> int:
    try:
        value = int(raw) if raw is not None else default
    except (TypeError, ValueError):
        raise ValidationError("limit/offset must be integers") from None
    value = max(lo, value)
    if hi is not None:
        value = min(hi, value)
    return value

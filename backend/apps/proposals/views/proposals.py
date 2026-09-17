"""Unified proposal endpoints.

Port of ``old-backend/otix/api/proposals/router.py``. Thin ``APIView`` subclasses:
GET/POST ``/proposals``, GET ``/proposals/{id}``, and the
approve/reject/undo/vote state-machine actions. Status codes mirror legacy —
create 201, review actions 200 with the proposal body, vote 200 with a
``VoteResponse`` body, vote DELETE 204. Unknown ids raise 404 on reads and 400
``"Proposal not found"`` on state-machine actions (legacy surfaces the service
``ProposalError`` as 400).
"""

from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.proposals import services
from apps.proposals.models import Proposal
from apps.proposals.serializers import (
    ProposalCreateSerializer,
    ProposalOutSerializer,
    RejectBodySerializer,
    VoteBodySerializer,
)
from core.pagination import DefaultPagination


class IsAdminUser(BasePermission):
    """Admin gate matching legacy ``get_current_admin_user`` (403 detail)."""

    message = "Admin access required"

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_staff)


def _proposal_or_raise(proposal_id: int) -> Proposal:
    proposal = services.get_proposal(proposal_id)
    if proposal is None:
        raise services.ProposalError("Proposal not found")
    return proposal


def _out(proposal: Proposal, user) -> dict:
    context = {"proposal_context": services.build_proposal_context([proposal], user)}
    return ProposalOutSerializer(proposal, context=context).data


class ProposalListCreateView(APIView):
    """``GET`` (paginated list) / ``POST`` (create) ``/proposals``."""

    def get(self, request) -> Response:
        queryset = services.filter_proposals(
            proposal_type=request.query_params.get("type") or None,
            status=request.query_params.get("status") or None,
            target_type=request.query_params.get("target_type") or None,
            target_id=request.query_params.get("target_id") or None,
        )
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        context = {"proposal_context": services.build_proposal_context(page, request.user)}
        serializer = ProposalOutSerializer(page, many=True, context=context)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request) -> Response:
        body = ProposalCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if not services.is_trusted_user(request.user):
            raise PermissionDenied(
                "Minimum 500 XP required to create proposals"
            )
        try:
            proposal = services.create_proposal(
                proposal_type=body.validated_data["proposal_type"],
                target_type=body.validated_data["target_type"],
                target_id=body.validated_data["target_id"],
                payload=body.validated_data["payload"],
                proposer=request.user,
            )
        except services.ProposalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_out(proposal, request.user), status=status.HTTP_201_CREATED)


class ProposalDetailView(APIView):
    """``GET /proposals/{proposal_id}``."""

    def get(self, request, proposal_id: int) -> Response:
        proposal = services.get_proposal(proposal_id)
        if proposal is None:
            raise NotFound("Proposal not found")
        return Response(_out(proposal, request.user))


class ProposalApproveView(APIView):
    """``POST /proposals/{proposal_id}/approve`` (admin only)."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request, proposal_id: int) -> Response:
        try:
            proposal = services.approve_proposal(_proposal_or_raise(proposal_id), request.user)
        except services.ProposalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_out(proposal, request.user))


class ProposalRejectView(APIView):
    """``POST /proposals/{proposal_id}/reject`` (admin only)."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request, proposal_id: int) -> Response:
        body = RejectBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            proposal = services.reject_proposal(
                _proposal_or_raise(proposal_id),
                request.user,
                body.validated_data["rejection_reason"],
            )
        except services.ProposalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_out(proposal, request.user))


class ProposalUndoView(APIView):
    """``POST /proposals/{proposal_id}/undo`` (admin only)."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request, proposal_id: int) -> Response:
        try:
            proposal = services.undo_proposal(_proposal_or_raise(proposal_id), request.user)
        except services.ProposalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_out(proposal, request.user))


class ProposalVoteView(APIView):
    """``POST`` / ``DELETE /proposals/{proposal_id}/vote`` (authenticated)."""

    def post(self, request, proposal_id: int) -> Response:
        body = VoteBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if not services.is_trusted_user(request.user):
            raise PermissionDenied("Minimum 500 XP required to vote")
        try:
            proposal = _proposal_or_raise(proposal_id)
            my_vote = services.vote_on_proposal(
                proposal, request.user, body.validated_data["vote_type"]
            )
        except services.ProposalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        proposal.refresh_from_db()
        return Response(
            {
                "my_vote": my_vote,
                "upvote_count": proposal.upvote_count,
                "downvote_count": proposal.downvote_count,
            }
        )

    def delete(self, request, proposal_id: int) -> Response:
        proposal = services.get_proposal(proposal_id)
        removed = False
        if proposal is not None:
            removed = services.remove_proposal_vote(proposal, request.user)
        if not removed:
            return Response({"detail": "Vote not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

"""Serializers for the unified proposal API surface.

Keys mirror the legacy FastAPI response shapes in
``backend/otix/api/proposals/router.py`` (``ProposalOut``,
``ProposalCreate``, ``VoteRequest``, ``RejectRequest``). Per-request state
(``my_vote``) and target-media enrichment (``target_title`` etc.) are read
from ``context["proposal_context"]`` so serializers stay one-line lookups and
the querying lives in ``apps.proposals.services``.
"""

from rest_framework import serializers

from apps.proposals.models import Proposal


class UserRefSerializer(serializers.Serializer):
    """Minimal proposer/reviewer slice (legacy ``ProposerUserOut``)."""

    id = serializers.SerializerMethodField()
    username = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    def get_id(self, obj) -> int:
        return obj.pk

    def get_username(self, obj) -> str:
        return obj.username

    def get_avatar_url(self, obj) -> str | None:
        return obj.avatar_url or None


class ProposalOutSerializer(serializers.ModelSerializer):
    """Full proposal payload (legacy ``ProposalOut``)."""

    proposer_id = serializers.SerializerMethodField()
    reviewer_id = serializers.SerializerMethodField()
    proposer = UserRefSerializer(read_only=True, allow_null=True)
    reviewer = UserRefSerializer(read_only=True, allow_null=True)
    my_vote = serializers.SerializerMethodField()
    target_title = serializers.SerializerMethodField()
    target_poster_url = serializers.SerializerMethodField()
    target_backdrop_url = serializers.SerializerMethodField()

    class Meta:
        model = Proposal
        fields = (
            "id",
            "proposal_type",
            "target_type",
            "target_id",
            "proposer_id",
            "reviewer_id",
            "status",
            "payload",
            "rejection_reason",
            "snapshot",
            "upvote_count",
            "downvote_count",
            "my_vote",
            "proposer",
            "reviewer",
            "created_at",
            "updated_at",
            "reviewed_at",
            "target_title",
            "target_poster_url",
            "target_backdrop_url",
        )
        read_only_fields = fields

    def _ctx(self, obj: Proposal) -> dict:
        context = self.context.get("proposal_context") or {}
        return context.get(obj.id) or {}

    def get_proposer_id(self, obj: Proposal) -> int | None:
        return obj.proposer_id

    def get_reviewer_id(self, obj: Proposal) -> int | None:
        return obj.reviewer_id

    def get_my_vote(self, obj: Proposal) -> str | None:
        return self._ctx(obj).get("my_vote")

    def get_target_title(self, obj: Proposal) -> str | None:
        return self._ctx(obj).get("target_title")

    def get_target_poster_url(self, obj: Proposal) -> str | None:
        return self._ctx(obj).get("target_poster_url")

    def get_target_backdrop_url(self, obj: Proposal) -> str | None:
        return self._ctx(obj).get("target_backdrop_url")


class ProposalCreateSerializer(serializers.Serializer):
    """Request body for ``POST /proposals`` (legacy ``ProposalCreate``)."""

    proposal_type = serializers.ChoiceField(choices=("match", "edit"))
    target_type = serializers.CharField(default="media_item")
    target_id = serializers.CharField()
    payload = serializers.JSONField(default=dict)


class VoteBodySerializer(serializers.Serializer):
    """Request body for ``POST /proposals/{id}/vote``."""

    vote_type = serializers.ChoiceField(choices=("up", "down"))


class RejectBodySerializer(serializers.Serializer):
    """Request body for ``POST /proposals/{id}/reject`` (all-optional)."""

    rejection_reason = serializers.CharField(
        required=False, allow_null=True, default=None
    )

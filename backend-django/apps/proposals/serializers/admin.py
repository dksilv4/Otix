"""Serializers for the admin/moderator read endpoints.

Mirrors the legacy schemas in ``backend/otix/schemas/admin.py`` and
``backend/otix/schemas/admin_edit.py`` where the data is backed by models
(``TMDBDeletedID``, ``MediaEditProposal``). Dashboard aggregates that are not
model-backed are assembled as plain dicts in ``apps.proposals.services.admin``
rather than given serializer classes.
"""

from rest_framework import serializers

from apps.proposals.models import MediaEditProposal, TMDBDeletedID
from apps.proposals.serializers.proposal import UserRefSerializer


class TMDBDeletedIDItemSerializer(serializers.ModelSerializer):
    """One audit row for a TMDB id deleted upstream (legacy item schema)."""

    class Meta:
        model = TMDBDeletedID
        fields = (
            "id",
            "tmdb_id",
            "media_type",
            "media_item_id",
            "title",
            "detection_date",
        )
        read_only_fields = fields


class MediaEditProposalOutSerializer(serializers.ModelSerializer):
    """An edit proposal row (legacy ``MediaEditProposalOut``).

    ``proposer_user_id``/``approver_user_id``/``media_*``/``my_vote`` are
    populated from the object and from ``context["edit_proposal_context"]``.
    """

    proposer_user_id = serializers.SerializerMethodField()
    approver_user_id = serializers.SerializerMethodField()
    proposer = UserRefSerializer(read_only=True, allow_null=True)
    approver = UserRefSerializer(read_only=True, allow_null=True)
    media_title = serializers.SerializerMethodField()
    media_type = serializers.SerializerMethodField()
    media_poster_url = serializers.SerializerMethodField()
    my_vote = serializers.SerializerMethodField()

    class Meta:
        model = MediaEditProposal
        fields = (
            "id",
            "media_item_id",
            "proposer_user_id",
            "approver_user_id",
            "status",
            "changes",
            "image_overrides",
            "rejection_reason",
            "proposer",
            "approver",
            "upvote_count",
            "downvote_count",
            "my_vote",
            "created_at",
            "updated_at",
            "media_title",
            "media_type",
            "media_poster_url",
        )
        read_only_fields = fields

    def get_proposer_user_id(self, obj: MediaEditProposal) -> int | None:
        return obj.proposer_id

    def get_approver_user_id(self, obj: MediaEditProposal) -> int | None:
        return obj.approver_id

    def _ctx(self, obj: MediaEditProposal) -> dict:
        context = self.context.get("edit_proposal_context") or {}
        return context.get(obj.id) or {}

    def get_media_title(self, obj: MediaEditProposal) -> str | None:
        return self._ctx(obj).get("media_title")

    def get_media_type(self, obj: MediaEditProposal) -> str | None:
        return self._ctx(obj).get("media_type")

    def get_media_poster_url(self, obj: MediaEditProposal) -> str | None:
        return self._ctx(obj).get("media_poster_url")

    def get_my_vote(self, obj: MediaEditProposal) -> str | None:
        return self._ctx(obj).get("my_vote")

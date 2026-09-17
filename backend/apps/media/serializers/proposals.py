"""Edit-proposal and match-proposal serializers.

Edit proposals use the greenfield ``proposals.MediaEditProposal`` row; the
legacy ``/media/admin/match-proposals`` endpoints delegate to the unified
``proposals.Proposal`` table, so those read/write serializers map to that row's
``payload`` shape (``old-backend/otix/schemas/admin_edit.py`` and the inline
``ProposalOut`` in ``old-backend/otix/api/media/match_proposal.py``).
"""

from rest_framework import serializers


class ProposerUserOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    avatar_url = serializers.CharField(allow_null=True)


def proposer_user_out(user) -> dict | None:
    if user is None:
        return None
    return {"id": user.id, "username": user.username, "avatar_url": user.avatar_url}


class MediaEditProposalOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    media_item_id = serializers.IntegerField()
    proposer_user_id = serializers.IntegerField(allow_null=True)
    approver_user_id = serializers.IntegerField(allow_null=True)
    status = serializers.CharField()
    changes = serializers.JSONField()
    image_overrides = serializers.JSONField(allow_null=True)
    rejection_reason = serializers.CharField(allow_null=True)
    proposer = serializers.SerializerMethodField()
    approver = serializers.SerializerMethodField()
    upvote_count = serializers.IntegerField()
    downvote_count = serializers.IntegerField()
    my_vote = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    media_title = serializers.SerializerMethodField()
    media_type = serializers.SerializerMethodField()
    media_poster_url = serializers.SerializerMethodField()

    def _media(self, obj):
        return getattr(obj, "media_item", None)

    def get_media_title(self, obj):
        media = self._media(obj)
        return media.title if media is not None else None

    def get_media_type(self, obj):
        media = self._media(obj)
        return media.media_type if media is not None else None

    def get_media_poster_url(self, obj):
        media = self._media(obj)
        if media is None:
            return None
        return getattr(media, "poster_url", None)

    def get_proposer(self, obj):
        return proposer_user_out(getattr(obj, "proposer", None))

    def get_approver(self, obj):
        return proposer_user_out(getattr(obj, "approver", None))


class MediaEditProposalListSerializer(serializers.Serializer):
    items = serializers.ListField(child=serializers.DictField())
    total = serializers.IntegerField()


class MediaEditProposalCreateBodySerializer(serializers.Serializer):
    changes = serializers.JSONField(default=dict)
    image_overrides = serializers.JSONField(required=False, allow_null=True, default=None)


class ApproveRejectBodySerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=False, allow_null=True, default=None)


class ProposalVoteBodySerializer(serializers.Serializer):
    vote_type = serializers.CharField()


class VoteResponseSerializer(serializers.Serializer):
    my_vote = serializers.CharField(allow_null=True)
    upvote_count = serializers.IntegerField()
    downvote_count = serializers.IntegerField()


class ImageOverrideItemSerializer(serializers.Serializer):
    image_type = serializers.CharField()
    language_code = serializers.CharField()
    url = serializers.CharField(max_length=2000)


# ── Match proposals (unified Proposal, legacy inline shapes) ─────────────


class MatchProposalOutSerializer(serializers.Serializer):
    """Legacy ``ProposalOut`` shape produced from a unified match Proposal."""

    id = serializers.IntegerField()
    source = serializers.CharField()
    source_game_id = serializers.CharField()
    source_title = serializers.CharField()
    developer = serializers.CharField(allow_null=True)
    release_year = serializers.IntegerField(allow_null=True)
    poster_url = serializers.CharField(allow_null=True)
    otix_media_id = serializers.CharField()
    otix_title = serializers.CharField()
    otix_poster_url = serializers.CharField(allow_null=True)
    otix_release_year = serializers.IntegerField(allow_null=True)
    otix_confidence = serializers.FloatField()
    match_type = serializers.CharField()
    status = serializers.CharField()
    proposed_by = serializers.CharField()
    proposer_avatar = serializers.CharField(allow_null=True)
    proposer_xp = serializers.IntegerField()
    reviewed_by = serializers.CharField(allow_null=True)
    created_at = serializers.CharField()
    reviewed_at = serializers.CharField(allow_null=True)


class MatchProposalListSerializer(serializers.Serializer):
    proposals = serializers.ListField(child=MatchProposalOutSerializer())
    total = serializers.IntegerField()


class ProposeMatchBodySerializer(serializers.Serializer):
    query_id = serializers.CharField()
    media_item_id = serializers.CharField()
    source_title = serializers.CharField()
    developer = serializers.CharField(required=False, allow_null=True, default=None)
    release_year = serializers.IntegerField(required=False, allow_null=True, default=None)
    poster_url = serializers.CharField(required=False, allow_null=True, default=None)
    otix_title = serializers.CharField()
    otix_confidence = serializers.FloatField()
    match_type = serializers.CharField()


class MatchProposeResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    status = serializers.CharField()
    auto_approved = serializers.BooleanField()

"""Read/request serializers for the ``/users`` engagement surface.

Mirrors the legacy FastAPI schemas in ``old-backend/otix/schemas/{follow,karma,
user_badge,user_rating}.py`` plus the review-with-user payload. Shapes that are
free-form rollups (activity events, heatmap, daily activity) are returned as
plain dicts by the views and are intentionally not modelled here.
"""

from rest_framework import serializers


class FollowUserSerializer(serializers.Serializer):
    """A follower/following row (legacy ``FollowUserOut``).

    ``is_private`` has no model home on ``accounts.User`` yet, so it is always
    reported as ``False`` (the legacy schema default).
    """

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    avatar_url = serializers.CharField(read_only=True, allow_null=True)
    is_private = serializers.SerializerMethodField()

    def get_is_private(self, _obj) -> bool:
        return False


class FollowCountsSerializer(serializers.Serializer):
    """Follower/following counts (legacy ``FollowCountsOut``)."""

    followers = serializers.IntegerField(read_only=True)
    following = serializers.IntegerField(read_only=True)


class FollowStatusSerializer(serializers.Serializer):
    """Relationship status with a target user (legacy ``FollowStatusOut``)."""

    is_following = serializers.BooleanField(read_only=True)
    has_pending_request = serializers.BooleanField(read_only=True)
    is_private = serializers.BooleanField(read_only=True)


class FollowRequestRequesterSerializer(serializers.Serializer):
    """Requester summary in a follow request (legacy ``FollowRequestRequesterOut``)."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    avatar_url = serializers.CharField(read_only=True, allow_null=True)


class FollowRequestOutSerializer(serializers.Serializer):
    """One pending follow request (legacy ``FollowRequestOut``)."""

    id = serializers.IntegerField(read_only=True)
    requester_id = serializers.IntegerField(read_only=True)
    target_id = serializers.IntegerField(read_only=True)
    status = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    requester = FollowRequestRequesterSerializer(read_only=True)


class FollowRequestResponseSerializer(serializers.Serializer):
    """Accept/decline response body (legacy ``FollowRequestResponse``)."""

    message = serializers.CharField(read_only=True)
    request_id = serializers.IntegerField(read_only=True)


class KarmaOutSerializer(serializers.Serializer):
    """Karma balance (legacy ``KarmaOut``)."""

    balance = serializers.IntegerField(read_only=True)


class KarmaTransactionOutSerializer(serializers.Serializer):
    """One karma ledger row (legacy ``KarmaTransactionOut``)."""

    amount = serializers.IntegerField(read_only=True)
    reason = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class BadgeOutSerializer(serializers.Serializer):
    """One badge definition with the user's progress (legacy ``BadgeOut``)."""

    badge_key = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    icon = serializers.CharField(read_only=True)
    tier = serializers.CharField(read_only=True)
    earned = serializers.BooleanField(read_only=True)
    earned_at = serializers.DateTimeField(read_only=True, allow_null=True)
    current_value = serializers.FloatField(read_only=True)
    target_value = serializers.FloatField(read_only=True)
    claimed = serializers.BooleanField(read_only=True)
    xp_reward = serializers.IntegerField(read_only=True)


class BadgeDefOutSerializer(serializers.Serializer):
    """Achievement definition (legacy ``BadgeDefOut``)."""

    badge_key = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    icon = serializers.CharField(read_only=True)
    tier = serializers.CharField(read_only=True)
    target = serializers.FloatField(read_only=True)
    xp_reward = serializers.IntegerField(read_only=True)


class UserRatingOutSerializer(serializers.Serializer):
    """The current user's rating of another user (legacy ``UserRatingOut``)."""

    rater_id = serializers.IntegerField(read_only=True)
    rated_user_id = serializers.IntegerField(read_only=True)
    score = serializers.IntegerField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class UserRatingBodySerializer(serializers.Serializer):
    """Rating request body (legacy ``UserRatingCreate``, 1-10)."""

    score = serializers.IntegerField(min_value=1, max_value=10)


class UserReputationOutSerializer(serializers.Serializer):
    """Composite reputation payload (legacy ``UserReputationOut``)."""

    avg_user_rating = serializers.FloatField(read_only=True, allow_null=True)
    user_rating_count = serializers.IntegerField(read_only=True)
    composite_score = serializers.IntegerField(read_only=True, allow_null=True)
    components = serializers.DictField(read_only=True)


class ReviewUserSerializer(serializers.Serializer):
    """Author summary nested in a review (legacy ``ReviewUserOut``)."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    is_admin = serializers.BooleanField(read_only=True)


class ReviewWithUserSerializer(serializers.Serializer):
    """A review in a user's list (legacy ``ReviewWithUserOut``)."""

    user_id = serializers.IntegerField(read_only=True)
    media_item_id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True, allow_null=True)
    content = serializers.CharField(read_only=True, allow_null=True)
    is_spoiler = serializers.BooleanField(read_only=True)
    is_private = serializers.BooleanField(read_only=True)
    cooldown_until = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    user = ReviewUserSerializer(read_only=True)
    rating = serializers.SerializerMethodField()

    def get_rating(self, _obj) -> None:
        """Legacy left ``rating`` unset for this route (no rating row loaded)."""
        return None

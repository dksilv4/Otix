"""Public profile-hub serializers: profile detail, search and continue-watching.

Field lists mirror the legacy FastAPI schemas in
``old-backend/otix/schemas/user.py``. The profile payload is built by
``apps.accounts.services.user_profile.build_user_profile`` into a flat dict
whose keys this serializer re-declares so the API surface stays explicit.
"""

from rest_framework import serializers

from apps.social.serializers.friend import FriendshipStatusSerializer
from core.image_url import clean_image_url


class UserSearchResultSerializer(serializers.Serializer):
    """A user search hit (legacy ``UserSearchResult``)."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    avatar_url = serializers.CharField(read_only=True, allow_null=True)
    bio = serializers.CharField(read_only=True, allow_null=True)
    level = serializers.IntegerField(read_only=True)
    level_title = serializers.CharField(read_only=True)
    is_admin = serializers.BooleanField(read_only=True)
    media_type = serializers.CharField(read_only=True)

    def to_representation(self, instance: dict) -> dict:
        data = super().to_representation(instance)
        if data.get("avatar_url"):
            data["avatar_url"] = clean_image_url(data["avatar_url"])
        return data


class UserProfileSerializer(serializers.Serializer):
    """Public user profile detail (legacy ``UserProfileOut``)."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    avatar_url = serializers.CharField(read_only=True, allow_null=True)
    bio = serializers.CharField(read_only=True, allow_null=True)
    background_url = serializers.CharField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    review_count = serializers.IntegerField(read_only=True)
    total_xp = serializers.IntegerField(read_only=True)
    avg_user_rating = serializers.FloatField(read_only=True, allow_null=True)
    user_rating_count = serializers.IntegerField(read_only=True)
    is_admin = serializers.BooleanField(read_only=True)
    composite_score = serializers.IntegerField(read_only=True, allow_null=True)
    profile_sections = serializers.ListField(
        child=serializers.CharField(), read_only=True, allow_null=True
    )
    hall_of_fame_media_ids = serializers.DictField(read_only=True)
    steam = serializers.DictField(read_only=True, allow_null=True)
    plex = serializers.DictField(read_only=True, allow_null=True)
    tmdb_username = serializers.CharField(read_only=True, allow_null=True)
    friendship_status = FriendshipStatusSerializer(read_only=True, allow_null=True)
    is_following = serializers.BooleanField(read_only=True)
    is_private = serializers.BooleanField(read_only=True)
    follower_count = serializers.IntegerField(read_only=True)
    following_count = serializers.IntegerField(read_only=True)
    friend_count = serializers.IntegerField(read_only=True)
    level = serializers.IntegerField(read_only=True)
    level_title = serializers.CharField(read_only=True)
    xp_rank = serializers.IntegerField(read_only=True, allow_null=True)
    xp_percentile = serializers.FloatField(read_only=True, allow_null=True)
    proposal_count = serializers.IntegerField(read_only=True)
    proposal_approval_rate = serializers.FloatField(read_only=True, allow_null=True)
    current_login_streak = serializers.IntegerField(read_only=True)
    longest_login_streak = serializers.IntegerField(read_only=True)
    current_review_streak = serializers.IntegerField(read_only=True)
    longest_review_streak = serializers.IntegerField(read_only=True)

    def to_representation(self, instance: dict) -> dict:
        data = super().to_representation(instance)
        if data.get("avatar_url"):
            data["avatar_url"] = clean_image_url(data["avatar_url"])
        if data.get("background_url"):
            data["background_url"] = clean_image_url(data["background_url"])
        return data


class ContinueItemSerializer(serializers.Serializer):
    """Continue-watching item (legacy ``ContinueItem``)."""

    id = serializers.IntegerField(read_only=True)
    media_type = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    slug = serializers.CharField(read_only=True)
    poster_url = serializers.CharField(read_only=True, allow_null=True)
    backdrop_url = serializers.CharField(read_only=True, allow_null=True)
    logo_url = serializers.CharField(read_only=True, allow_null=True)
    release_date = serializers.DateField(read_only=True, allow_null=True)
    popularity = serializers.FloatField(read_only=True)
    interaction_type = serializers.CharField(read_only=True)
    interacted_at = serializers.DateTimeField(read_only=True)

    def to_representation(self, instance: dict) -> dict:
        data = super().to_representation(instance)
        if data.get("poster_url"):
            data["poster_url"] = clean_image_url(data["poster_url"])
        if data.get("backdrop_url"):
            data["backdrop_url"] = clean_image_url(data["backdrop_url"])
        if data.get("logo_url"):
            data["logo_url"] = clean_image_url(data["logo_url"])
        return data
    episode_context = serializers.CharField(read_only=True, allow_null=True)

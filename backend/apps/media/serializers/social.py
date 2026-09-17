"""Review / rating / interaction / episode-watched serializers.

Response bodies mirror the legacy schemas in ``old-backend/otix/schemas/``
(``review.py``, ``media_rating.py``, ``interaction.py``,
``episode_interaction.py``). Request bodies are field-listed serializers so DRF
enforces the legacy score/extra_data constraints.
"""

from rest_framework import serializers

# ── Media rating ─────────────────────────────────────────────────────────


class MediaRatingOutSerializer(serializers.Serializer):
    """A user's rating row (legacy ``MediaRatingOut``)."""

    user_id = serializers.IntegerField()
    media_item_id = serializers.IntegerField()
    score = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class MediaRatingAggregateOutSerializer(serializers.Serializer):
    """Response of ``PUT .../rating`` (legacy ``MediaRatingAggregateOut``)."""

    score = serializers.IntegerField()
    avg_rating = serializers.FloatField(allow_null=True)
    rating_count = serializers.IntegerField()


class MediaRatingBodySerializer(serializers.Serializer):
    """Request body for rating a media item (score 1-10)."""

    score = serializers.IntegerField(min_value=1, max_value=10)


# ── Reviews ──────────────────────────────────────────────────────────────


class ReviewBodySerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False, allow_null=True, default=None)
    content = serializers.CharField(max_length=5000, required=False, allow_null=True, default=None)
    is_spoiler = serializers.BooleanField(required=False, default=False)
    is_private = serializers.BooleanField(required=False, default=False)


class ReviewUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False, allow_null=True, default=None)
    content = serializers.CharField(max_length=5000, required=False, allow_null=True, default=None)
    is_spoiler = serializers.BooleanField(required=False, default=None)
    is_private = serializers.BooleanField(required=False, default=None)


class ReviewOutSerializer(serializers.Serializer):
    """A review without author details (legacy ``ReviewOut``)."""

    user_id = serializers.IntegerField()
    media_item_id = serializers.IntegerField()
    title = serializers.CharField(allow_null=True)
    content = serializers.CharField(allow_null=True)
    is_spoiler = serializers.BooleanField()
    is_private = serializers.BooleanField()
    cooldown_until = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class ReviewUserOutSerializer(serializers.Serializer):
    """Reviewer slice inside a public review (legacy ``ReviewUserOut``)."""

    id = serializers.IntegerField()
    username = serializers.CharField()
    is_admin = serializers.BooleanField()


class ReviewWithUserOutSerializer(serializers.Serializer):
    """A review plus reviewer + their rating (legacy ``ReviewWithUserOut``)."""

    user_id = serializers.IntegerField()
    media_item_id = serializers.IntegerField()
    title = serializers.CharField(allow_null=True)
    content = serializers.CharField(allow_null=True)
    is_spoiler = serializers.BooleanField()
    is_private = serializers.BooleanField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    cooldown_until = serializers.DateTimeField(allow_null=True)
    user = ReviewUserOutSerializer()
    rating = MediaRatingOutSerializer(allow_null=True)


# ── Interactions ─────────────────────────────────────────────────────────


INTERACTION_STATE_KEYS = (
    "liked",
    "watchlisted",
    "watched",
    "played",
    "started",
    "listened",
    "owned",
)
INTERACTION_TOGGLE_KEYS = ("liked", "watchlisted", "watched", "played", "started", "listened")


class InteractionOutSerializer(serializers.Serializer):
    """A single interaction row (legacy ``InteractionOut``)."""

    user_id = serializers.IntegerField()
    media_item_id = serializers.IntegerField()
    interaction_type = serializers.CharField()
    extra_data = serializers.JSONField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class InteractionCountsSerializer(serializers.Serializer):
    like_count = serializers.IntegerField()
    watchlist_count = serializers.IntegerField()
    watched_count = serializers.IntegerField()
    played_count = serializers.IntegerField()
    started_count = serializers.IntegerField()
    listened_count = serializers.IntegerField()


class InteractionToggleResponseSerializer(serializers.Serializer):
    interaction = InteractionOutSerializer()
    counts = InteractionCountsSerializer()


class InteractionCreateBodySerializer(serializers.Serializer):
    extra_data = serializers.JSONField(required=False, default=dict)


# ── Episode interactions / watched toggles ──────────────────────────────


class EpisodeInteractionOutSerializer(serializers.Serializer):
    episode_id = serializers.IntegerField()
    watched = serializers.BooleanField()
    watched_at = serializers.CharField(allow_null=True)


class EpisodeInteractionsOutSerializer(serializers.Serializer):
    episodes = serializers.DictField(child=EpisodeInteractionOutSerializer())


class ShowProgressOutSerializer(serializers.Serializer):
    watched_episodes = serializers.IntegerField()
    total_episodes = serializers.IntegerField()
    progress_pct = serializers.FloatField()
    completed_seasons = serializers.ListField(child=serializers.IntegerField())


class EpisodeToggleResponseSerializer(serializers.Serializer):
    interaction = EpisodeInteractionOutSerializer()
    show_progress = ShowProgressOutSerializer()


class BulkMarkResponseSerializer(serializers.Serializer):
    episodes_marked = serializers.IntegerField()

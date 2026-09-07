"""Per-user media interactions: media-item and episode touchpoints.

Ported from the legacy ``interaction.py`` / ``episode_interaction.py`` domain
modules. The legacy composite keys become surrogate ids plus uniqueness
constraints. ``user_media_interactions`` carries a JSONB ``metadata`` payload
(legacy python name ``extra_data``, column ``metadata``).
"""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

INTERACTION_TYPE_VALUES = (
    "rated",
    "watched",
    "liked",
    "watchlisted",
    "played",
    "reviewed",
    "started",
    "listened",
    "owned",
)


class UserMediaInteraction(TimestampedModel):
    """One interaction type a user has with a media item."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="interactions"
    )
    media_item = models.ForeignKey(
        "media.MediaItem", on_delete=models.CASCADE, related_name="interactions"
    )
    interaction_type = models.CharField(max_length=20)
    extra_data = models.JSONField(default=dict, blank=True, db_column="metadata")

    class Meta(TimestampedModel.Meta):
        db_table = "user_media_interactions"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "media_item", "interaction_type"],
                name="uq_user_media_interaction_user_media_type",
            ),
            models.CheckConstraint(
                condition=models.Q(interaction_type__in=INTERACTION_TYPE_VALUES),
                name="ck_interaction_type",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.media_item_id}:{self.interaction_type}"


class UserEpisodeInteraction(TimestampedModel):
    """A user has watched/touched an episode."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="episode_interactions",
    )
    episode = models.ForeignKey(
        "media.Episode", on_delete=models.CASCADE, related_name="episode_interactions"
    )

    class Meta(TimestampedModel.Meta):
        db_table = "user_episode_interactions"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "episode"], name="uq_user_episode_interaction_user_episode"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.episode_id}"

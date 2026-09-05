"""Per-user Steam owned games and wishlist rows."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserSteamGame(TimestampedModel):
    """A Steam game owned by the user, captured from a library sync."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="steam_games"
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="steam_games",
    )
    steam_app_id = models.IntegerField()
    name = models.CharField(max_length=500)
    playtime_forever = models.IntegerField(default=0)
    playtime_2weeks = models.IntegerField(default=0)
    img_icon_url = models.CharField(max_length=256, null=True, blank=True)
    img_logo_url = models.CharField(max_length=256, null=True, blank=True)
    rtime_last_played = models.IntegerField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_steam_games"
        constraints = [
            models.UniqueConstraint(fields=["user", "steam_app_id"], name="uq_user_steam_game"),
        ]

    def __str__(self) -> str:
        return f"{self.name} (app {self.steam_app_id})"


class UserSteamWishlist(TimestampedModel):
    """A Steam wishlist entry for the user."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="steam_wishlist"
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="steam_wishlist",
    )
    steam_app_id = models.IntegerField()
    name = models.CharField(max_length=500)
    priority = models.IntegerField(default=0)
    added_date = models.IntegerField(null=True, blank=True)
    is_free = models.BooleanField(default=False)
    img_icon_url = models.CharField(max_length=256, null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_steam_wishlist"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "steam_app_id"], name="uq_user_steam_wishlist"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} (app {self.steam_app_id})"

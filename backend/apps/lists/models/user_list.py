"""User-curated lists: items, collaborators, likes and rank history."""

from django.conf import settings
from django.db import models

from core.models import BaseModel, TimestampedModel

LIST_COLLABORATOR_PERMISSIONS = ["VIEW", "EDIT", "ADMIN"]
LIST_COLLABORATOR_STATUSES = ["pending", "accepted"]


class UserList(TimestampedModel):
    """A user-curated list of media items (private by default)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_lists",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(null=True, blank=True)
    is_public = models.BooleanField(default=False)

    class Meta(TimestampedModel.Meta):
        db_table = "user_list"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"], name="uq_user_list_user_name"
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.name}"


class UserListItem(BaseModel):
    """A media item placed on a user list, in list order."""

    list = models.ForeignKey(UserList, on_delete=models.CASCADE, related_name="items")
    media_item = models.ForeignKey(
        "media.MediaItem", on_delete=models.CASCADE, related_name="user_list_items"
    )
    sort_order = models.IntegerField(default=0)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        db_table = "user_list_item"
        constraints = [
            models.UniqueConstraint(
                fields=["list", "media_item"], name="uq_user_list_item_list_media_item"
            )
        ]

    def __str__(self) -> str:
        return f"{self.list_id}:{self.media_item_id}"


class MediaListCollaborator(TimestampedModel):
    """A user granted permission on a list (pending/accepted)."""

    list = models.ForeignKey(UserList, on_delete=models.CASCADE, related_name="collaborators")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="list_collaborations",
    )
    permission = models.CharField(max_length=10, default="VIEW")
    status = models.CharField(max_length=10, default="pending")

    class Meta(TimestampedModel.Meta):
        db_table = "media_list_collaborators"
        constraints = [
            models.UniqueConstraint(fields=["list", "user"], name="uq_list_collaborator"),
            models.CheckConstraint(
                condition=models.Q(permission__in=LIST_COLLABORATOR_PERMISSIONS),
                name="ck_collaborator_permission",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=LIST_COLLABORATOR_STATUSES),
                name="ck_collaborator_status",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.list_id}:{self.user_id}:{self.permission}"


class MediaListLike(BaseModel):
    """A user's like of a list."""

    list = models.ForeignKey(UserList, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="list_likes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        db_table = "media_list_likes"
        constraints = [
            models.UniqueConstraint(fields=["list", "user"], name="uq_list_like")
        ]

    def __str__(self) -> str:
        return f"{self.list_id}:{self.user_id}"


class ListItemRankHistory(BaseModel):
    """Audit row recording a re-order of a media item on a list."""

    list = models.ForeignKey(UserList, on_delete=models.CASCADE, related_name="rank_history")
    media_item = models.ForeignKey(
        "media.MediaItem", on_delete=models.CASCADE, related_name="list_rank_history"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="list_rank_changes",
    )
    old_sort_order = models.IntegerField()
    new_sort_order = models.IntegerField()
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        db_table = "list_item_rank_history"

    def __str__(self) -> str:
        return f"{self.list_id}:{self.media_item_id}"

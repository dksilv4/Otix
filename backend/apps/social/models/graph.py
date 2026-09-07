"""User graph: friend requests and the user-to-user follow graph.

Ported from the legacy ``friend.py`` and ``follow.py`` domain modules.

Decision: legacy ``follows`` / ``follow_requests`` are **user-to-user only**
(``followed_id`` / ``target_id`` both FK to ``users.id``). The person and
company follow edges live in separate legacy tables (``user_person_follows``,
``user_company_follows``) already ported as ``people.UserPersonFollow`` and
``company.UserCompanyFollow``, so this module owns just the self/friend-user
follow graph and does not re-model person/company targets.
"""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

FRIEND_REQUEST_STATUS_VALUES = ("pending", "accepted", "rejected")
FOLLOW_REQUEST_STATUS_VALUES = ("pending", "accepted", "declined")


class FriendRequest(TimestampedModel):
    """A user asks another user to be a friend."""

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_requests",
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_requests",
    )
    status = models.CharField(max_length=20, default="pending")

    class Meta(TimestampedModel.Meta):
        db_table = "friend_requests"
        constraints = [
            models.UniqueConstraint(
                fields=["sender", "receiver"], name="uq_friend_requests_sender_receiver"
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=FRIEND_REQUEST_STATUS_VALUES),
                name="ck_friend_request_status",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.sender_id}->{self.receiver_id}:{self.status}"


class FollowRequest(TimestampedModel):
    """A request to follow another user (accepted or declined)."""

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="follow_requests_sent",
    )
    target = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="follow_requests_received",
    )
    status = models.CharField(max_length=20, default="pending")
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "follow_requests"
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(requester=models.F("target")),
                name="ck_follow_req_no_self",
            ),
        ]
        indexes = [
            models.Index(fields=["target", "status"], name="ix_follow_req_target_status"),
            models.Index(fields=["requester"], name="ix_follow_requests_requester"),
        ]

    def __str__(self) -> str:
        return f"{self.requester_id}->{self.target_id}:{self.status}"


class Follow(TimestampedModel):
    """An active user-to-user follow edge."""

    follower = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="following",
    )
    followed = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="followers",
    )

    class Meta(TimestampedModel.Meta):
        db_table = "follows"
        constraints = [
            models.UniqueConstraint(
                fields=["follower", "followed"], name="uq_follows_follower_followed"
            ),
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("followed")),
                name="ck_follow_no_self",
            ),
        ]
        indexes = [
            models.Index(fields=["follower"], name="ix_follows_follower"),
            models.Index(fields=["followed"], name="ix_follows_followed"),
        ]

    def __str__(self) -> str:
        return f"{self.follower_id}->{self.followed_id}"

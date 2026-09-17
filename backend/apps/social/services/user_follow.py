"""User-to-user follow graph (port of ``old-backend/otix/services/follow_service.py``).

Follows and pending follow requests mirror the legacy flow: following a user
creates a ``Follow`` edge (the legacy private-account branch that returns a
``FollowRequest`` is unreachable because ``accounts.User`` has no ``is_private``
column yet, so every target is treated as public). Mutations are idempotent and
raise ``ValueError`` for request-state problems that the views map to 400/404.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model

from apps.social.models import Follow, FollowRequest, Notification

FOLLOW_REQUEST_PENDING = "pending"
FOLLOW_REQUEST_ACCEPTED = "accepted"
FOLLOW_REQUEST_DECLINED = "declined"


def get_user_by_username(username: str):
    """Resolve a user by username; ``None`` when the account does not exist."""
    return get_user_model().objects.filter(username=username).first()


def is_following(follower_id: int, followed_id: int) -> bool:
    """Whether ``follower_id`` currently follows ``followed_id``."""
    return Follow.objects.filter(follower_id=follower_id, followed_id=followed_id).exists()


def get_request_status(requester_id: int, target_id: int) -> str | None:
    """Most recent follow-request status from ``requester_id`` to ``target_id``."""
    request = (
        FollowRequest.objects.filter(requester_id=requester_id, target_id=target_id)
        .order_by("-created_at", "-id")
        .first()
    )
    return request.status if request else None


def follow_user(follower_id: int, followed_id: int, target_username: str) -> dict:
    """Follow a public user, creating a ``Follow`` edge and a notification.

    Returns the legacy 201 body. Raises ``ValueError`` for self-follows,
    duplicate follows and already-pending requests.
    """
    if follower_id == followed_id:
        raise ValueError("Cannot follow yourself")
    if is_following(follower_id, followed_id):
        raise ValueError("Already following this user")
    existing = (
        FollowRequest.objects.filter(
            requester_id=follower_id,
            target_id=followed_id,
            status=FOLLOW_REQUEST_PENDING,
        )
        .order_by("-created_at", "-id")
        .first()
    )
    if existing is not None:
        raise ValueError("Follow request already pending")

    Follow.objects.create(follower_id=follower_id, followed_id=followed_id)
    follower = get_user_model().objects.filter(pk=follower_id).first()
    Notification.objects.create(
        user_id=followed_id,
        type="follow",
        title="New Follower",
        body=f"{follower.username if follower else 'Someone'} started following you",
        metadata_json={
            "follower_id": follower_id,
            "follower_username": follower.username if follower else None,
        },
    )
    return {"message": f"Now following {target_username}", "status": "following"}


def unfollow_user(follower_id: int, followed_id: int) -> None:
    """Remove a follow edge; a no-op when no edge exists."""
    Follow.objects.filter(follower_id=follower_id, followed_id=followed_id).delete()


def get_counts(user_id: int) -> dict:
    """Follower/following counts for a user."""
    return {
        "followers": Follow.objects.filter(followed_id=user_id).count(),
        "following": Follow.objects.filter(follower_id=user_id).count(),
    }


def get_pending_requests(target_id: int) -> list[FollowRequest]:
    """Pending follow requests received by ``target_id`` (newest first)."""
    return list(
        FollowRequest.objects.filter(target_id=target_id, status=FOLLOW_REQUEST_PENDING)
        .select_related("requester", "target")
        .order_by("-created_at", "-id")
    )


def accept_follow_request(request_id: int, target_id: int) -> FollowRequest:
    """Accept a pending follow request, creating the follow edge.

    Raises ``ValueError`` when the request is missing/resolved. The view maps the
    403 (only the target may accept) before calling this.
    """
    request = (
        FollowRequest.objects.select_related("requester", "target")
        .filter(pk=request_id, target_id=target_id, status=FOLLOW_REQUEST_PENDING)
        .first()
    )
    if request is None:
        raise ValueError("Follow request not found or already resolved")

    request.status = FOLLOW_REQUEST_ACCEPTED
    request.save(update_fields=["status", "updated_at"])
    Follow.objects.get_or_create(follower_id=request.requester_id, followed_id=request.target_id)
    target = request.target
    Notification.objects.create(
        user_id=request.requester_id,
        type="follow_request_accepted",
        title="Follow Request Accepted",
        body=f"{target.username if target else 'Someone'} accepted your follow request",
        metadata_json={
            "target_id": request.target_id,
            "target_username": target.username if target else None,
        },
    )
    return request


def decline_follow_request(request_id: int, target_id: int) -> FollowRequest:
    """Decline a pending follow request.

    Raises ``ValueError`` when the request is missing/resolved. The view maps the
    403 (only the target may decline) before calling this.
    """
    request = (
        FollowRequest.objects.select_related("requester", "target")
        .filter(pk=request_id, target_id=target_id, status=FOLLOW_REQUEST_PENDING)
        .first()
    )
    if request is None:
        raise ValueError("Follow request not found or already resolved")

    request.status = FOLLOW_REQUEST_DECLINED
    request.save(update_fields=["status", "updated_at"])
    return request


def get_followers(user_id: int):
    """Users following ``user_id``, newest follow first."""
    return (
        get_user_model()
        .objects.filter(following__followed_id=user_id)
        .order_by("-following__created_at", "-following__id")
    )


def get_following(user_id: int):
    """Users that ``user_id`` follows, newest follow first."""
    return (
        get_user_model()
        .objects.filter(followers__follower_id=user_id)
        .order_by("-followers__created_at", "-followers__id")
    )

"""Friend-request graph domain logic.

Port of the legacy ``FriendService`` (``old-backend/otix/services/friend_service.py``)
minus its Celery badge checks. Friends are represented only by accepted
``FriendRequest`` rows (legacy semantics -- there is no separate join row).
``ValueError``/``PermissionError`` are raised for request-state problems and the
views translate them to the legacy 400/403 detail bodies.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

from apps.social.models import FriendRequest, Notification

FR_ACCEPTED = "accepted"
FR_PENDING = "pending"
FR_REJECTED = "rejected"


def get_user_by_id(user_id: int):
    """Resolve a target user by id; ``None`` when the account does not exist."""
    return get_user_model().objects.filter(pk=user_id).first()


def _resolve_friend_request_notifications(receiver_id: int, request_id: int, status: str) -> None:
    """Mark receiver ``friend_request`` rows for this request as resolved.

    Hides Accept/Decline in the feed after the request is no longer pending.
    """
    now = timezone.now()
    for notification in Notification.objects.filter(user_id=receiver_id, type="friend_request"):
        meta = dict(notification.metadata_json or {})
        if meta.get("request_id") != request_id:
            continue
        meta["status"] = status
        notification.metadata_json = meta
        notification.is_read = True
        notification.read_at = now
        notification.save(update_fields=["metadata_json", "is_read", "read_at"])


def send_friend_request(sender_id: int, receiver_id: int) -> FriendRequest:
    """Create (or re-activate) a pending request and notify the receiver."""
    if sender_id == receiver_id:
        raise ValueError("Cannot send friend request to yourself")

    existing = (
        FriendRequest.objects.filter(
            Q(sender_id=sender_id, receiver_id=receiver_id)
            | Q(sender_id=receiver_id, receiver_id=sender_id)
        )
        .order_by("id")
        .first()
    )
    if existing is not None:
        if existing.status == FR_ACCEPTED:
            raise ValueError("Already friends")
        if existing.status == FR_PENDING:
            raise ValueError("A pending request already exists")
        if existing.sender_id == sender_id and existing.receiver_id == receiver_id:
            # A previously rejected same-direction request is reactivated because
            # the greenfield unique constraint forbids a second row per pair.
            existing.status = FR_PENDING
            existing.save(update_fields=["status", "updated_at"])
            request = existing
        else:
            request = FriendRequest.objects.create(
                sender_id=sender_id, receiver_id=receiver_id, status=FR_PENDING
            )
    else:
        request = FriendRequest.objects.create(
            sender_id=sender_id, receiver_id=receiver_id, status=FR_PENDING
        )

    sender = get_user_model().objects.filter(pk=sender_id).first()
    Notification.objects.create(
        user_id=receiver_id,
        type="friend_request",
        title="New Friend Request",
        body=f"{sender.username if sender else 'Someone'} sent you a friend request",
        metadata_json={"sender_id": sender_id, "request_id": request.id},
    )
    return request


def accept_friend_request(request_id: int, user_id: int) -> FriendRequest:
    """Mark a pending request accepted; only its receiver may accept it.

    Re-accepting an already-accepted request is a no-op success so double-clicks
    from the notification UI do not surface a 400.
    """
    request = (
        FriendRequest.objects.select_related("sender", "receiver").filter(pk=request_id).first()
    )
    if request is None:
        raise ValueError("Friend request not found")
    if request.receiver_id != user_id:
        raise PermissionError("You can only accept requests sent to you")
    if request.status == FR_ACCEPTED:
        _resolve_friend_request_notifications(user_id, request_id, FR_ACCEPTED)
        return request
    if request.status != FR_PENDING:
        raise ValueError("Request is no longer pending")

    request.status = FR_ACCEPTED
    request.save(update_fields=["status", "updated_at"])
    receiver = request.receiver
    Notification.objects.create(
        user_id=request.sender_id,
        type="friend_accepted",
        title="Friend Request Accepted",
        body=f"{receiver.username if receiver else 'Someone'} accepted your friend request",
        metadata_json={"sender_id": request.sender_id, "receiver_id": request.receiver_id},
    )
    _resolve_friend_request_notifications(user_id, request_id, FR_ACCEPTED)
    return request


def reject_friend_request(request_id: int, user_id: int) -> FriendRequest:
    """Mark a pending request rejected; only its receiver may reject it.

    Re-rejecting an already-rejected request is a no-op success so double-clicks
    from the notification UI do not surface a 400.
    """
    request = (
        FriendRequest.objects.select_related("sender", "receiver").filter(pk=request_id).first()
    )
    if request is None:
        raise ValueError("Friend request not found")
    if request.receiver_id != user_id:
        raise PermissionError("You can only reject requests sent to you")
    if request.status == FR_REJECTED:
        _resolve_friend_request_notifications(user_id, request_id, FR_REJECTED)
        return request
    if request.status != FR_PENDING:
        raise ValueError("Request is no longer pending")

    request.status = FR_REJECTED
    request.save(update_fields=["status", "updated_at"])
    receiver = request.receiver
    Notification.objects.create(
        user_id=request.sender_id,
        type="friend_rejected",
        title="Friend Request Declined",
        body=f"{receiver.username if receiver else 'Someone'} declined your friend request",
        metadata_json={"receiver_id": user_id, "request_id": request.id},
    )
    _resolve_friend_request_notifications(user_id, request_id, FR_REJECTED)
    return request


def count_friends(user_id: int) -> int:
    """Number of accepted friendships for ``user_id``."""
    return FriendRequest.objects.filter(
        Q(sender_id=user_id) | Q(receiver_id=user_id), status=FR_ACCEPTED
    ).count()


def list_friends(user_id: int):
    """Return the user's accepted friends as ``User`` rows with ``friends_since``.

    The legacy router orders the list by friend username and reports the
    accepted edge's ``updated_at`` as ``friends_since``.
    """
    edges = (
        FriendRequest.objects.filter(
            Q(sender_id=user_id) | Q(receiver_id=user_id), status=FR_ACCEPTED
        )
        .select_related("sender", "receiver")
        .order_by("updated_at", "id")
    )
    friends = []
    for edge in edges:
        friend = edge.receiver if edge.sender_id == user_id else edge.sender
        friend.friends_since = edge.updated_at
        friends.append(friend)
    return sorted(friends, key=lambda friend: friend.username)


def pending_received(user_id: int):
    """Incoming pending requests (ordered newest first)."""
    return (
        FriendRequest.objects.select_related("sender", "receiver")
        .filter(receiver_id=user_id, status=FR_PENDING)
        .order_by("-created_at", "-id")
    )


def pending_sent(user_id: int):
    """Outgoing pending requests (ordered newest first)."""
    return (
        FriendRequest.objects.select_related("sender", "receiver")
        .filter(sender_id=user_id, status=FR_PENDING)
        .order_by("-created_at", "-id")
    )


def get_friendship_status(user_a: int, user_b: int) -> dict:
    """Legacy ``FriendshipStatusOut`` keys for a pair of users."""
    edge = (
        FriendRequest.objects.filter(
            Q(sender_id=user_a, receiver_id=user_b) | Q(sender_id=user_b, receiver_id=user_a)
        )
        .order_by("id")
        .first()
    )
    if edge is None:
        return {"status": "none", "request_id": None}
    if edge.status == FR_ACCEPTED:
        return {"status": "friends", "request_id": edge.id}
    if edge.status == FR_PENDING:
        sent = "pending_sent" if edge.sender_id == user_a else "pending_received"
        return {"status": sent, "request_id": edge.id}
    return {"status": "none", "request_id": None}


def remove_friend(user_id: int, friend_id: int) -> bool:
    """Delete an accepted edge; returns whether anything was removed."""
    deleted, _ = FriendRequest.objects.filter(
        Q(sender_id=user_id, receiver_id=friend_id) | Q(sender_id=friend_id, receiver_id=user_id),
        status=FR_ACCEPTED,
    ).delete()
    if deleted:
        remover = get_user_model().objects.filter(pk=user_id).first()
        Notification.objects.create(
            user_id=friend_id,
            type="friend_removed",
            title="Friend Removed",
            body=f"{remover.username if remover else 'Someone'} removed you from friends",
            metadata_json={"remover_id": user_id},
        )
    return deleted > 0

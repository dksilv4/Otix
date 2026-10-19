"""Friend-graph output shapes (social domain).

Mirrors the legacy FastAPI schemas in ``old-backend/otix/schemas/friend.py``:
``FriendOut`` (my friends), ``FriendRequestOut`` (incoming/outgoing requests with
nested sender/receiver users) and ``FriendshipStatusOut``. These are plain read
serializers -- the friend list is derived from accepted ``FriendRequest`` edges
so it has no single backing model; each edge carries a ``friends_since`` value
attached by the service layer.
"""

from rest_framework import serializers


class FriendUserSerializer(serializers.Serializer):
    """A nested user summary inside a friend request (legacy ``FriendRequestUserOut``)."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    avatar_url = serializers.CharField(read_only=True, allow_null=True)
    steam_id = serializers.CharField(read_only=True, allow_null=True)
    plex_id = serializers.CharField(read_only=True, allow_null=True)
    total_xp = serializers.IntegerField(read_only=True, required=False, default=0)
    bio = serializers.CharField(read_only=True, allow_null=True, required=False)


class FriendRequestOutSerializer(serializers.Serializer):
    """One pending friend request (legacy ``FriendRequestOut``)."""

    id = serializers.IntegerField(read_only=True)
    sender_id = serializers.IntegerField(read_only=True)
    receiver_id = serializers.IntegerField(read_only=True)
    status = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    sender = FriendUserSerializer(read_only=True)
    receiver = FriendUserSerializer(read_only=True)


class FriendOutSerializer(serializers.Serializer):
    """A friend in the authenticated user's list (legacy ``FriendOut``)."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    avatar_url = serializers.CharField(read_only=True, allow_null=True)
    friends_since = serializers.DateTimeField(read_only=True, allow_null=True)
    last_login = serializers.DateTimeField(read_only=True, allow_null=True, required=False)
    total_xp = serializers.IntegerField(read_only=True, required=False, default=0)
    bio = serializers.CharField(read_only=True, allow_null=True, required=False)


class FriendshipStatusSerializer(serializers.Serializer):
    """Status between two users (legacy ``FriendshipStatusOut``)."""

    status = serializers.CharField(read_only=True)
    request_id = serializers.IntegerField(read_only=True, allow_null=True)

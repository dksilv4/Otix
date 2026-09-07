"""Review-vote request/response shapes (social domain).

Mirrors the legacy ``VoteCreate`` / ``VoteCountsOut`` schemas from
``backend/otix/schemas/karma.py`` used by the ``/reviews/{...}/vote`` router.
The greenfield ``ReviewVote.vote_type`` is constrained to ``up``/``down`` by a
model CheckConstraint, so the request body is a ChoiceField rather than a free
string.
"""

from rest_framework import serializers


class VoteBodySerializer(serializers.Serializer):
    """Vote request body (legacy ``VoteCreate``)."""

    vote_type = serializers.ChoiceField(choices=("up", "down"))


class VoteCountsSerializer(serializers.Serializer):
    """Vote tallies for a review (legacy ``VoteCountsOut``)."""

    up = serializers.IntegerField(read_only=True)
    down = serializers.IntegerField(read_only=True)
    my_vote = serializers.CharField(read_only=True, allow_null=True)

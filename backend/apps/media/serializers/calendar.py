"""Media-calendar serializers (legacy ``backend/otix/schemas/calendar.py``).

``CalendarEvent`` mirrors the legacy event payload for watchlist releases,
new episodes and franchise/collection sequels. ``episode_info`` is only present
for ``new_episode`` events; the other event types carry ``null``.
"""

from rest_framework import serializers

from apps.media.serializers import EpisodeOutSerializer


class CalendarEventSerializer(serializers.Serializer):
    id = serializers.CharField()
    media_item_id = serializers.IntegerField()
    media_type = serializers.CharField()
    title = serializers.CharField()
    poster_url = serializers.CharField(allow_null=True)
    slug = serializers.CharField()
    release_date = serializers.DateField()
    event_type = serializers.CharField()
    reason = serializers.CharField()
    episode_info = EpisodeOutSerializer(allow_null=True)
    season_number = serializers.IntegerField(allow_null=True)

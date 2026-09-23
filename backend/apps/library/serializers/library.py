"""Library read serializers.

Port the legacy response schemas in ``old-backend/otix/schemas/media.py``. Every
shape is field-listed explicitly (never ``__all__``) and timestamps render as
the ISO strings the legacy JSON API returned, so ``response.data`` matches the
wire format. Media-item summaries read ``_resolved_*`` asset/tmdb attributes and
endpoint overlays attached by ``apps.library.services.summaries.enrich_media_items``.
"""

from datetime import date, datetime

from rest_framework import serializers

from apps.integrations.models import UserEpicGame, UserSteamGame, UserYoutubeLikedVideo
from apps.library.models import UserGameServer, UserLocalGame
from apps.library.services.summaries import build_media_item_summary
from apps.media.models import MediaItem


def _iso(value: date | datetime | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, date | datetime):
        return value.isoformat()
    return value


class InstalledGameSerializer(serializers.Serializer):
    """One installed local game with enriched catalog fields (legacy ``InstalledGameSummary``)."""

    def to_representation(self, game: UserLocalGame) -> dict:
        media_item = game.media_item
        return {
            "id": game.id,
            "title": game.title,
            "platform": game.platform,
            "media_item_id": game.media_item_id,
            "match_suggestion_media_id": game.match_suggestion_media_id,
            "last_seen_at": _iso(game.last_seen_at),
            "catalog_title": media_item.title if media_item is not None else None,
            "catalog_slug": media_item.slug if media_item is not None else None,
            "catalog_poster_url": (
                getattr(media_item, "_resolved_poster_url", None)
                if media_item is not None
                else None
            ),
            "catalog_textless_poster_url": (
                getattr(media_item, "_resolved_textless_poster_url", None)
                if media_item is not None
                else None
            ),
            "catalog_logo_url": (
                getattr(media_item, "_resolved_logo_url", None) if media_item is not None else None
            ),
            "catalog_avg_rating": media_item.avg_rating if media_item is not None else None,
        }


class EpicUnmatchedGameSerializer(serializers.Serializer):
    """One unmatched Epic row."""

    def to_representation(self, game: UserEpicGame) -> dict:
        return {
            "id": game.id,
            "app_name": game.app_name,
            "epic_name": game.title,
            "namespace": game.namespace,
            "catalog_item_id": game.catalog_item_id,
            "offer_id": game.offer_id,
        }


class SteamUnmatchedGameSerializer(serializers.Serializer):
    """One unmatched Steam row (legacy ``SteamUnmatchedGameSummary``)."""

    def to_representation(self, game: UserSteamGame) -> dict:
        return {
            "id": game.id,
            "steam_app_id": game.steam_app_id,
            "steam_name": game.name,
            "steam_playtime_forever": game.playtime_forever,
            "steam_playtime_2weeks": game.playtime_2weeks,
            "steam_img_icon_url": game.img_icon_url,
            "steam_rtime_last_played": game.rtime_last_played,
        }


class SteamWishlistItemSerializer(serializers.Serializer):
    """One matched wishlist item (legacy ``SteamWishlistItemSummary``)."""

    def to_representation(self, item: MediaItem) -> dict:
        return {
            "id": item.id,
            "media_type": item.media_type,
            "title": item.title,
            "slug": item.slug,
            "poster_url": getattr(item, "_resolved_poster_url", None),
            "logo_url": getattr(item, "_resolved_logo_url", None),
            "textless_poster_url": getattr(item, "_resolved_textless_poster_url", None),
            "release_date": _iso(item.release_date),
            "steam_priority": getattr(item, "_steam_priority", 0),
        }


class YoutubeLikedVideoSerializer(serializers.Serializer):
    """One raw YouTube liked video (legacy ``YoutubeLikedVideoOut``)."""

    def to_representation(self, video: UserYoutubeLikedVideo) -> dict:
        return {
            "video_id": video.video_id,
            "title": video.title,
            "channel_title": video.channel_title,
            "channel_id": video.channel_id,
            "thumbnail_url": video.thumbnail_url,
            "published_at": video.published_at,
            "matched_media_item_id": video.matched_media_item_id,
            "matched_title": video.matched_title,
            "matched_artist": video.matched_artist,
            "created_at": _iso(video.created_at),
        }


class MediaItemSummarySerializer(serializers.Serializer):
    """Full media-item summary card (legacy ``MediaItemSummary``).

    Used by the plex, steam, and generic library-tab grids; reads model columns,
    ``_resolved_*`` asset/tmdb attributes, and per-endpoint overlays attached by
    the service layer.
    """

    def to_representation(self, item: MediaItem) -> dict:
        return build_media_item_summary(item)


class UserGameServerSerializer(serializers.ModelSerializer):
    """Legacy remote-node serializer (product path is the Django backend node)."""

    primary_url = serializers.CharField(read_only=True)
    # Never expose node secrets (C2). Field kept write-only for old create payloads.
    auth_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = UserGameServer
        fields = [
            "id",
            "name",
            "local_url",
            "remote_url",
            "primary_url",
            "auth_token",
            "is_online",
            "last_seen_at",
            "total_files",
            "storage_free_bytes",
            "storage_total_bytes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "is_online",
            "last_seen_at",
            "total_files",
            "storage_free_bytes",
            "storage_total_bytes",
            "created_at",
            "updated_at",
        ]


class UserGameServerCreateSerializer(serializers.ModelSerializer):
    """Payload to register or update a self-hosted game server."""

    class Meta:
        model = UserGameServer
        fields = [
            "name",
            "local_url",
            "remote_url",
            "auth_token",
            "is_active",
        ]

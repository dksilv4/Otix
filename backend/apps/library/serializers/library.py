"""Library read serializers.

Port the legacy response schemas in ``old-backend/otix/schemas/media.py``. Every
shape is field-listed explicitly (never ``__all__``) and timestamps render as
the ISO strings the legacy JSON API returned, so ``response.data`` matches the
wire format. Media-item summaries read ``_resolved_*`` asset/tmdb attributes and
endpoint overlays attached by ``apps.library.services.summaries.enrich_media_items``.
"""

from datetime import date, datetime

from rest_framework import serializers

from apps.integrations.models import (
    UserEpicGame,
    UserGOGGame,
    UserSteamGame,
    UserYoutubeLikedVideo,
)
from apps.library.models import (
    NodeGameSource,
    UserGame,
    UserGameSession,
    UserLocalGame,
    UserNodeShare,
)
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


class GOGUnmatchedGameSerializer(serializers.Serializer):
    """One unmatched GOG row."""

    def to_representation(self, game: UserGOGGame) -> dict:
        return {
            "id": game.id,
            "game_id": game.game_id,
            "title": game.title,
            "slug": game.slug,
            "image": game.image,
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


# UserNodeSerializer and UserNodeCreateSerializer are imported from apps.library.serializers.node above.


class UserNodeShareSerializer(serializers.ModelSerializer):
    """Representation of an Otix Node share with a friend or link."""

    shared_with = serializers.SerializerMethodField()
    shared_with_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = UserNodeShare
        fields = [
            "id",
            "node_id",
            "shared_with",
            "shared_with_id",
            "share_token",
            "is_public_link",
            "allow_all_libraries",
            "allowed_libraries",
            "permission",
            "created_at",
        ]
        read_only_fields = ["id", "node_id", "share_token", "created_at"]

    def get_shared_with(self, obj) -> dict | None:
        if not obj.shared_with:
            return None
        return {
            "id": obj.shared_with.id,
            "username": obj.shared_with.username,
            "avatar_url": getattr(obj.shared_with, "avatar_url", None),
            "display_name": getattr(obj.shared_with, "display_name", None)
            or obj.shared_with.username,
        }



class UserGameSessionSerializer(serializers.ModelSerializer):
    """Representation of a persisted user gameplay session."""

    id = serializers.SerializerMethodField()
    db_id = serializers.IntegerField(source="id", read_only=True)
    fps_stats = serializers.SerializerMethodField()
    node = serializers.SerializerMethodField()
    otix_media_id = serializers.SerializerMethodField()
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()

    class Meta:
        model = UserGameSession
        fields = (
            "id",
            "db_id",
            "session_id",
            "game_id",
            "game_title",
            "process_name",
            "platform",
            "start_time",
            "end_time",
            "duration_seconds",
            "avg_fps",
            "min_fps",
            "max_fps",
            "low_1_percent",
            "low_01_percent",
            "total_frames",
            "fps_stats",
            "node",
            "node_name",
            "hardware",
            "poster_url",
            "backdrop_url",
            "banner_url",
            "slug",
            "otix_media_id",
            "is_private",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_id(self, obj: UserGameSession) -> str:
        return obj.session_id or str(obj.id)

    def get_start_time(self, obj: UserGameSession) -> str | None:
        return _iso(obj.start_time)

    def get_end_time(self, obj: UserGameSession) -> str | None:
        return _iso(obj.end_time)

    def get_otix_media_id(self, obj: UserGameSession) -> str | None:
        return str(obj.media_item_id) if obj.media_item_id else None

    def get_node(self, obj: UserGameSession) -> dict | None:
        if obj.node_info and isinstance(obj.node_info, dict):
            return obj.node_info
        if obj.node_name:
            return {"name": obj.node_name}
        return None

    def get_fps_stats(self, obj: UserGameSession) -> dict:
        stats = dict(obj.fps_stats or {})
        if obj.avg_fps is not None and "avg_fps" not in stats:
            stats["avg_fps"] = obj.avg_fps
        if obj.min_fps is not None and "min_fps" not in stats:
            stats["min_fps"] = obj.min_fps
        if obj.max_fps is not None and "max_fps" not in stats:
            stats["max_fps"] = obj.max_fps
        if obj.low_1_percent is not None and "low_1_percent" not in stats:
            stats["low_1_percent"] = obj.low_1_percent
        if obj.low_01_percent is not None and "low_01_percent" not in stats:
            stats["low_01_percent"] = obj.low_01_percent
        if obj.total_frames is not None and "total_frames" not in stats:
            stats["total_frames"] = obj.total_frames
        return stats


class NodeGameSourceSerializer(serializers.ModelSerializer):
    """Physical instance of a game on a specific node."""

    node_name = serializers.CharField(source="node.name", read_only=True)
    share_name = serializers.CharField(source="storage_share.name", read_only=True, allow_null=True)
    node_online = serializers.BooleanField(source="node.is_online", read_only=True)
    primary_url = serializers.CharField(source="node.primary_url", read_only=True)

    class Meta:
        model = NodeGameSource
        fields = (
            "id",
            "node_id",
            "node_name",
            "node_online",
            "primary_url",
            "storage_share_id",
            "share_name",
            "canonical_path",
            "relative_path",
            "source_state",
            "file_size",
            "sha256_head",
            "is_available",
            "format_details",
            "last_seen_at",
            "created_at",
        )
        read_only_fields = fields


class UserGameSerializer(serializers.ModelSerializer):
    """Canonical game entity aggregating all physical node sources."""

    sources = NodeGameSourceSerializer(many=True, read_only=True)
    catalog_title = serializers.CharField(source="media_item.title", read_only=True, allow_null=True)
    catalog_slug = serializers.CharField(source="media_item.slug", read_only=True, allow_null=True)
    catalog_poster_url = serializers.SerializerMethodField()
    catalog_backdrop_url = serializers.SerializerMethodField()

    class Meta:
        model = UserGame
        fields = (
            "id",
            "clean_title",
            "platform",
            "media_item_id",
            "catalog_title",
            "catalog_slug",
            "catalog_poster_url",
            "catalog_backdrop_url",
            "cover_image_url",
            "is_favorite",
            "is_hidden",
            "last_played_at",
            "sources",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_catalog_poster_url(self, obj: UserGame) -> str | None:
        if obj.media_item:
            return (
                getattr(obj.media_item, "poster_url", None)
                or getattr(obj.media_item, "_resolved_poster_url", None)
            )
        return obj.cover_image_url or None

    def get_catalog_backdrop_url(self, obj: UserGame) -> str | None:
        if obj.media_item:
            return (
                getattr(obj.media_item, "backdrop_url", None)
                or getattr(obj.media_item, "_resolved_backdrop_url", None)
            )
        return None


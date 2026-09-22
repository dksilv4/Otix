"""Django admin registration for every media-catalog model."""

from django.contrib import admin

from apps.media.models import (
    Episode,
    ExternalID,
    ExternalRating,
    Franchise,
    FranchiseItem,
    Game,
    GameMode,
    Genre,
    Keyword,
    MediaAsset,
    MediaGameMode,
    MediaGenre,
    MediaGenreType,
    MediaItem,
    MediaKeyword,
    MediaPlatform,
    MediaRelease,
    MediaVideo,
    MediaWatchProvider,
    Movie,
    Platform,
    Season,
    Show,
    WatchProvider,
)

admin.site.register(MediaItem, admin.ModelAdmin)
admin.site.register(Movie, admin.ModelAdmin)
admin.site.register(Show, admin.ModelAdmin)
admin.site.register(Season, admin.ModelAdmin)
admin.site.register(Episode, admin.ModelAdmin)
admin.site.register(Game, admin.ModelAdmin)
admin.site.register(ExternalID, admin.ModelAdmin)
admin.site.register(ExternalRating, admin.ModelAdmin)
admin.site.register(MediaAsset, admin.ModelAdmin)
admin.site.register(MediaVideo, admin.ModelAdmin)
admin.site.register(MediaRelease, admin.ModelAdmin)
admin.site.register(Genre, admin.ModelAdmin)
admin.site.register(MediaGenreType, admin.ModelAdmin)
admin.site.register(Keyword, admin.ModelAdmin)
admin.site.register(MediaGenre, admin.ModelAdmin)
admin.site.register(MediaKeyword, admin.ModelAdmin)
admin.site.register(Franchise, admin.ModelAdmin)
admin.site.register(FranchiseItem, admin.ModelAdmin)
admin.site.register(Platform, admin.ModelAdmin)
admin.site.register(MediaPlatform, admin.ModelAdmin)
admin.site.register(GameMode, admin.ModelAdmin)
admin.site.register(MediaGameMode, admin.ModelAdmin)
admin.site.register(WatchProvider, admin.ModelAdmin)
admin.site.register(MediaWatchProvider, admin.ModelAdmin)

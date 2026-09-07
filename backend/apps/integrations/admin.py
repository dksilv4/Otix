"""Django admin registration for every integrations model."""

from django.contrib import admin

from apps.integrations.models import (
    ProviderState,
    SyncJob,
    UserPlexItem,
    UserPlexLibrary,
    UserPlexServer,
    UserSteamGame,
    UserSteamWishlist,
    UserYoutubeLikedVideo,
)

admin.site.register(SyncJob, admin.ModelAdmin)
admin.site.register(ProviderState, admin.ModelAdmin)
admin.site.register(UserPlexServer, admin.ModelAdmin)
admin.site.register(UserPlexLibrary, admin.ModelAdmin)
admin.site.register(UserPlexItem, admin.ModelAdmin)
admin.site.register(UserSteamGame, admin.ModelAdmin)
admin.site.register(UserSteamWishlist, admin.ModelAdmin)
admin.site.register(UserYoutubeLikedVideo, admin.ModelAdmin)

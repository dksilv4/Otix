"""Django admin registration for Track-domain models."""

from django.contrib import admin

from apps.track.models import GameSaveOfficialPath, GameSavePathSuggestion

admin.site.register(GameSaveOfficialPath, admin.ModelAdmin)
admin.site.register(GameSavePathSuggestion, admin.ModelAdmin)

"""Django admin registration for Library-domain models."""

from django.contrib import admin

from apps.library.models import UserLocalGame

admin.site.register(UserLocalGame, admin.ModelAdmin)

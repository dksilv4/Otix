"""Django admin registration for blueprint-domain models."""

from django.contrib import admin

from apps.blueprint.models import Blueprint, BlueprintLike

admin.site.register(Blueprint, admin.ModelAdmin)
admin.site.register(BlueprintLike, admin.ModelAdmin)

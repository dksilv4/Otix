"""Django admin registration for Search-domain models."""

from django.contrib import admin

from apps.search.models import SearchLog

admin.site.register(SearchLog, admin.ModelAdmin)

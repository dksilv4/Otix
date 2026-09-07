"""Django admin registration for every push model."""

from django.contrib import admin

from apps.push.models import PushSubscription

admin.site.register(PushSubscription, admin.ModelAdmin)

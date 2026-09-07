"""Django admin registration for people-domain models."""

from django.contrib import admin

from apps.people.models import MediaCredit, Person, PersonAsset, PersonRating, UserPersonFollow

admin.site.register(Person, admin.ModelAdmin)
admin.site.register(PersonAsset, admin.ModelAdmin)
admin.site.register(MediaCredit, admin.ModelAdmin)
admin.site.register(UserPersonFollow, admin.ModelAdmin)
admin.site.register(PersonRating, admin.ModelAdmin)

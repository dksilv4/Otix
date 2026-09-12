"""Django admin registration for every lists model."""

from django.contrib import admin

from apps.lists.models import (
    Collection,
    CollectionItem,
    ListItemRankHistory,
    MediaListCollaborator,
    MediaListLike,
    UserList,
    UserListItem,
)

admin.site.register(Collection, admin.ModelAdmin)
admin.site.register(CollectionItem, admin.ModelAdmin)
admin.site.register(MediaListCollaborator, admin.ModelAdmin)
admin.site.register(MediaListLike, admin.ModelAdmin)
admin.site.register(UserList, admin.ModelAdmin)
admin.site.register(UserListItem, admin.ModelAdmin)
admin.site.register(ListItemRankHistory, admin.ModelAdmin)

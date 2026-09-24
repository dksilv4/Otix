"""Django admin for the plugin registry.

Rows are created by ``plugins_scan`` (or a future API), never by hand, so the
manifest-mirror fields are read-only. Operators edit the state fields only:
enabled, error (to clear), the granted permission set and config/instances.
"""

from django.contrib import admin

from plugin_framework.models import Plugin, PluginAccessToken, PluginAccessTokenGrant


@admin.register(Plugin)
class PluginAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "version",
        "stage",
        "system",
        "enabled",
        "updated_at",
    )
    list_filter = ("enabled", "system", "stage")
    search_fields = ("name", "description", "author")
    ordering = ("name",)
    readonly_fields = (
        "name",
        "version",
        "description",
        "author",
        "repository",
        "icon",
        "stage",
        "min_app_version",
        "manifest",
        "permissions_declared",
        "system",
        "created_at",
        "updated_at",
    )
    fieldsets = (
        (None, {"fields": ("name", "version", "stage", "system", "enabled", "error")}),
        ("Identity", {"fields": ("description", "author", "repository", "icon")}),
        (
            "Permissions",
            {
                "description": "Declared comes from the manifest; granted is what the "
                "operator approves. Enabling requires declared ⊆ granted "
                "(wildcards table:any / network:any cover a whole scope).",
                "fields": ("permissions_declared", "permissions_granted"),
            },
        ),
        ("Config", {"fields": ("config", "instances")}),
        ("Manifest snapshot", {"fields": ("manifest",)}),
        ("Audit", {"fields": ("created_at", "updated_at")}),
    )

    def has_add_permission(self, request) -> bool:
        return False  # rows come from plugins_scan / the plugin API

    def has_delete_permission(self, request, obj=None) -> bool:
        return False  # uninstall goes through the registry service (system-guarded)


class PluginAccessTokenGrantInline(admin.TabularInline):
    model = PluginAccessTokenGrant
    extra = 0


@admin.register(PluginAccessToken)
class PluginAccessTokenAdmin(admin.ModelAdmin):
    list_display = ("name", "prefix", "is_active", "expires_at", "last_used_at", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "prefix")
    readonly_fields = ("prefix", "token_hash", "last_used_at", "created_by", "created_at")
    inlines = (PluginAccessTokenGrantInline,)
    fieldsets = (
        (None, {"fields": ("name", "is_active", "expires_at")}),
        ("Secret", {"fields": ("prefix", "token_hash")}),
        ("Audit", {"fields": ("created_by", "last_used_at", "created_at")}),
    )

    def save_model(self, request, obj, form, change) -> None:
        if not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

"""URLs for the plugin framework API (additive routes under /api/v1/plugins/).

Route order matters: literal ``capabilities`` and the two-segment sub-routes
(config / call / state actions) must precede the single-segment ``<plugin_id>``
detail pattern so they are not swallowed as plugin ids.
"""

from django.urls import path

from plugin_framework import gateway_views, views

urlpatterns = [
    path("", views.PluginListView.as_view(), name="plugin-list"),
    path("capabilities", views.PluginCapabilitiesView.as_view(), name="plugin-capabilities"),
    # Gateway token management (admin-only) must precede the two-segment
    # <plugin_id>/<action> state route so "access/tokens" isn't read as a plugin.
    path(
        "access/tokens",
        gateway_views.TokenListCreateView.as_view(),
        name="plugin-access-tokens",
    ),
    path(
        "access/tokens/<int:token_id>",
        gateway_views.TokenDetailView.as_view(),
        name="plugin-access-token-detail",
    ),
    path(
        "<str:plugin_id>/access-token",
        gateway_views.PluginAccessTokenView.as_view(),
        name="plugin-access-token",
    ),
    path("<str:plugin_id>/call", views.PluginCallView.as_view(), name="plugin-call"),
    path("<str:plugin_id>/config", views.PluginConfigView.as_view(), name="plugin-config"),
    path(
        "<str:plugin_id>/<str:action>",
        views.PluginStateView.as_view(),
        name="plugin-state",
    ),
    path("<str:plugin_id>", views.PluginDetailView.as_view(), name="plugin-detail"),
]

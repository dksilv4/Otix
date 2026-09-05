"""URLs for the plugin framework API (additive routes under /api/v1/plugins/).

Route order matters: literal ``capabilities`` and the two-segment sub-routes
(config / call / state actions) must precede the single-segment ``<plugin_id>``
detail pattern so they are not swallowed as plugin ids.
"""

from django.urls import path

from plugins import views

urlpatterns = [
    path("", views.PluginListView.as_view(), name="plugin-list"),
    path("capabilities", views.PluginCapabilitiesView.as_view(), name="plugin-capabilities"),
    path("<str:plugin_id>/call", views.PluginCallView.as_view(), name="plugin-call"),
    path("<str:plugin_id>/config", views.PluginConfigView.as_view(), name="plugin-config"),
    path(
        "<str:plugin_id>/<str:action>",
        views.PluginStateView.as_view(),
        name="plugin-state",
    ),
    path("<str:plugin_id>", views.PluginDetailView.as_view(), name="plugin-detail"),
]

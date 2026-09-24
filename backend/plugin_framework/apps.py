"""Django app config for the plugin framework.

``plugins`` is the host-side framework the design doc (2026-09-04, §4) calls
for: server-side plugins are discoverable Python apps the brain runs natively.
The package also stays a plain-python home for the framework core (manifest,
permissions, discovery, dispatch) so plugins can import ``plugins.manifest``
etc. without pulling Django model baggage. Registered as an installed app only
so its tests run in the default suite and so later increments can add host
models (permission grants, instance config) with real migrations.
"""

from django.apps import AppConfig


class PluginsConfig(AppConfig):
    name = "plugin_framework"
    label = "plugin_framework"
    verbose_name = "Plugins framework"
    default_auto_field = "django.db.models.BigAutoField"

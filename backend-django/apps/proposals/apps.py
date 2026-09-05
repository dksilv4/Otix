from django.apps import AppConfig


class ProposalsConfig(AppConfig):
    name = "apps.proposals"
    verbose_name = "Proposals"
    # Label defaults to "proposals" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"

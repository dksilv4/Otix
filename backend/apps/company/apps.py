from django.apps import AppConfig


class CompanyConfig(AppConfig):
    name = "apps.company"
    verbose_name = "Company"
    # Label defaults to "company" (last component of ``name``).
    default_auto_field = "django.db.models.BigAutoField"

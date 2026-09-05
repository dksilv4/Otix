from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    verbose_name = "Accounts"
    # label defaults to "accounts" (last component of ``name``), which is what
    # AUTH_USER_MODEL = "accounts.User" resolves against.

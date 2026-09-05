"""Accounts domain models.

Follows the models-package convention: one module per aggregate/concern, with
all public model classes re-exported here so app code writes
``from apps.accounts.models import User``.
"""

from apps.accounts.models.managers import UserManager
from apps.accounts.models.user import User

__all__ = ["User", "UserManager"]

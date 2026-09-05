"""Accounts domain services, re-exported for convenient imports.

Plain callables operating on the models layer; views stay thin and delegate
here. The profile-hub reads in this package are the identity slice of the
``/users`` surface and call into the social services for graph aggregates.
"""

from apps.accounts.services.user_profile import (
    build_user_profile,
    get_user_by_username,
    search_users,
)

__all__ = ["build_user_profile", "get_user_by_username", "search_users"]

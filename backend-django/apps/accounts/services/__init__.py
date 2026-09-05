"""Accounts domain services, re-exported for convenient imports.

Plain callables operating on the models layer; views stay thin and delegate
here. The profile-hub reads in this package are the identity slice of the
``/users`` surface and call into the social services for graph aggregates.
"""

from apps.accounts.services.oauth import (
    build_google_drive_link_url,
    build_google_link_url,
    get_user_google_access_token,
    link_google_drive_to_user,
    link_google_to_user,
    unlink_google_drive_from_user,
    unlink_google_from_user,
)
from apps.accounts.services.user_profile import (
    build_user_profile,
    get_user_by_username,
    search_users,
)

__all__ = [
    "build_google_drive_link_url",
    "build_google_link_url",
    "build_user_profile",
    "get_user_by_username",
    "get_user_google_access_token",
    "link_google_drive_to_user",
    "link_google_to_user",
    "search_users",
    "unlink_google_drive_from_user",
    "unlink_google_from_user",
]

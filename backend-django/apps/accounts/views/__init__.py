"""Accounts API views, re-exported for convenient imports."""

from apps.accounts.views.auth import MeView, RegisterView
from apps.accounts.views.user_continue import ContinueWatchingView
from apps.accounts.views.user_profile import UserDetailView, UserSearchView

__all__ = [
    "ContinueWatchingView",
    "MeView",
    "RegisterView",
    "UserDetailView",
    "UserSearchView",
]

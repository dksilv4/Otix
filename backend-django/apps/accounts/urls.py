"""Account/auth routes.

Mounted at ``/api/v1/auth/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide).
"""

from django.urls import path

from apps.accounts.views import MeView, RegisterView

app_name = "accounts"

urlpatterns = [
    path("register", RegisterView.as_view(), name="register"),
    path("me", MeView.as_view(), name="me"),
]

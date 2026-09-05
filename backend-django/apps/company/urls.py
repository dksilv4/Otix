"""Company routes.

Mounted at ``/api/v1/company/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide).
"""

from django.urls import path

from apps.company.views import CompanyDetailView, CompanyFollowView, CompanyRatingView

app_name = "company"

urlpatterns = [
    path("<company_id>", CompanyDetailView.as_view(), name="company-detail"),
    path("<company_id>/follow", CompanyFollowView.as_view(), name="company-follow"),
    path("<company_id>/rating", CompanyRatingView.as_view(), name="company-rating"),
]

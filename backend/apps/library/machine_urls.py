"""Machine endpoints mounted at /api/v1/machines/."""

from django.urls import path

from apps.library.views.machines import (
    UserMachineDetailView,
    UserMachineDetectDrivesView,
    UserMachineListCreateView,
)

app_name = "machines"

urlpatterns = [
    path("", UserMachineListCreateView.as_view(), name="machine-list-create"),
    path("<int:machine_id>", UserMachineDetailView.as_view(), name="machine-detail"),
    path(
        "<int:machine_id>/detect-drives",
        UserMachineDetectDrivesView.as_view(),
        name="machine-detect-drives",
    ),
    path(
        "detect-drives",
        UserMachineDetectDrivesView.as_view(),
        name="machine-detect-drives-global",
    ),
]

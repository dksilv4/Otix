"""Legacy re-export for machines views."""

from apps.library.views import machines
httpx = machines.httpx

from apps.library.views.machines import (
    UserHomeDetailView,
    UserHomeListCreateView,
    UserMachineDetailView,
    UserMachineDetectDrivesView,
    UserMachineListCreateView,
    UserServerMachineDetailView,
    UserServerMachineDetectDrivesView,
    UserServerMachineListCreateView,
)

__all__ = [
    "UserHomeDetailView",
    "UserHomeListCreateView",
    "UserMachineDetailView",
    "UserMachineDetectDrivesView",
    "UserMachineListCreateView",
    "UserServerMachineDetailView",
    "UserServerMachineDetectDrivesView",
    "UserServerMachineListCreateView",
]

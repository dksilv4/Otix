"""Legacy re-export for UserMachine."""

from apps.library.models.user_machine import OS_CHOICES, UserMachine, UserServerMachine

__all__ = ["OS_CHOICES", "UserMachine", "UserServerMachine"]

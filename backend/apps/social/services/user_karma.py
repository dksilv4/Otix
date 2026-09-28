"""User karma (port of ``old-backend/otix/services/karma_service.py``).

The legacy ``User.karma`` running column has no greenfield home, so the balance
is aggregated from the ``KarmaTransaction`` ledger on read (legacy kept the two
in sync via the same transaction rows).
"""

from __future__ import annotations

from django.db.models import Sum

from apps.social.models import KarmaTransaction


def get_karma_balance(user_id: int) -> int:
    """Sum of all karma deltas for a user."""
    total = KarmaTransaction.objects.filter(user_id=user_id).aggregate(total=Sum("amount"))["total"]
    return total if total is not None else 0


def get_karma_transactions(user_id: int):
    """A user's karma transaction history, newest first."""
    return KarmaTransaction.objects.filter(user_id=user_id).order_by("-created_at", "-id")

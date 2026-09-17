"""Achievement/badge/karma endpoints (``/users/{username}/badges`` etc.).

Mirror the legacy ``old-backend/otix/api/user/{badges,karma}/router.py`` handlers.
Badge/achievement/karma reads are public (no auth dependency in legacy); the
badge-claim mutation is authenticated. XP award tasks are not ported, so a claim
only flips the persisted row.
"""

from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services
from apps.social.serializers.user_surface import (
    BadgeDefOutSerializer,
    BadgeOutSerializer,
    KarmaOutSerializer,
    KarmaTransactionOutSerializer,
)

USER_NOT_FOUND = "User not found"


class AchievementsView(APIView):
    """``GET /users/achievements`` — all available badge definitions (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        from apps.social.services.badge_registry import ordered_badge_defs

        defs = [
            {
                "badge_key": badge_def.key,
                "label": badge_def.label,
                "description": badge_def.description,
                "icon": badge_def.icon,
                "tier": badge_def.tier,
                "target": float(badge_def.target),
                "xp_reward": badge_def.xp_reward,
            }
            for badge_def in ordered_badge_defs()
        ]
        return Response(BadgeDefOutSerializer(defs, many=True).data)


class UserBadgesView(APIView):
    """``GET /users/{username}/badges`` — a user's earned badge rows (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        return Response(BadgeOutSerializer(services.get_user_badges(user.id), many=True).data)


class ClaimBadgeView(APIView):
    """``POST /users/me/badges/{badge_key}/claim`` — claim an earned badge."""

    def post(self, request: Request, badge_key: str) -> Response:
        from apps.social.services.badge_registry import get_badge_def

        badge_def = get_badge_def(badge_key)
        if badge_def is None:
            raise NotFound("Badge definition not found")
        try:
            xp_awarded = services.claim_badge(request.user.id, badge_key)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"status": "ok", "xp_awarded": xp_awarded})


class KarmaView(APIView):
    """``GET /users/{username}/karma`` — karma balance (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        return Response(KarmaOutSerializer({"balance": services.get_karma_balance(user.id)}).data)


class KarmaTransactionsView(generics.ListAPIView):
    """``GET /users/{username}/karma/transactions`` — karma history (public)."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = KarmaTransactionOutSerializer

    def get_queryset(self):
        user = services.get_user_by_username(self.kwargs["username"])
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        return services.get_karma_transactions(user.id)

"""A user's public reviews endpoint.

Port of the legacy ``GET /users/{username}/reviews`` handler from
``old-backend/otix/api/user/detail/router.py``. Public read with optional auth: an
authenticated author sees their own in-cooldown reviews; everyone else has them
hidden.
"""

from rest_framework import generics, permissions
from rest_framework.exceptions import NotFound

from apps.social import services
from apps.social.serializers.user_surface import ReviewWithUserSerializer

USER_NOT_FOUND = "User not found"


class UserReviewsView(generics.ListAPIView):
    """``GET /users/{username}/reviews`` — paginated review list (public)."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = ReviewWithUserSerializer

    def get_queryset(self):
        user = services.get_user_by_username(self.kwargs["username"])
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        viewer = self.request.user
        viewer_id = viewer.id if viewer.is_authenticated else None
        return services.get_user_reviews(user.id, viewer_id)

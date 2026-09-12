"""Review-vote routes (social domain).

Mounted at ``/api/v1/reviews/`` by ``config/urls.py``. No trailing slashes
(FastAPI parity; ``APPEND_SLASH`` off). A review is addressed by
``review_user_id`` + ``media_item_id`` (legacy composite address; the
greenfield ``social.Review`` has its own surrogate PK but the route keeps the
legacy two-key lookup).
"""

from django.urls import path

from apps.social.views import ReviewVoteView

app_name = "reviews"

urlpatterns = [
    path(
        "<int:review_user_id>/<int:media_item_id>/vote",
        ReviewVoteView.as_view(),
        name="review-vote",
    ),
]

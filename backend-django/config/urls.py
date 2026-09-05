"""Root URL configuration.

Convention: every domain app is mounted under ``/api/v1/<domain>/`` by
including its own ``urls.py`` here. Global (non-app) endpoints such as health
live directly on this module.
"""

from django.contrib import admin
from django.http import HttpRequest, JsonResponse
from django.urls import include, path


def health(_request: HttpRequest) -> JsonResponse:
    """Liveness probe. No auth, no DB dependency."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    # The accounts app currently owns the auth slice; later domains each get
    # their own include under /api/v1/<domain>/.
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/users/", include("apps.accounts.user_urls")),
    path("api/v1/person/", include("apps.people.urls")),
    path("api/v1/company/", include("apps.company.urls")),
    path("api/v1/list/", include("apps.lists.urls")),
    path("api/v1/blueprints/", include("apps.blueprint.urls")),
    path("api/v1/push/", include("apps.push.urls")),
    path("api/v1/search/", include("apps.search.urls")),
    path("api/v1/library/", include("apps.library.urls")),
    path("api/v1/media/", include("apps.media.urls")),
    path("api/v1/tracks/", include("apps.media.tracks_urls")),
    path("api/v1/calendar/", include("apps.media.calendar_urls")),
    path("api/v1/saves/", include("apps.track.saves_urls")),
    path("api/v1/workout/", include("apps.workout.urls")),
    path("api/v1/exercises/", include("apps.workout.exercises_urls")),
    path("api/v1/friends/", include("apps.social.friends_urls")),
    path("api/v1/notifications/", include("apps.social.notifications_urls")),
    path("api/v1/reviews/", include("apps.social.reviews_urls")),
    path("api/v1/mood-checkins/", include("apps.social.mood_checkins_urls")),
    path("api/v1/metric/", include("apps.social.metric_urls")),
    path("api/v1/proposals/", include("apps.proposals.urls")),
    path("api/v1/admin/", include("apps.proposals.admin_urls")),
    path("api/v1/health", health, name="health"),
]

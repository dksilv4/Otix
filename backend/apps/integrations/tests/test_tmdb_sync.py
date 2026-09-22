"""Endpoint + service tests for the TMDb account-sync routes.

``POST /integrations/tmdb/rating-sync`` and ``/tmdb/watchlist-import`` fetch the
user's TMDb rated lists / watchlist through the module ``_request`` leaf (the
only mocked seam), import ratings into ``MediaItemRating`` / add ``owned``
interactions for watchlist items, and export ratings back to TMDb. Matching is
stage-1 only (existing ``tmdb`` ExternalID rows, movie-vs-show disambiguated);
unmatched items count as ``skipped``. Covered: guard 400, direction handling,
import/export counts, idempotent watchlist import, media-type disambiguation,
and network / non-200 → 500.
"""

import json
import urllib.error
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import ExternalID, MediaItem
from apps.social.models import MediaItemRating, UserMediaInteraction

User = get_user_model()

REQUEST = "apps.integrations.services.tmdb._request"

RATED_MOVIES = {
    "page": 1,
    "total_pages": 1,
    "total_results": 2,
    "results": [
        {"id": 550, "title": "Fight Club", "rating": 7.0},
        {"id": 999999, "title": "Not In Catalog", "rating": 4.0},
    ],
}
RATED_TV = {
    "page": 1,
    "total_pages": 1,
    "total_results": 1,
    "results": [{"id": 1396, "name": "Breaking Bad", "rating": 9.0}],
}
WATCHLIST_MOVIES = {
    "page": 1,
    "total_pages": 1,
    "total_results": 1,
    "results": [{"id": 550, "title": "Fight Club"}],
}
WATCHLIST_TV = {
    "page": 1,
    "total_pages": 1,
    "total_results": 1,
    "results": [{"id": 1396, "name": "Breaking Bad"}],
}
EMPTY = {"page": 1, "total_pages": 0, "total_results": 0, "results": []}


def _catalog_tmdb(tmdb_id: int, title: str, otix_type: str):
    media = MediaItem.objects.create(
        media_type=otix_type, title=title, slug=f"{title.lower()}-{tmdb_id}"
    )
    ExternalID.objects.create(
        content_type=ContentType.objects.get_for_model(MediaItem),
        object_id=media.pk,
        provider="tmdb",
        external_id=str(tmdb_id),
        media_type=otix_type,
    )
    return media


class TmdbSyncTestBase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="carol", password="pw")
        self.user.tmdb_session_id = "session-abc"
        self.user.tmdb_account_id = 12345
        self.user.save(update_fields=("tmdb_session_id", "tmdb_account_id"))
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")


def _responder(routes: dict[str, tuple[int, str]]):
    """Return a mock side_effect that answers by URL-fragment match."""

    def fake(url, method="GET", data=None):
        for fragment, (status, body) in routes.items():
            if fragment in url:
                return status, body
        raise AssertionError(f"unexpected tmdb request: {method} {url}")

    return fake


def _patched(routes: dict[str, tuple[int, str]]):
    return mock.patch(REQUEST, side_effect=_responder(routes))


@override_settings(TMDB_API_KEY="test-key")
class TmdbRatingSyncTests(TmdbSyncTestBase):
    URL = "/api/v1/integrations/tmdb/rating-sync"

    def post(self, direction="import"):
        return self.client.post(self.URL, {"direction": direction}, format="json")

    def _import_routes(self):
        return {
            "rated/movies": (200, json.dumps(RATED_MOVIES)),
            "rated/tv": (200, json.dumps(RATED_TV)),
        }

    def test_unauthenticated_401(self):
        resp = APIClient().post(self.URL, {"direction": "import"}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_no_tmdb_account_400(self):
        self.user.tmdb_session_id = None
        self.user.save(update_fields=("tmdb_session_id",))
        resp = self.post()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "TMDb account not linked")

    def test_invalid_direction_400(self):
        resp = self.post(direction="sideways")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "Invalid direction: sideways")

    def test_disabled_direction_returns_zeros_without_network(self):
        with mock.patch(REQUEST) as request:
            resp = self.post(direction="disabled")
        request.assert_not_called()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"direction": "disabled", "imported": 0, "exported": 0, "skipped": 0, "errors": None},
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.tmdb_rating_sync_direction, "disabled")

    def test_import_writes_ratings_and_counts_matches(self):
        movie = _catalog_tmdb(550, "Fight Club", "movie")
        show = _catalog_tmdb(1396, "Breaking Bad", "show")
        with _patched(self._import_routes()):
            resp = self.post(direction="import")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"direction": "import", "imported": 2, "exported": 0, "skipped": 1, "errors": None},
        )
        movie_rating = MediaItemRating.objects.get(user=self.user, media_item=movie)
        show_rating = MediaItemRating.objects.get(user=self.user, media_item=show)
        self.assertEqual(movie_rating.score, 7)
        self.assertEqual(show_rating.score, 9)
        movie.refresh_from_db()
        self.assertEqual(movie.rating_count, 1)
        self.assertEqual(movie.avg_rating, 7.0)
        self.user.refresh_from_db()
        self.assertEqual(self.user.tmdb_rating_sync_direction, "import")

    def test_import_disambiguates_movie_vs_show(self):
        _catalog_tmdb(550, "Fight Club", "movie")
        tv_rated = {
            "page": 1,
            "total_pages": 1,
            "total_results": 1,
            "results": [{"id": 550, "name": "Fight Club (TV)", "rating": 8.0}],
        }
        routes = {
            "rated/movies": (200, json.dumps(RATED_MOVIES)),
            "rated/tv": (200, json.dumps(tv_rated)),
        }
        with _patched(routes):
            resp = self.post(direction="import")
        # The 550 rated as a TV show must NOT cross-point to the movie ExternalID.
        self.assertEqual(resp.json()["imported"], 1)
        movie_rating = MediaItemRating.objects.filter(user=self.user)
        self.assertEqual(movie_rating.count(), 1)
        self.assertEqual(movie_rating.first().score, 7)

    def test_bidirectional_imports_then_exports(self):
        _catalog_tmdb(550, "Fight Club", "movie")
        routes = {
            **self._import_routes(),
            "movie/550/rating": (201, json.dumps({"success": True})),
        }
        with _patched(routes):
            resp = self.post(direction="bidirectional")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {
                "direction": "bidirectional",
                "imported": 1,
                "exported": 1,
                "skipped": 2,
                "errors": None,
            },
        )

    def test_export_pushes_user_ratings_to_tmdb(self):
        movie = _catalog_tmdb(550, "Fight Club", "movie")
        MediaItemRating.objects.create(user=self.user, media_item=movie, score=8)
        with _patched({"movie/550/rating": (201, json.dumps({"success": True}))}):
            resp = self.post(direction="export")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"direction": "export", "imported": 0, "exported": 1, "skipped": 0, "errors": None},
        )

    def test_export_skips_non_movie_show_or_missing_ext(self):
        game = MediaItem.objects.create(media_type="game", title="A Game", slug="a-game")
        MediaItemRating.objects.create(user=self.user, media_item=game, score=8)
        with _patched({}):
            resp = self.post(direction="export")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["exported"], 0)
        self.assertEqual(resp.json()["skipped"], 1)

    def test_network_failure_500(self):
        _catalog_tmdb(550, "Fight Club", "movie")
        with mock.patch(REQUEST, side_effect=urllib.error.URLError("down")):
            resp = self.post(direction="import")
        self.assertEqual(resp.status_code, 500)
        self.assertEqual(
            resp.json()["detail"], "Failed to sync TMDb ratings. Please try again."
        )
        self.assertEqual(MediaItemRating.objects.filter(user=self.user).count(), 0)

    def test_unexpected_status_500(self):
        with _patched({"rated/movies": (401, json.dumps({"status_code": 7}))}):
            resp = self.post(direction="import")
        self.assertEqual(resp.status_code, 500)


@override_settings(TMDB_API_KEY="test-key")
class TmdbWatchlistImportTests(TmdbSyncTestBase):
    URL = "/api/v1/integrations/tmdb/watchlist-import"

    def post(self):
        return self.client.post(self.URL, {}, format="json")

    def _routes(self):
        return {
            "watchlist/movies": (200, json.dumps(WATCHLIST_MOVIES)),
            "watchlist/tv": (200, json.dumps(WATCHLIST_TV)),
        }

    def test_unauthenticated_401(self):
        resp = APIClient().post(self.URL, {}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_no_tmdb_account_400(self):
        self.user.tmdb_session_id = None
        self.user.save(update_fields=("tmdb_session_id",))
        resp = self.post()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "TMDb account not linked")

    def test_import_adds_owned_interactions(self):
        movie = _catalog_tmdb(550, "Fight Club", "movie")
        show = _catalog_tmdb(1396, "Breaking Bad", "show")
        with _patched(self._routes()):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"imported": 2, "skipped": 0, "errors": None})
        for media in (movie, show):
            self.assertTrue(
                UserMediaInteraction.objects.filter(
                    user=self.user, media_item=media, interaction_type="owned"
                ).exists()
            )

    def test_re_import_is_idempotent(self):
        _catalog_tmdb(550, "Fight Club", "movie")
        _catalog_tmdb(1396, "Breaking Bad", "show")
        with _patched(self._routes()):
            self.post()
            resp = self.post()
        self.assertEqual(resp.json(), {"imported": 0, "skipped": 2, "errors": None})

    def test_import_counts_unmatched_as_skipped(self):
        with _patched(self._routes()):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"imported": 0, "skipped": 2, "errors": None})

    def test_network_failure_500(self):
        _catalog_tmdb(550, "Fight Club", "movie")
        with mock.patch(REQUEST, side_effect=urllib.error.URLError("down")):
            resp = self.post()
        self.assertEqual(resp.status_code, 500)
        self.assertEqual(
            resp.json()["detail"], "Failed to import TMDb watchlist. Please try again."
        )
        self.assertEqual(UserMediaInteraction.objects.filter(user=self.user).count(), 0)

    def test_unexpected_status_500(self):
        with _patched({"watchlist/movies": (500, "oops")}):
            resp = self.post()
        self.assertEqual(resp.status_code, 500)

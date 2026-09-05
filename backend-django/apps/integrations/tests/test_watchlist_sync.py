"""Endpoint + service tests for ``POST /integrations/plex/watchlist/sync``.

The sync is the first provider→catalog media-seeding route: it fetches the
user's plex.tv watchlist through the service ``_request`` leaf (the only mocked
seam; no real network), filters to movie/show, then for each item seeds a
``MediaItem`` stub (with ``Movie``/``Show`` subtype + ``ExternalID`` rows) or
matches an existing one, and upserts the user's ``watchlisted`` interaction.
Covered: guard/400, seeding counts + row shapes, idempotent re-runs, existing
third-party matches, fetch failures yielding zeros, and added_at metadata.
"""

import json
import urllib.error
from datetime import UTC, datetime
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import ExternalID, MediaItem, Movie, Show
from apps.social.models import UserMediaInteraction

User = get_user_model()

REQUEST = "apps.integrations.services.plex._request"

MOVIE_INTERSTELLAR = {
    "type": "movie",
    "title": "Interstellar",
    "year": 2014,
    "summary": "A team travels through a wormhole in search of a new home.",
    "originallyAvailableAt": "2014-11-05",
    "addedAt": "1600000000",
    "guid": "plex://movie/5d7768dfc5b8e7d4001d",
    "Guid": [{"id": "tmdb://157336"}, {"id": "imdb://tt0816692"}],
}

MOVIE_BATMAN = {
    "type": "movie",
    "title": "The Dark Knight",
    "year": 2008,
    "guid": "plex://movie/5d776889999999999999",
    "Guid": [{"id": "tmdb://155"}, {"id": "imdb://tt0468569"}],
}

SHOW_BREAKING_BAD = {
    "type": "show",
    "title": "Breaking Bad",
    "year": 2008,
    "guid": "plex://show/5d9c086c9ceeb0001e1c1e8f",
    "Guid": [{"id": "tvdb://81189"}, {"id": "tmdb://1396"}],
}

TRACK = {
    "type": "track",
    "title": "Some Song",
    "guid": "plex://track/abc",
    "Guid": [{"id": "musicbrainz://00000000-0000-0000-0000-000000000001"}],
}

PHOTO = {"type": "photo", "title": "Holiday", "guid": "plex://photo/zzz"}


def _payload(*items):
    return {"MediaContainer": {"Metadata": list(items)}}


class WatchlistSyncTestBase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.user.plex_id = "plex-u-1"
        self.user.plex_auth_token = "ptok"
        self.user.save(update_fields=("plex_id", "plex_auth_token"))
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.url = "/api/v1/integrations/plex/watchlist/sync"

    def _stub(self, body, **kwargs):
        return mock.patch(REQUEST, return_value=(200, json.dumps(body)), **kwargs)

    def _post(self, **kwargs):
        return self.client.post(self.url, {}, format="json", **kwargs)


class PlexWatchlistSyncEndpointTests(WatchlistSyncTestBase):
    def test_unauthenticated_401(self):
        resp = APIClient().post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_no_plex_account_400(self):
        self.user.plex_id = None
        self.user.save(update_fields=("plex_id",))
        with mock.patch(REQUEST) as request:
            resp = self._post()
        request.assert_not_called()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "No Plex account linked")

    def test_linked_but_no_token_returns_zeros(self):
        self.user.plex_auth_token = None
        self.user.save(update_fields=("plex_auth_token",))
        with mock.patch(REQUEST) as request:
            resp = self._post()
        request.assert_not_called()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 0, "matched": 0, "seeded": 0})

    def test_fetch_network_failure_zeros(self):
        with mock.patch(REQUEST, side_effect=urllib.error.URLError("down")):
            resp = self._post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 0, "matched": 0, "seeded": 0})
        self.assertEqual(MediaItem.objects.count(), 0)

    def test_non_200_fetch_zeros(self):
        with mock.patch(REQUEST, return_value=(500, "boom")):
            resp = self._post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 0, "matched": 0, "seeded": 0})


class PlexWatchlistSyncSeedingTests(WatchlistSyncTestBase):
    def test_seeds_movies_and_shows_filtering_other_types(self):
        body = _payload(MOVIE_INTERSTELLAR, MOVIE_BATMAN, SHOW_BREAKING_BAD, TRACK, PHOTO)
        with self._stub(body) as request:
            resp = self._post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 3, "matched": 0, "seeded": 3})
        # Only movie/show types seeded.
        self.assertEqual(MediaItem.objects.count(), 3)
        self.assertEqual(Movie.objects.count(), 2)
        self.assertEqual(Show.objects.count(), 1)
        self.assertEqual(MediaItem.objects.filter(media_type="movie").count(), 2)
        self.assertEqual(MediaItem.objects.filter(media_type="show").count(), 1)
        # Token travelled as a query param through the _request seam.
        self.assertIn("X-Plex-Token=ptok", request.call_args.args[0])

    def test_seeded_rows_carry_title_overview_release_and_external_ids(self):
        with self._stub(_payload(MOVIE_INTERSTELLAR)):
            self._post()
        movie = MediaItem.objects.get(title="Interstellar")
        self.assertEqual(movie.media_type, "movie")
        self.assertEqual(movie.overview, MOVIE_INTERSTELLAR["summary"])
        self.assertEqual(movie.release_date.isoformat(), "2014-11-05")
        self.assertEqual(movie.slug, "interstellar-2014")
        self.assertAlmostEqual(movie.completeness_score, 0.15)
        self.assertIsNotNone(movie.next_sync_at)
        self.assertEqual(Movie.objects.get(media_item=movie).media_item_id, movie.pk)

        ct = ContentType.objects.get_for_model(MediaItem)
        rows = ExternalID.objects.filter(content_type=ct, object_id=movie.pk)
        self.assertEqual({(r.provider, r.external_id, r.media_type) for r in rows}, {
            ("plex", "plex://movie/5d7768dfc5b8e7d4001d", None),
            ("tmdb", "157336", "movie"),
            ("imdb", "tt0816692", "movie"),
        })

    def test_watchlisted_interaction_and_count_column(self):
        with self._stub(_payload(MOVIE_INTERSTELLAR)):
            self._post()
        movie = MediaItem.objects.get(title="Interstellar")
        interaction = UserMediaInteraction.objects.get(
            user=self.user, media_item=movie, interaction_type="watchlisted"
        )
        self.assertEqual(
            interaction.extra_data,
            {"source": "plex", "added_at": "2020-09-13T12:26:40+00:00"},
        )
        movie.refresh_from_db()
        self.assertEqual(movie.watchlist_count, 1)

    def test_re_run_is_idempotent(self):
        body = _payload(MOVIE_INTERSTELLAR, MOVIE_BATMAN, SHOW_BREAKING_BAD)
        with self._stub(body):
            first = self._post()
            second = self._post()
        self.assertEqual(first.json(), {"total": 3, "matched": 0, "seeded": 3})
        self.assertEqual(second.json(), {"total": 3, "matched": 3, "seeded": 0})
        self.assertEqual(MediaItem.objects.count(), 3)
        self.assertEqual(ExternalID.objects.count(), 9)
        self.assertEqual(
            UserMediaInteraction.objects.filter(
                user=self.user, interaction_type="watchlisted"
            ).count(),
            3,
        )

    def test_matches_existing_catalog_item_via_third_party_guid(self):
        existing = MediaItem.objects.create(
            media_type="movie", title="Interstellar", slug="interstellar"
        )
        Movie.objects.create(media_item=existing)
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=existing.pk,
            provider="tmdb",
            external_id="157336",
            media_type="movie",
        )
        with self._stub(_payload(MOVIE_INTERSTELLAR)):
            resp = self._post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 1, "matched": 1, "seeded": 0})
        self.assertEqual(MediaItem.objects.count(), 1)
        # Plex guid back-linked so later syncs resolve directly.
        self.assertTrue(
            ExternalID.objects.filter(
                content_type=ContentType.objects.get_for_model(MediaItem),
                provider="plex",
                external_id=MOVIE_INTERSTELLAR["guid"],
            ).exists()
        )
        self.assertEqual(
            UserMediaInteraction.objects.get(
                user=self.user, media_item=existing, interaction_type="watchlisted"
            ).extra_data["source"],
            "plex",
        )


class PlexWatchlistSyncServiceTests(TestCase):
    """Unit tests of the sync function (no HTTP view)."""

    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="pw")
        self.user.plex_id = "plex-u-2"
        self.user.plex_auth_token = "ptok2"
        self.user.save(update_fields=("plex_id", "plex_auth_token"))

    def test_no_token_zeros_without_outbound(self):
        self.user.plex_auth_token = None
        self.user.save(update_fields=("plex_auth_token",))
        from apps.integrations.services import sync_plex_watchlist

        with mock.patch(REQUEST) as request:
            result = sync_plex_watchlist(self.user)
        request.assert_not_called()
        self.assertEqual(result, {"total": 0, "matched": 0, "seeded": 0})

    def test_empty_watchlist_zero_total(self):
        from apps.integrations.services import sync_plex_watchlist

        with mock.patch(
            REQUEST,
            return_value=(200, '{"MediaContainer": {"Metadata": []}}'),
        ):
            result = sync_plex_watchlist(self.user)
        self.assertEqual(result, {"total": 0, "matched": 0, "seeded": 0})

    def test_show_matches_show_not_movie_of_same_tmdb_id(self):
        from apps.integrations.services import sync_plex_watchlist

        # A show catalog entry shares the numeric tmdb id with a movie.
        show = MediaItem.objects.create(media_type="show", title="Twin Peaks", slug="twin")
        Show.objects.create(media_item=show)
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=show.pk,
            provider="tmdb",
            external_id="2007",
            media_type="show",
        )
        # A distinct movie shares tmdb 2007 but is movie-typed.
        movie = MediaItem.objects.create(media_type="movie", title="Twin", slug="twin-x")
        Movie.objects.create(media_item=movie)
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=movie.pk,
            provider="tmdb",
            external_id="2007",
            media_type="movie",
        )
        item = {
            "type": "show",
            "title": "Twin Peaks",
            "guid": "plex://show/abc",
            "Guid": [{"id": "tmdb://2007"}],
        }
        payload = json.dumps(_payload(item))
        with mock.patch(REQUEST, return_value=(200, payload)):
            result = sync_plex_watchlist(self.user)
        self.assertEqual(result, {"total": 1, "matched": 1, "seeded": 0})
        interaction = UserMediaInteraction.objects.get(
            user=self.user, interaction_type="watchlisted"
        )
        self.assertEqual(interaction.media_item_id, show.pk)
        # addedAt missing -> metadata carries only the source.
        self.assertEqual(interaction.extra_data, {"source": "plex"})

    def test_added_at_epoch_isoformat(self):
        from apps.integrations.services.plex_watchlist import _dt_from_plex

        dt = _dt_from_plex("1600000000")
        self.assertEqual(dt, datetime.fromtimestamp(1600000000, tz=UTC))
        self.assertEqual(_dt_from_plex(None), None)
        self.assertEqual(_dt_from_plex("not-a-number"), None)

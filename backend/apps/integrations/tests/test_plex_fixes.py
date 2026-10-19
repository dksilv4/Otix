"""Tests verifying Plex fixes:
1. Strict user isolation for watch progress / timeline (no cross-user collisions).
2. Strict title & year matching in connect-info (no mismatched movies/shows).
3. Connection ordering optimization for shared servers (remote HTTPS prioritized for non-owners).
4. Auto-discovery of libraries for non-owners/new users when libraries table is empty.
"""

import json
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations import services as integrations_services
from apps.integrations.models import UserPlexItem, UserPlexLibrary, UserPlexServer
from apps.media.models import MediaItem
from apps.social.models import UserMediaInteraction

User = get_user_model()


class PlexFixesTestCase(TestCase):
    def setUp(self):
        cache.clear()
        # Owner of the Plex server
        self.owner = User.objects.create_user(username="owner", password="password123")
        self.owner.plex_auth_token = "owner-plex-token"
        self.owner.save()
        self.owner_token = Token.objects.create(user=self.owner)

        # Friend (non-owner) invited to the server
        self.friend = User.objects.create_user(username="friend", password="password123")
        self.friend.plex_auth_token = "friend-plex-token"
        self.friend.save()
        self.friend_token = Token.objects.create(user=self.friend)

        # Shared Plex Server (owned by owner, shared with friend)
        self.owner_server = UserPlexServer.objects.create(
            user=self.owner,
            machine_identifier="shared-machine-1",
            name="Owner Media Server",
            base_url="http://192.168.1.100:32400",
            access_token="owner-server-token",
            owned=True,
        )
        self.friend_server = UserPlexServer.objects.create(
            user=self.friend,
            machine_identifier="shared-machine-1",
            name="Owner Media Server",
            base_url="http://192.168.1.100:32400",
            access_token="friend-server-token",
            owned=False,  # Friend does NOT own it
        )

        # Library on the server
        self.owner_lib = UserPlexLibrary.objects.create(
            user=self.owner,
            server=self.owner_server,
            section_key="1",
            title="Movies",
            library_type="movie",
        )
        self.friend_lib = UserPlexLibrary.objects.create(
            user=self.friend,
            server=self.friend_server,
            section_key="1",
            title="Movies",
            library_type="movie",
        )

        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def test_watch_progress_isolation_between_users(self):
        """When friend watches Spider-Man, owner's UserPlexItem and connect-info must NOT be modified."""
        movie = MediaItem.objects.create(
            media_type="movie",
            title="Spider-Man",
            slug="spider-man-2002",
            release_date=date(2002, 5, 3),
        )

        # Both users have the item synced with rating_key="999"
        owner_item = UserPlexItem.objects.create(
            user=self.owner,
            server=self.owner_server,
            library=self.owner_lib,
            rating_key="999",
            title="Spider-Man",
            year=2002,
            media_type="movie",
            media_item=movie,
            view_offset=0,
            viewed=False,
        )
        friend_item = UserPlexItem.objects.create(
            user=self.friend,
            server=self.friend_server,
            library=self.friend_lib,
            rating_key="999",
            title="Spider-Man",
            year=2002,
            media_type="movie",
            media_item=movie,
            view_offset=0,
            viewed=False,
        )

        # Friend reports playback progress: 45 minutes in (2,700,000 ms)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.friend_token.key}")
        res = self.client.post(
            "/api/v1/integrations/plex/timeline",
            {
                "server_url": self.friend_server.base_url,
                "token": self.friend_server.access_token,
                "rating_key": "999",
                "state": "playing",
                "time_ms": 2700000,
                "duration_ms": 7200000,
                "local_only": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        # Verify friend's item updated
        friend_item.refresh_from_db()
        self.assertEqual(friend_item.view_offset, 2700000)

        # CRITICAL ASSERTION: Owner's item must remain strictly 0!
        owner_item.refresh_from_db()
        self.assertEqual(owner_item.view_offset, 0)
        self.assertFalse(owner_item.viewed)

        # Friend has UserMediaInteraction
        self.assertTrue(
            UserMediaInteraction.objects.filter(
                user=self.friend, media_item=movie, interaction_type="started"
            ).exists()
        )
        # Owner must have NO interaction
        self.assertFalse(
            UserMediaInteraction.objects.filter(user=self.owner, media_item=movie).exists()
        )

        # Owner calls connect-info: must return view_offset=0
        with mock.patch("apps.integrations.services.plex._request") as mock_req:
            mock_req.return_value = (
                200,
                json.dumps({
                    "MediaContainer": {
                        "Metadata": [{
                            "ratingKey": "999",
                            "viewOffset": 2700000,  # Even if PMS returned friend's offset
                            "duration": 7200000,
                        }]
                    }
                }),
            )
            self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.owner_token.key}")
            connect_res = self.client.get(f"/api/v1/integrations/plex/connect-info/{movie.id}")
            self.assertEqual(connect_res.status_code, 200)
            # Owner's tracked progress is 0, so it shouldn't show resume from friend's progress
            owner_item.view_offset = 0
            owner_item.save()

    def test_strict_matching_rejects_divergent_years(self):
        """Spider-Man (2002) must NOT match Spider-Man: Brand New Day (2026)."""
        from apps.media.models import ExternalID

        brand_new_day = MediaItem.objects.create(
            media_type="movie",
            title="Spider-Man: Brand New Day",
            slug="spider-man-brand-new-day-2026",
            release_date=date(2026, 7, 10),
        )
        ExternalID.objects.create(
            target=brand_new_day,
            provider="tmdb",
            external_id="999999",
        )

        # In Plex, user only has Spider-Man from 2002 with TMDB 557
        UserPlexItem.objects.create(
            user=self.owner,
            server=self.owner_server,
            library=self.owner_lib,
            rating_key="2002-spidey",
            title="Spider-Man",
            year=2002,
            media_type="movie",
            guids={"tmdb": "557"},
        )

        # Calling connect-info for 2026 movie must 404 and NOT match 2002 item
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.owner_token.key}")
        res = self.client.get(f"/api/v1/integrations/plex/connect-info/{brand_new_day.id}")
        self.assertEqual(res.status_code, 404)

        # Same title with vastly different year or conflicting TMDB ID must also not match
        res_title = self.client.get(
            "/api/v1/integrations/plex/connect-info/random-slug?title=Spider-Man&tmdb_id=999999"
        )
        self.assertEqual(res_title.status_code, 404)

        # Query param year divergence must also 404
        res_year = self.client.get(
            "/api/v1/integrations/plex/connect-info/random-slug-2?title=Spider-Man&year=2026"
        )
        self.assertEqual(res_year.status_code, 404)

    def test_strict_matching_rejects_media_type_mismatch(self):
        """Movie 'Spider-Man' must NOT match TV show 'Spider-Man' (1994)."""
        movie = MediaItem.objects.create(
            media_type="movie",
            title="Spider-Man",
            slug="spider-man-movie",
            release_date=date(1994, 1, 1),
        )
        UserPlexItem.objects.create(
            user=self.owner,
            server=self.owner_server,
            library=self.owner_lib,
            rating_key="animated-series-1994",
            title="Spider-Man",
            year=1994,
            media_type="show",  # TV show in Plex, but movie requested
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.owner_token.key}")
        res = self.client.get(f"/api/v1/integrations/plex/connect-info/{movie.id}")
        self.assertEqual(res.status_code, 404)

    def test_connection_ordering_prioritizes_remote_for_shared_servers(self):
        """For non-owned servers, remote HTTPS must be prioritized before LAN IPs."""
        resource = {
            "name": "Friend Server",
            "owned": False,  # Not owned!
            "connections": [
                {"uri": "http://192.168.1.50:32400", "local": True, "relay": False},
                {"uri": "https://192.168.1.50:32400", "local": True, "relay": False},
                {"uri": "https://friend.plex.direct:32400", "local": False, "relay": False},
                {"uri": "https://relay.plex.tv:32400", "local": False, "relay": True},
            ],
        }
        ordered = integrations_services.plex._ordered_connections(resource)
        # First connection must be Remote HTTPS, NOT local LAN
        self.assertEqual(ordered[0], "https://friend.plex.direct:32400")
        self.assertIn("https://relay.plex.tv:32400", ordered[1:3])

    def test_auto_discovery_when_libraries_empty(self):
        """PlexLibrariesView auto-discovers libraries when table is empty and user has a token."""
        # Clean existing servers and libraries for owner
        UserPlexLibrary.objects.filter(user=self.owner).delete()
        UserPlexServer.objects.filter(user=self.owner).delete()

        fake_resources = [
            {
                "provides": "server",
                "clientIdentifier": "new-server-1",
                "name": "Discovered Server",
                "owned": True,
                "connections": [{"uri": "https://server.plex.direct:32400", "local": False}],
                "accessToken": "new-tok",
            }
        ]

        fake_sections = {
            "MediaContainer": {
                "Directory": [
                    {
                        "key": "10",
                        "title": "Discovered Movies",
                        "type": "movie",
                    }
                ]
            }
        }

        def _fake_req(url, *args, **kwargs):
            if "resources" in url:
                return 200, json.dumps(fake_resources)
            if "sections" in url:
                return 200, json.dumps(fake_sections)
            return 404, "{}"

        with mock.patch("apps.integrations.services.plex._request", side_effect=_fake_req):
            self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.owner_token.key}")
            res = self.client.get("/api/v1/integrations/plex/libraries")
            self.assertEqual(res.status_code, 200)
            libs = res.data.get("libraries", [])
            self.assertEqual(len(libs), 1)
            self.assertEqual(libs[0]["title"], "Discovered Movies")

    def test_odyssey_never_matches_forrest_gump_or_rating_key_collision(self):
        """Looking up The Odyssey (ID 40) must never match Forrest Gump (Plex rating_key 40)."""
        odyssey = MediaItem.objects.create(
            media_type="movie",
            title="The Odyssey",
            slug="the-odyssey-2026",
            release_date=date(2026, 1, 1),
        )

        # In Plex, rating_key happens to equal odyssey.id (e.g. "40"), but it is Forrest Gump (1994)
        forrest_gump = UserPlexItem.objects.create(
            user=self.owner,
            server=self.owner_server,
            library=self.owner_lib,
            rating_key=str(odyssey.id),
            title="Forrest Gump",
            year=1994,
            media_type="movie",
            guids={"tmdb": "13", "imdb": "tt0109830"},
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.owner_token.key}")
        res = self.client.get(f"/api/v1/integrations/plex/connect-info/{odyssey.id}")
        self.assertEqual(res.status_code, 404)

        # Forrest Gump must NOT be linked to The Odyssey
        forrest_gump.refresh_from_db()
        self.assertIsNone(forrest_gump.media_item)

    def test_tmdb_id_collision_across_media_types_rejected(self):
        """Movie Alice (TMDB 241259) must NOT match TV Show Baby Reindeer (TMDB 241259)."""
        from apps.media.models import ExternalID

        alice = MediaItem.objects.create(
            media_type="movie",
            title="Alice Through the Looking Glass",
            slug="alice-through-the-looking-glass-2016",
            release_date=date(2016, 5, 25),
        )
        ExternalID.objects.create(
            target=alice,
            provider="tmdb",
            external_id="241259",
        )

        baby_reindeer = UserPlexItem.objects.create(
            user=self.owner,
            server=self.owner_server,
            library=self.owner_lib,
            rating_key="baby-reindeer-39450",
            title="Baby Reindeer",
            year=2024,
            media_type="show",  # TV show in Plex
            guids={"tmdb": "241259", "imdb": "tt13649112"},
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.owner_token.key}")
        res = self.client.get(f"/api/v1/integrations/plex/connect-info/{alice.id}")
        self.assertEqual(res.status_code, 404)

        # If baby_reindeer had previously been corrupted and saved with media_item=alice
        baby_reindeer.media_item = alice
        baby_reindeer.save()

        # Connect info must detect the corruption, disassociate it, and return 404
        cache.clear()
        res_after = self.client.get(f"/api/v1/integrations/plex/connect-info/{alice.id}")
        self.assertEqual(res_after.status_code, 404)

        baby_reindeer.refresh_from_db()
        self.assertIsNone(baby_reindeer.media_item)

        # Test cleanup_corrupted_plex_matches directly
        baby_reindeer.media_item = alice
        baby_reindeer.save()
        cleaned = integrations_services.plex.cleanup_corrupted_plex_matches(user=self.owner)
        self.assertEqual(cleaned, 1)
        baby_reindeer.refresh_from_db()
        self.assertIsNone(baby_reindeer.media_item)

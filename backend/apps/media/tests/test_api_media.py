"""Endpoint tests for the media API area (DRF).

Covers one passing smoke per route family with concrete URLs, mirroring the
legacy FastAPI status codes and response keys (see ``/tmp/media_routes.txt``).
"""

from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import Episode, ExternalID, MediaItem, Movie, Season, Show

User = get_user_model()

DETAIL_SUMMARY_KEYS = {
    "id",
    "media_type",
    "title",
    "slug",
    "poster_url",
    "release_date",
    "popularity",
    "avg_rating",
    "rating_count",
    "user_interactions",
}


class MediaApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="a-strong-pass")
        self.token = Token.objects.create(user=self.user)
        self.staff = User.objects.create_user(
            username="mod", password="a-strong-pass", is_staff=True
        )
        self.staff_token = Token.objects.create(user=self.staff)
        self.bob = User.objects.create_user(username="bob", password="a-strong-pass")
        self.bob_token = Token.objects.create(user=self.bob)

        self.client = APIClient()  # anonymous
        self.auth_client = APIClient()
        self.auth_client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.staff_client = APIClient()
        self.staff_client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")
        self.bob_client = APIClient()
        self.bob_client.credentials(HTTP_AUTHORIZATION=f"Token {self.bob_token.key}")

        self.movie_item = MediaItem.objects.create(
            media_type="movie", title="Dune", slug="dune", release_date=date(2021, 9, 15)
        )
        Movie.objects.create(media_item=self.movie_item, runtime=155)
        self.show_item = MediaItem.objects.create(
            media_type="show", title="Chernobyl", slug="chernobyl"
        )
        show = Show.objects.create(media_item=self.show_item)
        self.season = Season.objects.create(show=show, season_number=1, name="Miniseries")
        self.episode = Episode.objects.create(
            season=self.season,
            episode_number=1,
            name="1:23:45",
            air_date=date(2019, 5, 6),
        )

        media_type = ContentType.objects.get_for_model(MediaItem)
        ExternalID.objects.create(
            content_type=media_type,
            object_id=self.movie_item.pk,
            provider="tmdb",
            external_id="438631",
            media_type="movie",
        )

    # ── Catalog read routes ───────────────────────────────────────────
    def test_list_is_public_and_paginated(self) -> None:
        response = self.client.get("/api/v1/media/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), {"count", "next", "previous", "results"})
        self.assertEqual(response.data["count"], 2)
        keys = set(response.data["results"][0].keys())
        self.assertLessEqual(DETAIL_SUMMARY_KEYS, keys)

    def test_genres_and_certifications_public(self) -> None:
        genres = self.client.get("/api/v1/media/genres", {"media_type": "movie"})
        self.assertEqual(genres.status_code, 200)
        self.assertIsInstance(genres.data, list)
        certs = self.client.get("/api/v1/media/certifications", {"country_code": "us"})
        self.assertEqual(certs.status_code, 200)
        self.assertIsInstance(certs.data, list)

    def test_company_lookup_requires_id_or_slug(self) -> None:
        response = self.client.get("/api/v1/media/company")
        self.assertEqual(response.status_code, 400)

    def test_detail_public_and_404(self) -> None:
        ok = self.client.get(f"/api/v1/media/movie/{self.movie_item.pk}")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["id"], self.movie_item.pk)
        self.assertEqual(ok.data["title"], "Dune")
        missing = self.client.get("/api/v1/media/movie/99999999")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data["detail"], "Media item not found")

    def test_detail_resolves_external_id(self) -> None:
        res = self.client.get("/api/v1/media/movie/tmdb:movie:438631")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["id"], self.movie_item.pk)
        self.assertEqual(res.data["title"], "Dune")

    def test_similar_and_recommendations_public(self) -> None:
        similar = self.client.get(
            f"/api/v1/media/movie/{self.movie_item.pk}/similar", {"media_type": "movie"}
        )
        self.assertEqual(similar.status_code, 200)
        self.assertIn("items", similar.data)
        recs = self.client.get(f"/api/v1/media/movie/{self.movie_item.pk}/recommendations")
        self.assertEqual(recs.status_code, 200)
        self.assertIn("items", recs.data)

    def test_assets_admin_only(self) -> None:
        anon = self.client.get(f"/api/v1/media/movie/{self.movie_item.pk}/assets")
        self.assertEqual(anon.status_code, 401)
        denied = self.auth_client.get(f"/api/v1/media/movie/{self.movie_item.pk}/assets")
        self.assertEqual(denied.status_code, 403)
        ok = self.staff_client.get(f"/api/v1/media/movie/{self.movie_item.pk}/assets")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["total"], 0)

    # ── Rating ─────────────────────────────────────────────────────────
    def test_rating_requires_auth_and_roundtrips(self) -> None:
        anon = self.client.get(f"/api/v1/media/movie/{self.movie_item.pk}/rating")
        self.assertEqual(anon.status_code, 401)
        created = self.auth_client.put(
            f"/api/v1/media/movie/{self.movie_item.pk}/rating", {"score": 8}, format="json"
        )
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.data["score"], 8)
        self.assertEqual(created.data["rating_count"], 1)
        seen = self.auth_client.get(f"/api/v1/media/movie/{self.movie_item.pk}/rating")
        self.assertEqual(seen.status_code, 200)
        self.assertEqual(seen.data["user_id"], self.user.pk)
        deleted = self.auth_client.delete(f"/api/v1/media/movie/{self.movie_item.pk}/rating")
        self.assertEqual(deleted.status_code, 204)
        again = self.auth_client.delete(f"/api/v1/media/movie/{self.movie_item.pk}/rating")
        self.assertEqual(again.status_code, 404)

    def test_rating_write_404_for_missing_media(self) -> None:
        response = self.auth_client.put(
            "/api/v1/media/movie/99999999/rating", {"score": 8}, format="json"
        )
        self.assertEqual(response.status_code, 404)

    # ── Review ─────────────────────────────────────────────────────────
    def test_review_roundtrip_and_public_list(self) -> None:
        path = f"/api/v1/media/movie/{self.movie_item.pk}/review"
        created = self.auth_client.put(
            path, {"title": "Great", "content": "Loved it", "is_spoiler": False}, format="json"
        )
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.data["content"], "Loved it")
        self.assertEqual(created.data["user_id"], self.user.pk)
        seen = self.auth_client.get(path)
        self.assertEqual(seen.status_code, 200)
        self.assertEqual(seen.data["title"], "Great")
        patched = self.auth_client.patch(path, {"content": "Edited"}, format="json")
        self.assertEqual(patched.status_code, 200)
        deleted = self.auth_client.delete(path)
        self.assertEqual(deleted.status_code, 204)
        again = self.auth_client.delete(path)
        self.assertEqual(again.status_code, 404)
        empty = self.client.get(f"/api/v1/media/movie/{self.movie_item.pk}/reviews")
        self.assertEqual(empty.status_code, 200)
        self.assertIsInstance(empty.data, list)

    # ── Interactions / claim ───────────────────────────────────────────
    def test_interaction_toggle_and_counts(self) -> None:
        path = f"/api/v1/media/movie/{self.movie_item.pk}/interactions"
        state = self.auth_client.get(path)
        self.assertEqual(state.status_code, 200)
        self.assertIn("liked", state.data)
        on = self.auth_client.put(
            f"{path}/liked", {"extra_data": {"source": "test"}}, format="json"
        )
        self.assertEqual(on.status_code, 200)
        self.assertEqual(on.data["interaction"]["interaction_type"], "liked")
        self.assertEqual(on.data["counts"]["like_count"], 1)
        off = self.auth_client.delete(f"{path}/liked")
        self.assertEqual(off.status_code, 204)
        bad = self.auth_client.put(f"{path}/bogus", format="json")
        self.assertEqual(bad.status_code, 400)

    def test_claim_requires_existing_media(self) -> None:
        claimed = self.auth_client.post(f"/api/v1/media/{self.movie_item.pk}/claim")
        self.assertEqual(claimed.status_code, 201)
        self.assertEqual(claimed.data["status"], "claimed")
        missing = self.auth_client.post("/api/v1/media/99999999/claim")
        self.assertEqual(missing.status_code, 400)
        unclaim = self.auth_client.delete(f"/api/v1/media/{self.movie_item.pk}/claim")
        self.assertEqual(unclaim.status_code, 204)

    # ── Episode / season / show watched ────────────────────────────────
    def test_episode_interactions_and_watched(self) -> None:
        base = f"/api/v1/media/show/{self.show_item.pk}"
        state = self.auth_client.get(f"{base}/episode-interactions")
        self.assertEqual(state.status_code, 200)
        self.assertIn("episodes", state.data)
        marked = self.auth_client.put(f"{base}/episodes/{self.episode.pk}/watched", format="json")
        self.assertEqual(marked.status_code, 200)
        self.assertEqual(marked.data["interaction"]["watched"], True)
        self.assertEqual(marked.data["show_progress"]["watched_episodes"], 1)
        off = self.auth_client.delete(f"{base}/episodes/{self.episode.pk}/watched")
        self.assertEqual(off.status_code, 204)

    def test_season_and_show_watched(self) -> None:
        base = f"/api/v1/media/show/{self.show_item.pk}"
        season = self.auth_client.put(f"{base}/seasons/1/watched", format="json")
        self.assertEqual(season.status_code, 200)
        self.assertEqual(season.data["episodes_marked"], 1)
        season_off = self.auth_client.delete(f"{base}/seasons/1/watched", format="json")
        self.assertEqual(season_off.status_code, 200)
        show = self.auth_client.put(f"{base}/show-watched", format="json")
        self.assertEqual(show.status_code, 200)
        self.assertEqual(show.data["episodes_marked"], 1)
        show_off = self.auth_client.delete(f"{base}/show-watched", format="json")
        self.assertEqual(show_off.status_code, 200)

    # ── Edit proposals ─────────────────────────────────────────────────
    def test_edit_proposal_create_list_vote(self) -> None:
        base = f"/api/v1/media/{self.movie_item.pk}/edit-proposals"
        created = self.auth_client.post(
            base, {"changes": {"overview": "A sweeping sci-fi epic."}}, format="json"
        )
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.data["status"], "approved")
        listed = self.auth_client.get(base)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["total"], 1)
        # create_proposal auto-approves; undo (by the approving admin) makes it pending.
        admin_created = self.staff_client.post(
            base, {"changes": {"tagline": "Fear is the mind-killer."}}, format="json"
        )
        proposal_id = admin_created.data["id"]
        undone = self.staff_client.post(f"{base}/{proposal_id}/undo", format="json")
        self.assertEqual(undone.status_code, 200)
        voted = self.bob_client.post(
            f"{base}/{proposal_id}/vote", {"vote_type": "up"}, format="json"
        )
        self.assertEqual(voted.status_code, 200)
        self.assertEqual(voted.data["my_vote"], "up")
        removed = self.bob_client.delete(f"{base}/{proposal_id}/vote")
        self.assertEqual(removed.status_code, 204)

    def test_edit_proposal_moderation_admin_only(self) -> None:
        base = f"/api/v1/media/{self.movie_item.pk}/edit-proposals"
        created = self.auth_client.post(
            base, {"changes": {"tagline": "Fear is the mind-killer."}}, format="json"
        )
        proposal_id = created.data["id"]
        # Non-admin users cannot moderate even their own (auto-approved) proposal.
        denied = self.auth_client.post(f"{base}/{proposal_id}/undo", format="json")
        self.assertEqual(denied.status_code, 403)
        # The approving admin can undo their own approval.
        admin_created = self.staff_client.post(
            base, {"changes": {"overview": "Admin fix."}}, format="json"
        )
        admin_proposal_id = admin_created.data["id"]
        undone = self.staff_client.post(f"{base}/{admin_proposal_id}/undo", format="json")
        self.assertEqual(undone.status_code, 200)
        self.assertEqual(undone.data["status"], "pending")

    # ── Match proposals (deprecated unified) ───────────────────────────
    def test_match_propose_list_and_moderate(self) -> None:
        proposed = self.auth_client.post(
            "/api/v1/media/match/propose",
            {
                "query_id": "epic:Jaguar",
                "media_item_id": str(self.movie_item.pk),
                "source_title": "Jaguar",
                "otix_title": "Dune",
                "otix_confidence": 0.9,
                "match_type": "title",
            },
            format="json",
        )
        self.assertEqual(proposed.status_code, 200)
        self.assertTrue(proposed.data["success"])
        listed = self.auth_client.get("/api/v1/media/admin/match-proposals", {"status": "pending"})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["total"], 1)
        proposal_id = listed.data["proposals"][0]["id"]
        approved = self.auth_client.post(
            f"/api/v1/media/admin/match-proposals/{proposal_id}/approve", format="json"
        )
        self.assertEqual(approved.status_code, 200)
        self.assertTrue(approved.data["success"])

    # ── Imports / match stubs / sync-local-games ───────────────────────
    def test_import_short_circuit_and_errors(self) -> None:
        ok = self.auth_client.post(
            "/api/v1/media/import",
            {
                "provider": "tmdb",
                "provider_id": "438631",
                "media_type": "movie",
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["media_id"], self.movie_item.pk)
        bad_provider = self.auth_client.post(
            "/api/v1/media/import",
            {"provider": "steam", "provider_id": "1"},
            format="json",
        )
        self.assertEqual(bad_provider.status_code, 400)
        missing = self.auth_client.post(
            "/api/v1/media/import",
            {"provider": "tmdb", "provider_id": "1", "media_type": "movie"},
            format="json",
        )
        self.assertEqual(missing.status_code, 404)

    @override_settings(IGDB_CLIENT_ID="", IGDB_CLIENT_SECRET="")
    def test_match_stubs_and_sync_local_games(self) -> None:
        single = self.auth_client.post(
            "/api/v1/media/match", {"query_id": "g1", "title": "Dune"}, format="json"
        )
        self.assertEqual(single.status_code, 200)
        self.assertEqual(single.data["candidates"], [])
        batch = self.auth_client.post(
            "/api/v1/media/match/batch",
            {"games": [{"query_id": "g1", "title": "Dune"}]},
            format="json",
        )
        self.assertEqual(batch.status_code, 200)
        self.assertEqual(len(batch.data["matches"]), 1)
        synced = self.auth_client.post(
            "/api/v1/media/sync-local-games",
            {"games": [{"title": "Dune", "platform": "Epic", "otix_media_id": self.movie_item.pk}]},
            format="json",
        )
        self.assertEqual(synced.status_code, 200)
        self.assertEqual(synced.data["upserted"], 1)

    @override_settings(IGDB_CLIENT_ID="", IGDB_CLIENT_SECRET="")
    def test_match_batch_auto_matches_catalog_game(self) -> None:
        game = MediaItem.objects.create(media_type="game", title="Balatro", slug="balatro")
        batch = self.auth_client.post(
            "/api/v1/media/match/batch",
            {"games": [{"query_id": "server-balatro", "title": "Balatro"}]},
            format="json",
        )
        self.assertEqual(batch.status_code, 200)
        match = batch.data["matches"][0]
        self.assertEqual(match["query_id"], "server-balatro")
        self.assertIsNotNone(match["auto_match"])
        self.assertEqual(str(match["auto_match"]["media_item_id"]), str(game.pk))
        self.assertGreaterEqual(match["auto_match"]["confidence"], 0.95)

    def test_rehydrate_admin_only(self) -> None:
        path = f"/api/v1/media/{self.movie_item.pk}/rehydrate"
        anon = self.client.post(path)
        self.assertEqual(anon.status_code, 401)
        denied = self.auth_client.post(path)
        self.assertEqual(denied.status_code, 403)
        ok = self.staff_client.post(path)
        self.assertEqual(ok.status_code, 200)
        self.assertIn("task_id", ok.data)

    def test_catalog_stream_requires_auth_and_is_sse(self) -> None:
        anon = self.client.get("/api/v1/media/stream")
        self.assertEqual(anon.status_code, 401)
        ok = self.auth_client.get("/api/v1/media/stream")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.headers["Content-Type"], "text/event-stream")

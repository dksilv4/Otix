"""Endpoint tests for the proposals + admin API areas (DRF).

Covers list/create/detail of unified proposals, approve/reject/undo state
transitions (including match side effects), vote create/toggle/delete, and one
smoke test per admin GET route. Mirrors the person/company API tests.
"""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import MediaItem, Movie
from apps.proposals.models import MediaEditProposal, Proposal

User = get_user_model()

PROPOSAL_KEYS = {
    "id",
    "proposal_type",
    "target_type",
    "target_id",
    "proposer_id",
    "reviewer_id",
    "status",
    "payload",
    "rejection_reason",
    "snapshot",
    "upvote_count",
    "downvote_count",
    "my_vote",
    "proposer",
    "reviewer",
    "created_at",
    "updated_at",
    "reviewed_at",
    "target_title",
    "target_poster_url",
    "target_backdrop_url",
}


def match_payload(media_item_id: int) -> dict:
    """A valid ``match`` proposal payload targeting a media item."""
    return {
        "source": "steam",
        "source_game_id": "STEAM-123",
        "source_title": "Alien",
        "otix_media_id": str(media_item_id),
        "otix_confidence": 0.99,
        "match_type": "auto",
    }


class ProposalsApiTests(TestCase):
    def setUp(self) -> None:
        cache.clear()
        self.user = User.objects.create_user(username="alice", password="a-strong-pass")
        self.bob = User.objects.create_user(username="bob", password="a-strong-pass")
        self.admin = User.objects.create_user(
            username="admin", password="a-strong-pass", is_staff=True
        )

        def _client(u) -> APIClient:
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=u).key}")
            return client

        self.client = APIClient()  # anonymous
        self.user_client = _client(self.user)
        self.bob_client = _client(self.bob)
        self.admin_client = _client(self.admin)

        self.media_item = MediaItem.objects.create(
            media_type="movie", title="Alien", slug="alien", overview="Original overview"
        )
        Movie.objects.create(media_item=self.media_item, runtime=117)

    def _create_match(self, client: APIClient) -> dict:
        response = client.post(
            "/api/v1/proposals/",
            {
                "proposal_type": "match",
                "target_id": str(self.media_item.pk),
                "payload": match_payload(self.media_item.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        return response.data

    def _create_edit(self, client: APIClient, changes: dict) -> dict:
        response = client.post(
            "/api/v1/proposals/",
            {
                "proposal_type": "edit",
                "target_id": str(self.media_item.pk),
                "payload": {"changes": changes},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        return response.data

    # --- create ---
    def test_create_match_proposal_returns_201_pending(self) -> None:
        data = self._create_match(self.user_client)
        self.assertEqual(data["proposal_type"], "match")
        self.assertEqual(data["status"], "pending")
        self.assertEqual(data["target_id"], str(self.media_item.pk))
        self.assertTrue(Proposal.objects.filter(pk=data["id"]).exists())

    def test_create_requires_authentication(self) -> None:
        response = self.client.post(
            "/api/v1/proposals/",
            {
                "proposal_type": "match",
                "target_id": str(self.media_item.pk),
                "payload": match_payload(self.media_item.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_create_validates_payload_by_type(self) -> None:
        response = self.user_client.post(
            "/api/v1/proposals/",
            {
                "proposal_type": "match",
                "target_id": str(self.media_item.pk),
                "payload": {"source": "steam"},  # missing required match fields
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("missing required field", response.data["detail"])

    def test_create_edit_proposal_validates_allowed_fields(self) -> None:
        response = self.user_client.post(
            "/api/v1/proposals/",
            {
                "proposal_type": "edit",
                "target_id": str(self.media_item.pk),
                "payload": {"changes": {"bogus_field": "x"}},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    # --- list / detail ---
    def test_list_proposals_paginated_envelope(self) -> None:
        self._create_match(self.user_client)
        response = self.user_client.get("/api/v1/proposals/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), {"count", "next", "previous", "results"})
        self.assertGreaterEqual(response.data["count"], 1)
        first = response.data["results"][0]
        self.assertEqual(set(first.keys()), PROPOSAL_KEYS)
        self.assertEqual(first["proposal_type"], "match")

    def test_list_filters_by_type_and_status(self) -> None:
        self._create_match(self.user_client)
        self._create_edit(self.user_client, {"overview": "Edited"})
        response = self.user_client.get("/api/v1/proposals/", {"type": "edit"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["proposal_type"], "edit")

    def test_detail_returns_proposal(self) -> None:
        data = self._create_match(self.user_client)
        response = self.user_client.get(f"/api/v1/proposals/{data['id']}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), PROPOSAL_KEYS)
        self.assertEqual(response.data["id"], data["id"])
        self.assertEqual(response.data["status"], "pending")

    def test_detail_unknown_id_returns_404(self) -> None:
        response = self.user_client.get("/api/v1/proposals/999999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Proposal not found")

    # --- state machine ---
    def test_approve_undo_reject_lifecycle(self) -> None:
        data = self._create_match(self.user_client)
        url = f"/api/v1/proposals/{data['id']}"

        response = self.admin_client.post(f"{url}/approve")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "approved")
        self.assertEqual(response.data["reviewer_id"], self.admin.pk)

        # Approving again is a state violation -> 400.
        response = self.admin_client.post(f"{url}/approve")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Proposal is not pending")

        response = self.admin_client.post(f"{url}/undo")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "pending")

        response = self.admin_client.post(
            f"{url}/reject", {"rejection_reason": "nope"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "rejected")
        self.assertEqual(response.data["rejection_reason"], "nope")

        # Undo of a rejected proposal is a violation -> 400.
        response = self.admin_client.post(f"{url}/undo")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Only approved proposals can be undone")

    def test_approve_requires_admin(self) -> None:
        data = self._create_match(self.user_client)
        response = self.bob_client.post(f"/api/v1/proposals/{data['id']}/approve")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Admin access required")

    def test_edit_proposal_approve_mutates_and_undo_restores_media(self) -> None:
        data = self._create_edit(self.user_client, {"overview": "Admin-approved overview"})
        url = f"/api/v1/proposals/{data['id']}"
        self.assertEqual(data["status"], "pending")

        response = self.admin_client.post(f"{url}/approve")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "approved")
        self.media_item.refresh_from_db()
        self.assertEqual(self.media_item.overview, "Admin-approved overview")

        response = self.admin_client.post(f"{url}/undo")
        self.assertEqual(response.status_code, 200)
        self.media_item.refresh_from_db()
        self.assertEqual(self.media_item.overview, "Original overview")

    # --- voting ---
    def test_vote_create_toggle_and_delete(self) -> None:
        data = self._create_match(self.user_client)
        url = f"/api/v1/proposals/{data['id']}/vote"

        response = self.bob_client.post(url, {"vote_type": "up"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"my_vote": "up", "upvote_count": 1, "downvote_count": 0})

        # Same vote again toggles off.
        response = self.bob_client.post(url, {"vote_type": "up"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"my_vote": None, "upvote_count": 0, "downvote_count": 0})

        # A different vote flips.
        response = self.bob_client.post(url, {"vote_type": "down"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"my_vote": "down", "upvote_count": 0, "downvote_count": 1})

        response = self.bob_client.delete(url)
        self.assertEqual(response.status_code, 204)

        # Deleting again -> 404 "Vote not found".
        response = self.bob_client.delete(url)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Vote not found")

    def test_vote_requires_pending_and_blocks_self_vote(self) -> None:
        data = self._create_match(self.user_client)
        url = f"/api/v1/proposals/{data['id']}/vote"
        response = self.user_client.post(url, {"vote_type": "up"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Cannot vote on your own proposal")

    def test_vote_requires_authentication(self) -> None:
        data = self._create_match(self.user_client)
        response = self.client.post(
            f"/api/v1/proposals/{data['id']}/vote", {"vote_type": "up"}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    # --- admin reads ---
    def test_admin_gets_return_200(self) -> None:
        self._create_match(self.user_client)
        checks = [
            "/api/v1/admin/deleted-tmdb-ids",
            "/api/v1/admin/edit-proposals",
            "/api/v1/admin/hydration",
            "/api/v1/admin/hydration/summary",
            "/api/v1/admin/metrics?metric=media_movie",
            "/api/v1/admin/stats",
        ]
        for url in checks:
            response = self.admin_client.get(url)
            self.assertEqual(response.status_code, 200, msg=f"GET {url}")

    def test_admin_reads_require_admin_except_edit_proposals(self) -> None:
        # edit-proposals mirrors legacy get_trusted_or_admin_user (authenticated OK).
        response = self.user_client.get("/api/v1/admin/edit-proposals")
        self.assertEqual(response.status_code, 200)

        response = self.user_client.get("/api/v1/admin/stats")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Admin access required")

    def test_admin_edit_proposals_lists_media_item(self) -> None:
        # The admin queue lists MediaEditProposal rows (the media edit-proposal
        # flow), which is separate from unified Proposal rows created above.
        MediaEditProposal.objects.create(
            media_item=self.media_item,
            proposer=self.user,
            changes={"overview": "Edited overview"},
        )
        response = self.admin_client.get("/api/v1/admin/edit-proposals")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        item = response.data["items"][0]
        self.assertEqual(item["media_item_id"], self.media_item.pk)
        self.assertEqual(item["media_title"], "Alien")
        self.assertEqual(item["media_type"], "movie")
        self.assertEqual(item["proposer_user_id"], self.user.pk)

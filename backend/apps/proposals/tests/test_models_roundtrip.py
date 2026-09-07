"""Round-trip smoke test for the proposals model layer.

Builds a user + a Movie plus the proposals that hang off it and asserts the
Django reverse accessors link everything back correctly.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.media.models import MediaItem, Movie
from apps.proposals.models import (
    MatchProposal,
    MatchSkip,
    MediaEditProposal,
    MediaImageOverride,
    Proposal,
    ProposalVote,
    TMDBDeletedID,
)

User = get_user_model()


class ProposalsRoundtripTest(TestCase):
    """Proposals persist and resolve their catalog/user reverses."""

    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="proposer", email="proposer@example.com", password="pw"
        )
        self.approver = User.objects.create_user(username="approver", password="pw")
        self.media_item = MediaItem.objects.create(
            media_type="movie", title="Alien", slug="alien"
        )
        self.movie = Movie.objects.create(media_item=self.media_item, runtime=117)

    def test_match_proposal_reverse(self) -> None:
        match = MatchProposal.objects.create(
            source="steam",
            source_game_id="12345",
            source_title="Alien (Steam)",
            release_year=1979,
            media_item=self.media_item,
            otix_title="Alien",
            otix_confidence=0.98,
            match_type="auto",
        )
        self.assertIn(match, self.media_item.match_proposals.all())
        self.assertEqual(self.movie.media_item, self.media_item)

    def test_edit_proposal_and_vote_reverses(self) -> None:
        edit = MediaEditProposal.objects.create(
            media_item=self.media_item,
            proposer=self.user,
            changes={"overview": "New overview"},
        )
        vote = ProposalVote.objects.create(user=self.user, proposal=edit, vote_type="up")
        self.assertIn(edit, self.media_item.edit_proposals.all())
        self.assertIn(vote, edit.votes.all())
        self.assertIn(vote, self.user.media_edit_proposal_votes.all())
        self.assertIn(edit, self.user.edit_proposals_created.all())

    def test_review_and_image_override_and_bookkeeping_rows(self) -> None:
        edit = MediaEditProposal.objects.create(
            media_item=self.media_item,
            proposer=self.user,
            status="approved",
            approver=self.approver,
            changes={"title": "Alien (1979)"},
        )
        override = MediaImageOverride.objects.create(
            media_item=self.media_item,
            image_type="poster",
            language_code="en",
            url="https://example.com/poster.jpg",
            created_by=self.user,
        )
        proposal = Proposal.objects.create(
            proposal_type="edit",
            target_type="media_item",
            target_id="abc123",
            proposer=self.user,
            payload={"field": "title"},
        )
        skip = MatchSkip.objects.create(
            provider="epic", external_id="EPIC-9", user=self.user
        )
        deleted = TMDBDeletedID.objects.create(
            tmdb_id=348, media_type="movie", media_item=self.media_item, title="Alien"
        )
        self.assertEqual(edit.approver, self.approver)
        self.assertIn(override, self.media_item.image_overrides.all())
        self.assertIn(proposal, self.user.proposals_proposed.all())
        self.assertIn(skip, self.user.match_skips.all())
        self.assertIn(deleted, self.media_item.tmdb_deleted_ids.all())

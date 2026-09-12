"""Tests for AdminEditService."""


import pytest

from otix.domain.admin_edit import MediaEditProposal, MediaImageOverride, ProposalVote
from otix.domain.media import MediaItem
from otix.services.admin_edit_service import AdminEditService


def make_media_item(**overrides):
    defaults = {
        "id": "oti_media000001",
        "media_type": "movie",
        "title": "Test Movie",
        "slug": "test-movie",
        "release_date": "2023-01-01",
        "popularity": 10.0,
        "original_language": "en",
    }
    defaults.update(overrides)
    return MediaItem(**defaults)


def make_proposal(**overrides):
    defaults = {
        "id": "oti_prop0000001",
        "media_item_id": "oti_media000001",
        "proposer_user_id": "oti_user0000001",
        "approver_user_id": None,
        "status": "pending",
        "changes": {"overview": "New overview"},
        "image_overrides": None,
        "rejection_reason": None,
        "original_values": {"overview": "Original overview"},
        "upvote_count": 0,
        "downvote_count": 0,
    }
    defaults.update(overrides)
    return MediaEditProposal(**defaults)


class TestCreateProposal:
    async def test_create_saves_original_values(self, mock_db_session):
        media = make_media_item(overview="Original overview")
        # create_proposal calls scalar twice: once for media, once to re-fetch after flush
        returned_proposal = make_proposal(
            proposer_user_id="oti_user0000001",
            changes={"overview": "New overview"},
            original_values={"overview": "Original overview"},
        )
        mock_db_session.scalar.side_effect = [media, returned_proposal]
        service = AdminEditService(mock_db_session)

        proposal = await service.create_proposal(
            media_item_id="oti_media000001",
            proposer_user_id="oti_user0000001",
            changes={"overview": "New overview"},
        )

        assert proposal.original_values == {"overview": "Original overview"}
        assert proposal.changes == {"overview": "New overview"}
        assert proposal.status == "pending"

    async def test_create_stores_only_changed_fields(self, mock_db_session):
        media = make_media_item(title="Original Title", overview="Original overview")
        returned_proposal = make_proposal(
            proposer_user_id="oti_user0000001",
            changes={"overview": "New overview"},
            original_values={"overview": "Original overview"},
        )
        mock_db_session.scalar.side_effect = [media, returned_proposal]
        service = AdminEditService(mock_db_session)

        proposal = await service.create_proposal(
            media_item_id="oti_media000001",
            proposer_user_id="oti_user0000001",
            changes={"overview": "New overview"},
        )

        # Should only snapshot the changed field, not all fields
        assert "overview" in proposal.original_values
        assert "title" not in proposal.original_values
        assert "original_language" not in proposal.original_values

    async def test_create_media_not_found_raises(self, mock_db_session):
        mock_db_session.scalar.return_value = None
        service = AdminEditService(mock_db_session)

        with pytest.raises(ValueError, match="Media item not found"):
            await service.create_proposal(
                media_item_id="oti_nonexistent",
                proposer_user_id="oti_user0000001",
                changes={"overview": "New"},
            )


class TestApproveProposal:
    async def test_approve_applies_changes(self, mock_db_session):
        media = make_media_item(overview="Original overview")
        proposal = make_proposal(
            status="pending",
            changes={"overview": "New overview"},
            original_values={"overview": "Original overview"},
        )
        proposal.media_item = media

        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        result = await service.approve_proposal("oti_prop0000001", "oti_admin000001")

        assert result.status == "approved"
        assert result.approver_user_id == "oti_admin000001"
        assert media.overview == "New overview"

    async def test_self_approve_raises(self, mock_db_session):
        proposal = make_proposal(status="pending", proposer_user_id="oti_user0000001")
        proposal.media_item = make_media_item()
        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        with pytest.raises(ValueError, match="Cannot approve your own proposal"):
            await service.approve_proposal("oti_prop0000001", "oti_user0000001")

    async def test_approve_non_pending_raises(self, mock_db_session):
        proposal = make_proposal(status="approved")
        proposal.media_item = make_media_item()
        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        with pytest.raises(ValueError, match="Proposal is not pending"):
            await service.approve_proposal("oti_prop0000001", "oti_admin000001")

    async def test_approve_system_proposal_allows_any_admin(self, mock_db_session):
        """System proposals (proposer_user_id=None) can be approved by any admin."""
        media = make_media_item()
        proposal = make_proposal(
            status="pending",
            proposer_user_id=None,
            changes={"overview": "System update"},
        )
        proposal.media_item = media
        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        result = await service.approve_proposal("oti_prop0000001", "oti_admin000001")

        assert result.status == "approved"

    async def test_approve_upserts_image_overrides(self, mock_db_session):
        media = make_media_item()
        proposal = make_proposal(
            status="pending",
            changes={},
            image_overrides=[
                {"image_type": "poster", "language_code": "en", "url": "https://example.com/poster.jpg"},
            ],
        )
        proposal.media_item = media
        # First scalar call returns proposal, second (existing override lookup) returns None
        mock_db_session.scalar.side_effect = [proposal, None, proposal]
        service = AdminEditService(mock_db_session)

        result = await service.approve_proposal("oti_prop0000001", "oti_admin000001")

        assert result.status == "approved"
        mock_db_session.add.assert_called()  # Should have added a new MediaImageOverride


class TestRejectProposal:
    async def test_reject_with_reason(self, mock_db_session):
        proposal = make_proposal(status="pending")
        proposal.media_item = make_media_item()
        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        result = await service.reject_proposal(
            "oti_prop0000001", "oti_admin000001", "Not accurate enough"
        )

        assert result.status == "rejected"
        assert result.rejection_reason == "Not accurate enough"
        assert result.approver_user_id == "oti_admin000001"

    async def test_reject_own_proposal_raises(self, mock_db_session):
        proposal = make_proposal(status="pending", proposer_user_id="oti_user0000001")
        proposal.media_item = make_media_item()
        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        with pytest.raises(ValueError, match="Cannot reject your own proposal"):
            await service.reject_proposal("oti_prop0000001", "oti_user0000001", "bad")


class TestUndoApproval:
    async def test_undo_restores_original_values(self, mock_db_session):
        media = make_media_item(overview="New overview")
        proposal = make_proposal(
            status="approved",
            approver_user_id="oti_admin000001",
            changes={"overview": "New overview"},
            original_values={"overview": "Original overview"},
        )
        proposal.media_item = media

        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        result = await service.undo_approval("oti_prop0000001", "oti_admin000001")

        assert result.status == "pending"
        assert result.approver_user_id is None
        assert media.overview == "Original overview"

    async def test_undo_deletes_image_overrides(self, mock_db_session):
        media = make_media_item()
        proposal = make_proposal(
            status="approved",
            approver_user_id="oti_admin000001",
            changes={},
            original_values=None,
            image_overrides=[
                {"image_type": "poster", "language_code": "en", "url": "https://example.com/poster.jpg"},
            ],
        )
        proposal.media_item = media

        existing_override = MediaImageOverride(
            id="oti_img00000001",
            media_item_id="oti_media000001",
            image_type="poster",
            language_code="en",
            url="https://example.com/poster.jpg",
            created_by_user_id="oti_admin000001",
        )
        mock_db_session.scalar.side_effect = [proposal, existing_override, proposal]
        service = AdminEditService(mock_db_session)

        await service.undo_approval("oti_prop0000001", "oti_admin000001")

        mock_db_session.delete.assert_called_once_with(existing_override)

    async def test_undo_wrong_approver_raises(self, mock_db_session):
        proposal = make_proposal(
            status="approved",
            approver_user_id="oti_admin000001",
        )
        proposal.media_item = make_media_item()
        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        with pytest.raises(ValueError, match="Only the original approver can undo"):
            await service.undo_approval("oti_prop0000001", "oti_admin000002")

    async def test_undo_non_approved_raises(self, mock_db_session):
        proposal = make_proposal(status="pending")
        proposal.media_item = make_media_item()
        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        with pytest.raises(ValueError, match="Proposal is not approved"):
            await service.undo_approval("oti_prop0000001", "oti_admin000001")


class TestVoting:
    async def test_vote_up(self, mock_db_session):
        proposal = make_proposal(status="pending", proposer_user_id="oti_proposer")
        mock_db_session.scalar.side_effect = [
            proposal,   # proposal lookup
            None,       # no existing vote
        ]
        service = AdminEditService(mock_db_session)

        result = await service.vote("oti_prop0000001", "oti_voter", "up")

        assert result == "up"
        assert proposal.upvote_count == 1
        assert proposal.downvote_count == 0

    async def test_vote_toggle_off(self, mock_db_session):
        proposal = make_proposal(
            status="pending",
            proposer_user_id="oti_proposer",
            upvote_count=1,
        )
        existing_vote = ProposalVote(
            user_id="oti_voter",
            proposal_id="oti_prop0000001",
            vote_type="up",
        )
        mock_db_session.scalar.side_effect = [
            proposal,       # proposal lookup
            existing_vote,  # existing vote
        ]
        service = AdminEditService(mock_db_session)

        result = await service.vote("oti_prop0000001", "oti_voter", "up")

        assert result is None
        assert proposal.upvote_count == 0
        mock_db_session.delete.assert_called_once_with(existing_vote)

    async def test_vote_flip(self, mock_db_session):
        proposal = make_proposal(
            status="pending",
            proposer_user_id="oti_proposer",
            upvote_count=1,
            downvote_count=0,
        )
        existing_vote = ProposalVote(
            user_id="oti_voter",
            proposal_id="oti_prop0000001",
            vote_type="up",
        )
        mock_db_session.scalar.side_effect = [
            proposal,       # proposal lookup
            existing_vote,  # existing vote
        ]
        service = AdminEditService(mock_db_session)

        result = await service.vote("oti_prop0000001", "oti_voter", "down")

        assert result == "down"
        assert proposal.upvote_count == 0
        assert proposal.downvote_count == 1
        assert existing_vote.vote_type == "down"

    async def test_vote_own_proposal_raises(self, mock_db_session):
        proposal = make_proposal(
            status="pending",
            proposer_user_id="oti_proposer",
        )
        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        with pytest.raises(ValueError, match="Cannot vote on your own proposal"):
            await service.vote("oti_prop0000001", "oti_proposer", "up")

    async def test_vote_non_pending_raises(self, mock_db_session):
        proposal = make_proposal(status="approved")
        mock_db_session.scalar.return_value = proposal
        service = AdminEditService(mock_db_session)

        with pytest.raises(ValueError, match="Can only vote on pending proposals"):
            await service.vote("oti_prop0000001", "oti_voter", "up")

    async def test_remove_vote(self, mock_db_session):
        proposal = make_proposal(
            status="pending",
            upvote_count=1,
        )
        existing_vote = ProposalVote(
            user_id="oti_voter",
            proposal_id="oti_prop0000001",
            vote_type="up",
        )
        mock_db_session.scalar.side_effect = [
            existing_vote,  # vote lookup
            proposal,       # proposal lookup for count adjustment
        ]
        service = AdminEditService(mock_db_session)

        result = await service.remove_vote("oti_prop0000001", "oti_voter")

        assert result is True
        assert proposal.upvote_count == 0
        mock_db_session.delete.assert_called_once_with(existing_vote)

    async def test_remove_vote_not_found(self, mock_db_session):
        mock_db_session.scalar.return_value = None
        service = AdminEditService(mock_db_session)

        result = await service.remove_vote("oti_prop0000001", "oti_voter")

        assert result is False

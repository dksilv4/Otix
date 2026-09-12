"""Tests for ListService — list creation, updates, items handling, likes, collaboration invite actions, and reordering history."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from otix.domain.list import MediaListCollaborator, UserList
from otix.domain.user import User
from otix.services.list_service import ListService


@pytest.fixture(autouse=True)
def mock_celery_app():
    with patch("otix.services.list_service.app.send_task") as mock_send:
        yield mock_send


@pytest.fixture
def service(mock_db_session: AsyncMock) -> ListService:
    return ListService(mock_db_session)


def _make_list(list_id: str, user_id: str, name: str) -> UserList:
    lst = UserList(
        user_id=user_id,
        name=name,
        description="description",
        is_public=True,
    )
    lst.id = list_id
    lst.items = []
    return lst


class TestListLifecycle:
    async def test_create_list(self, service: ListService, mock_db_session: AsyncMock, mock_celery_app: MagicMock):
        lst = await service.create_list("user-123", "My List", "My description", True)

        assert lst.user_id == "user-123"
        assert lst.name == "My List"
        assert lst.description == "My description"
        assert lst.is_public is True
        mock_db_session.add.assert_called_once_with(lst)
        mock_db_session.flush.assert_awaited()
        assert mock_celery_app.call_count == 3

    async def test_update_list_found(self, service: ListService, mock_db_session: AsyncMock):
        lst = _make_list("list-1", "user-123", "Old Name")
        mock_db_session.scalar.return_value = lst

        updated = await service.update_list("list-1", "user-123", "New Name", "New Desc", False)
        assert updated == lst
        assert updated.name == "New Name"
        assert updated.description == "New Desc"
        assert updated.is_public is False

    async def test_update_list_not_found(self, service: ListService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        updated = await service.update_list("list-99", "user-123", "New Name", "New Desc", False)
        assert updated is None

    async def test_delete_list(self, service: ListService, mock_db_session: AsyncMock):
        mock_res = MagicMock()
        mock_res.rowcount = 1
        mock_db_session.execute.return_value = mock_res

        res = await service.delete_list("list-1", "user-123")
        assert res is True

        mock_res.rowcount = 0
        res = await service.delete_list("list-99", "user-123")
        assert res is False


class TestListItems:
    async def test_add_item_success(self, service: ListService, mock_db_session: AsyncMock):
        lst = _make_list("list-1", "user-123", "My List")
        mock_db_session.scalar.side_effect = [
            lst,  # find list
            10,   # max_order
        ]

        item = await service.add_item("list-1", "user-123", "media-1")
        assert item is not None
        assert item.list_id == "list-1"
        assert item.media_item_id == "media-1"
        assert item.sort_order == 11
        mock_db_session.add.assert_called_with(item)

    async def test_remove_item(self, service: ListService, mock_db_session: AsyncMock):
        lst = _make_list("list-1", "user-123", "My List")
        mock_db_session.scalar.return_value = lst

        mock_res = MagicMock()
        mock_res.rowcount = 1
        mock_db_session.execute.return_value = mock_res

        res = await service.remove_item("list-1", "user-123", "media-1")
        assert res is True

    async def test_reorder_items(self, service: ListService, mock_db_session: AsyncMock):
        lst = _make_list("list-1", "user-123", "My List")
        mock_db_session.scalar.side_effect = [
            lst,  # find list
            1,    # old_order for first (which is i=0, so 1 != 0 => logs change)
            0,    # old_order for second (which is i=1, so 0 != 1 => logs change)
        ]

        res = await service.reorder_items("list-1", "user-123", ["media-2", "media-1"])
        assert res is True
        # Verify rank history has been added for changes
        assert mock_db_session.add.call_count >= 1


class TestListCollaboration:
    async def test_add_collaborator(self, service: ListService, mock_db_session: AsyncMock):
        lst = _make_list("list-1", "user-123", "My List")
        actor = User(email="actor@example.com", username="actor")
        actor.id = "user-123"

        mock_db_session.scalar.side_effect = [
            lst,   # _get_owned_list -> find list
            None,  # _get_owned_list -> no collab required (since owned)
            actor, # find actor user
        ]

        collab = await service.add_collaborator("list-1", "user-123", "target-456", "EDIT")
        assert collab is not None
        assert collab.user_id == "target-456"
        assert collab.status == "pending"
        assert collab.permission == "EDIT"
        assert mock_db_session.add.call_count == 2  # Collab + Notification

    async def test_accept_collaboration(self, service: ListService, mock_db_session: AsyncMock):
        lst = _make_list("list-1", "user-123", "My List")
        collab = MediaListCollaborator(list_id="list-1", user_id="target-456", status="pending")
        collab.list = lst
        acceptor = User(email="acc@example.com", username="acceptor")
        acceptor.id = "target-456"

        mock_db_session.scalar.side_effect = [
            collab,   # find collab
            acceptor, # find acceptor
        ]

        res = await service.accept_collaboration("list-1", "target-456")
        assert res is True
        assert collab.status == "accepted"


class TestListLikes:
    async def test_like_unlike(self, service: ListService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None  # No existing like
        res = await service.like_list("list-1", "user-123")
        assert res is True
        mock_db_session.add.assert_called_once()

        mock_res = MagicMock()
        mock_res.rowcount = 1
        mock_db_session.execute.return_value = mock_res
        res = await service.unlike_list("list-1", "user-123")
        assert res is True

"""Tests for PeopleService — listing, detail, search with mocked DB session."""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock

import pytest

from otix.domain.people import Person
from otix.services.people_service import PeopleService


@pytest.fixture
def service(mock_db_session: AsyncMock) -> PeopleService:
    return PeopleService(mock_db_session)


def _make_person(id_suffix: str, name: str, **kwargs) -> Person:
    p = Person(
        name=name,
        tmdb_id=kwargs.get("tmdb_id"),
        imdb_id=kwargs.get("imdb_id"),
        photo_url=kwargs.get("photo_url"),
        biography=kwargs.get("biography"),
        birthday=kwargs.get("birthday"),
        deathday=kwargs.get("deathday"),
        place_of_birth=kwargs.get("place_of_birth"),
        synced_at=kwargs.get("synced_at"),
    )
    p.id = f"oti_pers{id_suffix}"
    return p


# ── list_people ────────────────────────────────────────────────────


class TestListPeople:
    async def test_basic_list(self, service: PeopleService, mock_db_session: AsyncMock):
        people = [
            _make_person("01", "Brad Pitt"),
            _make_person("02", "Edward Norton"),
            _make_person("03", "Peter Dinklage"),
        ]
        mock_db_session.scalars.return_value = iter(people)

        result, has_more = await service.list_people(limit=50)

        assert len(result) == 3
        assert result[0].name == "Brad Pitt"
        assert not has_more

    async def test_pagination_with_cursor(
        self, service: PeopleService, mock_db_session: AsyncMock
    ):
        """When cursor is provided, query should use name + id ordering."""
        cursor_person = _make_person("10", "Edward Norton")

        # Cursor lookup uses scalar(), result query uses scalars()
        mock_db_session.scalar.return_value = cursor_person
        next_people = [
            _make_person("11", "Peter Dinklage"),
            _make_person("12", "Scarlett Johansson"),
        ]
        mock_db_session.scalars.return_value = iter(next_people)

        result, has_more = await service.list_people(cursor="oti_pers10", limit=50)

        assert len(result) == 2
        assert result[0].name == "Peter Dinklage"
        assert not has_more

    async def test_has_more(self, service: PeopleService, mock_db_session: AsyncMock):
        """When result has (limit + 1) items, has_more is True and last item is trimmed."""
        people = [_make_person(str(i).zfill(2), f"Person {i}") for i in range(4)]  # limit=3, returns 4
        mock_db_session.scalars.return_value = iter(people)

        result, has_more = await service.list_people(limit=3)

        assert len(result) == 3
        assert has_more

    async def test_empty_list(self, service: PeopleService, mock_db_session: AsyncMock):
        mock_db_session.scalars.return_value = iter([])

        result, has_more = await service.list_people()

        assert result == []
        assert not has_more

    async def test_invalid_cursor(self, service: PeopleService, mock_db_session: AsyncMock):
        """When cursor points to nonexistent person, fall back to full list."""
        mock_db_session.scalar.return_value = None  # cursor lookup returns None
        next_people = [_make_person("01", "Brad Pitt")]
        mock_db_session.scalars.return_value = iter(next_people)

        result, has_more = await service.list_people(cursor="nonexistent")

        assert len(result) == 1
        assert result[0].name == "Brad Pitt"


# ── get_person ─────────────────────────────────────────────────────


class TestGetPerson:
    async def test_found(self, service: PeopleService, mock_db_session: AsyncMock):
        person = _make_person(
            "01", "Brad Pitt",
            tmdb_id=287, birthday=date(1963, 12, 18),
            place_of_birth="Shawnee, Oklahoma, USA",
        )
        mock_db_session.scalar.return_value = person

        result = await service.get_person("oti_pers01")

        assert result is person
        assert result.name == "Brad Pitt"
        assert result.tmdb_id == 287

    async def test_not_found(self, service: PeopleService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None

        result = await service.get_person("nonexistent")

        assert result is None

    async def test_get_person_with_credits_sorting(
        self, service: PeopleService, mock_db_session: AsyncMock
    ):
        from otix.domain.media import MediaItem
        from otix.domain.people import MediaCredit

        person = _make_person("01", "Brad Pitt")

        # Create media items with and without release dates
        item_no_date = MediaItem(release_date=None)
        item_date_older = MediaItem(release_date=date(2010, 1, 1))
        item_date_newer = MediaItem(release_date=date(2020, 1, 1))

        credit_no_date = MediaCredit(media_item=item_no_date)
        credit_date_older = MediaCredit(media_item=item_date_older)
        credit_date_newer = MediaCredit(media_item=item_date_newer)

        person.credits = [credit_no_date, credit_date_older, credit_date_newer]

        # First scalar call is get_person lookup
        # Second scalar call is follower count lookup
        mock_db_session.scalar.side_effect = [person, 5]

        result = await service.get_person("oti_pers01")

        assert result is person
        # Check credits sorted: newer date, older date, no date
        assert result.credits == [credit_date_newer, credit_date_older, credit_no_date]
        assert result.follower_count == 5

    async def test_get_person_follower_count_exception(
        self, service: PeopleService, mock_db_session: AsyncMock
    ):
        person = _make_person("01", "Brad Pitt")
        person.credits = []

        # First scalar call: get_person (returns person)
        # Second scalar call: follower count (raises Exception)
        mock_db_session.scalar.side_effect = [person, Exception("DB Error")]

        result = await service.get_person("oti_pers01")
        assert result is person
        assert result.follower_count == 0

    async def test_get_person_user_follows(
        self, service: PeopleService, mock_db_session: AsyncMock
    ):
        from otix.domain.people import UserPersonFollow
        person = _make_person("01", "Brad Pitt")
        person.credits = []

        # First scalar call: get_person
        # Second scalar call: follower count
        # Third scalar call: user follows check
        mock_follow = UserPersonFollow(user_id="user1", person_id="oti_pers01")
        mock_db_session.scalar.side_effect = [person, 10, mock_follow]

        result = await service.get_person("oti_pers01", user_id="user1")
        assert result.is_followed is True

    async def test_get_person_user_does_not_follow(
        self, service: PeopleService, mock_db_session: AsyncMock
    ):
        person = _make_person("01", "Brad Pitt")
        person.credits = []

        # First scalar call: get_person
        # Second scalar call: follower count
        # Third scalar call: user follows check (returns None)
        mock_db_session.scalar.side_effect = [person, 10, None]

        result = await service.get_person("oti_pers01", user_id="user1")
        assert result.is_followed is False

    async def test_get_person_user_follow_exception(
        self, service: PeopleService, mock_db_session: AsyncMock
    ):
        person = _make_person("01", "Brad Pitt")
        person.credits = []

        # First scalar call: get_person
        # Second scalar call: follower count
        # Third scalar call: user follows check (raises Exception)
        mock_db_session.scalar.side_effect = [person, 10, Exception("DB Error")]

        result = await service.get_person("oti_pers01", user_id="user1")
        assert result.is_followed is False


# ── search_people ──────────────────────────────────────────────────


class TestSearchPeople:
    async def test_basic_search(self, service: PeopleService, mock_db_session: AsyncMock):
        people = [
            _make_person("01", "Brad Pitt"),
            _make_person("02", "Bradley Cooper"),
        ]
        mock_db_session.scalars.return_value = iter(people)

        result = await service.search_people("Brad")

        assert len(result) == 2
        assert result[0].name == "Brad Pitt"

    async def test_case_insensitive_search(
        self, service: PeopleService, mock_db_session: AsyncMock
    ):
        people = [_make_person("01", "Brad Pitt")]
        mock_db_session.scalars.return_value = iter(people)

        result = await service.search_people("brad")

        assert len(result) == 1

    async def test_no_results(self, service: PeopleService, mock_db_session: AsyncMock):
        mock_db_session.scalars.return_value = iter([])

        result = await service.search_people("zzznotfound")

        assert result == []

    async def test_search_with_limit(self, service: PeopleService, mock_db_session: AsyncMock):
        """Search with explicit limit — mock returns all items (SQLAlchemy enforces .limit())."""
        people = [_make_person(str(i).zfill(2), f"Person {i}") for i in range(10)]
        mock_db_session.scalars.return_value = iter(people[:3])  # simulate DB applying limit

        result = await service.search_people("Person", limit=3)

        assert len(result) == 3

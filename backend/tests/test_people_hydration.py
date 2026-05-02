"""Tests for TMDB hydrator people-related methods — batch resolution, dedup, edge cases."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from otix.domain.people import MediaCredit, Person
from otix.providers.tmdb.hydrator import TMDBHydrator


def _added_objects(mock_db_session: AsyncMock):
    objs = []
    for c in mock_db_session.add.call_args_list:
        objs.append(c.args[0])
    for c in mock_db_session.add_all.call_args_list:
        objs.extend(c.args[0])
    return objs


@pytest.fixture
def hydrator(mock_db_session: AsyncMock) -> TMDBHydrator:
    provider = MagicMock()
    return TMDBHydrator(provider, mock_db_session)


@pytest.fixture
def media_item(make_media_item):
    return make_media_item()


# ── _batch_get_or_create_persons ────────────────────────────────────


class TestBatchGetOrCreatePersons:
    async def test_resolves_existing_by_tmdb_id(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        existing = Person(name="Brad Pitt", tmdb_id=287)
        existing.id = "oti_pers000001"
        mock_db_session.scalars.return_value = [existing]

        entries = [{"id": 287, "name": "Brad Pitt", "profile_path": "/brad.jpg"}]
        result = await hydrator._batch_get_or_create_persons(entries)

        assert result == {287: existing}
        assert len(_added_objects(mock_db_session)) == 0

    async def test_creates_new_person_stubs(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        mock_db_session.scalars.return_value = []

        entries = [
            {"id": 819, "name": "Edward Norton", "profile_path": "/ed.jpg"},
            {"id": 287, "name": "Brad Pitt", "profile_path": "/brad.jpg"},
        ]
        result = await hydrator._batch_get_or_create_persons(entries)

        assert len(result) == 2
        assert 819 in result
        assert 287 in result
        assert result[819].name == "Edward Norton"
        assert result[819].tmdb_id == 819
        assert result[819].photo_url == "https://image.tmdb.org/t/p/w500/ed.jpg"

    async def test_dedup_within_batch_by_tmdb_id(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        """Same person appearing as cast and crew — should create only one record."""
        mock_db_session.scalars.return_value = []

        entries = [
            {"id": 287, "name": "Brad Pitt", "character": "Tyler", "profile_path": "/brad.jpg"},
            {"id": 287, "name": "Brad Pitt", "job": "Producer", "profile_path": "/brad.jpg"},
        ]
        result = await hydrator._batch_get_or_create_persons(entries)

        added = _added_objects(mock_db_session)
        people = [o for o in added if isinstance(o, Person)]
        assert len(people) == 1
        assert result[287].name == "Brad Pitt"

    async def test_dedup_by_name_within_batch(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        """Same name with different tmdb_ids — create separate records (different people)."""
        mock_db_session.scalars.return_value = []

        entries = [
            {"id": 100, "name": "John Smith", "profile_path": None},
            {"id": 200, "name": "John Smith", "profile_path": None},
        ]
        result = await hydrator._batch_get_or_create_persons(entries)

        added = _added_objects(mock_db_session)
        people = [o for o in added if isinstance(o, Person)]
        assert len(people) == 2
        assert result[100].name == "John Smith"
        assert result[200].name == "John Smith"
        assert result[100] is not result[200]  # different Person objects

    async def test_backfills_tmdb_id_on_name_match(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        """Person exists with no tmdb_id — backfill instead of creating duplicate."""
        existing = Person(name="Brad Pitt", tmdb_id=None)
        existing.id = "oti_pers000001"

        # First scalars call: by tmdb_id → empty (no tmdb_id matches)
        # Second scalars call: by name with tmdb_id IS NULL → matches existing
        mock_db_session.scalars.side_effect = [[], [existing]]

        entries = [{"id": 287, "name": "Brad Pitt", "profile_path": "/brad.jpg"}]
        result = await hydrator._batch_get_or_create_persons(entries)

        assert result[287] is existing
        assert existing.tmdb_id == 287
        assert existing.photo_url == "https://image.tmdb.org/t/p/w500/brad.jpg"
        assert len(_added_objects(mock_db_session)) == 0

    async def test_backfill_keeps_existing_photo(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        """When backfilling, preserve existing photo_url if one is already set."""
        existing = Person(name="Brad Pitt", tmdb_id=None, photo_url="https://existing.com/brad.jpg")
        existing.id = "oti_pers000001"

        mock_db_session.scalars.side_effect = [[], [existing]]

        entries = [{"id": 287, "name": "Brad Pitt", "profile_path": None}]
        result = await hydrator._batch_get_or_create_persons(entries)

        assert result[287] is existing
        assert existing.photo_url == "https://existing.com/brad.jpg"

    async def test_empty_entries(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        result = await hydrator._batch_get_or_create_persons([])
        assert result == {}
        mock_db_session.scalars.assert_not_called()

    async def test_entries_without_ids(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        entries = [{"name": "Unknown"}, {"id": None, "name": "Also Unknown"}]
        result = await hydrator._batch_get_or_create_persons(entries)
        assert result == {}
        mock_db_session.scalars.assert_not_called()

    async def test_mixed_existing_and_new(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        existing_brad = Person(name="Brad Pitt", tmdb_id=287)
        existing_brad.id = "oti_pers000001"
        mock_db_session.scalars.return_value = [existing_brad]

        entries = [
            {"id": 287, "name": "Brad Pitt", "profile_path": "/brad.jpg"},
            {"id": 819, "name": "Edward Norton", "profile_path": "/ed.jpg"},
        ]
        result = await hydrator._batch_get_or_create_persons(entries)

        assert result[287] is existing_brad
        assert result[819].name == "Edward Norton"
        assert result[819].tmdb_id == 819

        added = _added_objects(mock_db_session)
        new_people = [o for o in added if isinstance(o, Person)]
        assert len(new_people) == 1


# ── hydrate_credits edge cases ──────────────────────────────────────


class TestHydrateCreditsEdgeCases:
    async def test_batch_add_used_for_credits(
        self, hydrator: TMDBHydrator, media_item, mock_db_session: AsyncMock
    ):
        """After the efficiency refactor, credits should use add_all not individual add."""
        mock_db_session.scalars.return_value = []

        raw = {
            "credits": {
                "cast": [
                    {"id": 819, "name": "Edward Norton", "character": "Narrator", "order": 0},
                    {"id": 287, "name": "Brad Pitt", "character": "Tyler", "order": 1},
                ],
                "crew": [
                    {"id": 7467, "name": "David Fincher", "job": "Director", "order": 0},
                ],
            }
        }
        await hydrator.hydrate_credits(media_item, raw)

        credits = [o for o in _added_objects(mock_db_session) if isinstance(o, MediaCredit)]
        assert len(credits) == 3

    async def test_cast_only(
        self, hydrator: TMDBHydrator, media_item, mock_db_session: AsyncMock
    ):
        mock_db_session.scalars.return_value = []

        raw = {
            "credits": {
                "cast": [{"id": 819, "name": "Edward Norton", "character": "Narrator", "order": 0}],
                "crew": [],
            }
        }
        await hydrator.hydrate_credits(media_item, raw)

        credits = [o for o in _added_objects(mock_db_session) if isinstance(o, MediaCredit)]
        assert len(credits) == 1
        assert credits[0].role == "cast"
        assert credits[0].character_name == "Narrator"

    async def test_crew_only(
        self, hydrator: TMDBHydrator, media_item, mock_db_session: AsyncMock
    ):
        mock_db_session.scalars.return_value = []

        raw = {
            "credits": {
                "cast": [],
                "crew": [{"id": 7467, "name": "David Fincher", "job": "Director", "order": 0}],
            }
        }
        await hydrator.hydrate_credits(media_item, raw)

        credits = [o for o in _added_objects(mock_db_session) if isinstance(o, MediaCredit)]
        assert len(credits) == 1
        assert credits[0].role == "crew"
        assert credits[0].character_name == "Director"

    async def test_empty_cast_and_crew(
        self, hydrator: TMDBHydrator, media_item, mock_db_session: AsyncMock
    ):
        mock_db_session.scalars.return_value = []

        raw = {"credits": {"cast": [], "crew": []}}
        await hydrator.hydrate_credits(media_item, raw)

        mock_db_session.add.assert_not_called()
        mock_db_session.add_all.assert_not_called()

    async def test_skips_missing_person_id(
        self, hydrator: TMDBHydrator, media_item, mock_db_session: AsyncMock
    ):
        mock_db_session.scalars.return_value = []

        raw = {
            "credits": {
                "cast": [{"name": "No ID", "character": "Extra", "order": 0}],
                "crew": [],
            }
        }
        await hydrator.hydrate_credits(media_item, raw)

        mock_db_session.add.assert_not_called()
        mock_db_session.add_all.assert_not_called()

    async def test_skips_entries_without_name(
        self, hydrator: TMDBHydrator, media_item, mock_db_session: AsyncMock
    ):
        mock_db_session.scalars.return_value = []

        raw = {
            "credits": {
                "cast": [{"id": 999, "character": "Ghost", "order": 0}],
                "crew": [],
            }
        }
        await hydrator.hydrate_credits(media_item, raw)

        mock_db_session.add.assert_not_called()
        mock_db_session.add_all.assert_not_called()

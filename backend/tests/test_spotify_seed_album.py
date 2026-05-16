"""Tests for Spotify catalog seed behavior."""

from __future__ import annotations

from unittest.mock import AsyncMock

import otix.tasks.sync.spotify as sync_tasks
from otix.domain.media import Album, MediaItem
from otix.domain.people import MediaCredit, Person
from otix.tasks.sync.spotify import (
    _backfill_spotify_album_titles,
    _create_spotify_artist_credits,
    _get_or_create_spotify_artist,
    _sync_spotify_seed_album,
)


def _added_objects(mock_db_session: AsyncMock):
    return [c.args[0] for c in mock_db_session.add.call_args_list]


async def test_get_or_create_spotify_artist_creates_person(mock_db_session: AsyncMock):
    mock_db_session.scalar.return_value = None

    person = await _get_or_create_spotify_artist(
        mock_db_session,
        "SZA",
        "spotify-artist-sza",
    )

    assert person.name == "SZA"
    assert person.spotify_artist_id == "spotify-artist-sza"
    assert person in _added_objects(mock_db_session)
    mock_db_session.flush.assert_awaited_once()


async def test_create_spotify_artist_credits_links_artists_separately(
    mock_db_session: AsyncMock,
):
    primary = Person(name="SZA", spotify_artist_id="spotify-artist-sza")
    primary.id = "oti_primary001"
    featured = Person(name="Phoebe Bridgers", spotify_artist_id="spotify-artist-phoebe")
    featured.id = "oti_featured01"
    mock_db_session.scalar.side_effect = [primary, None, featured, None]

    await _create_spotify_artist_credits(
        mock_db_session,
        "oti_album000001",
        [
            {"id": "spotify-artist-sza", "name": "SZA"},
            {"id": "spotify-artist-phoebe", "name": "Phoebe Bridgers"},
        ],
    )

    credits = [o for o in _added_objects(mock_db_session) if isinstance(o, MediaCredit)]
    assert len(credits) == 2
    assert credits[0].media_item_id == "oti_album000001"
    assert credits[0].person_id == "oti_primary001"
    assert credits[0].role == "primary"
    assert credits[0].character_name == "SZA"
    assert credits[1].person_id == "oti_featured01"
    assert credits[1].role == "artist"
    assert credits[1].character_name == "Phoebe Bridgers"


async def test_spotify_seed_album_saves_album_title_and_artist_credit(monkeypatch):
    class FakeSession:
        def __init__(self):
            self.added = []
            self.committed = False

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def scalar(self, _stmt):
            return None

        def add(self, item):
            self.added.append(item)

        async def flush(self):
            for idx, item in enumerate(self.added):
                if hasattr(item, "id") and item.id is None:
                    item.id = f"oti_mock{idx:08d}"

        async def commit(self):
            self.committed = True

    class FakeSpotifyProvider:
        def __init__(self, _redis):
            pass

        async def get_album(self, _spotify_id):
            return {
                "id": "spotify-album-sos",
                "name": "SOS",
                "artists": [{"id": "spotify-artist-sza", "name": "SZA"}],
                "album_type": "album",
                "total_tracks": 23,
                "external_urls": {"spotify": "https://open.spotify.com/album/sos"},
                "tracks": {"items": []},
            }

    class FakeApp:
        def __init__(self):
            self.tasks = []

        def send_task(self, name, args):
            self.tasks.append((name, args))

    fake_session = FakeSession()
    fake_app = FakeApp()
    monkeypatch.setattr(sync_tasks, "async_session", lambda: fake_session)
    monkeypatch.setattr(sync_tasks, "get_redis", AsyncMock(return_value=object()))
    monkeypatch.setattr(sync_tasks, "SpotifyProvider", FakeSpotifyProvider)
    monkeypatch.setattr(sync_tasks, "app", fake_app)
    monkeypatch.setattr(sync_tasks, "_progress_incr", AsyncMock())

    result = await _sync_spotify_seed_album("spotify-album-sos")

    media_item = next(item for item in fake_session.added if isinstance(item, MediaItem))
    album = next(item for item in fake_session.added if isinstance(item, Album))
    credit = next(item for item in fake_session.added if isinstance(item, MediaCredit))
    artist = next(item for item in fake_session.added if isinstance(item, Person))
    assert result == {
        "otix_id": media_item.id,
        "spotify_id": "spotify-album-sos",
        "title": "SOS",
    }
    assert media_item.title == "SOS"
    assert media_item.slug == "sos"
    assert album.media_item_id == media_item.id
    assert artist.name == "SZA"
    assert artist.spotify_artist_id == "spotify-artist-sza"
    assert credit.media_item_id == media_item.id
    assert credit.person_id == artist.id
    assert credit.role == "primary"
    assert fake_session.committed is True


async def test_backfill_spotify_album_titles_updates_existing_combined_title(monkeypatch):
    item = MediaItem(
        id="oti_album000001",
        media_type="music",
        title="SZA - SOS",
        slug="sza-sos",
    )
    album = Album(media_item_id=item.id, spotify_id="spotify-album-sos")

    class FakeResult:
        def all(self):
            return [(album, item)]

    class FakeSession:
        def __init__(self):
            self.added = []
            self.commits = 0
            self.rollbacks = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _stmt):
            return FakeResult()

        async def scalar(self, _stmt):
            return None

        def add(self, item):
            self.added.append(item)

        async def flush(self):
            for idx, item in enumerate(self.added):
                if hasattr(item, "id") and item.id is None:
                    item.id = f"oti_mock{idx:08d}"

        async def commit(self):
            self.commits += 1

        async def rollback(self):
            self.rollbacks += 1

    class FakeSpotifyProvider:
        def __init__(self, _redis):
            pass

        async def get_album(self, _spotify_id):
            return {
                "id": "spotify-album-sos",
                "name": "SOS",
                "release_date": "2022-12-09",
                "artists": [{"id": "spotify-artist-sza", "name": "SZA"}],
            }

    fake_session = FakeSession()
    monkeypatch.setattr(sync_tasks, "async_session", lambda: fake_session)
    monkeypatch.setattr(sync_tasks, "get_redis", AsyncMock(return_value=object()))
    monkeypatch.setattr(sync_tasks, "SpotifyProvider", FakeSpotifyProvider)

    result = await _backfill_spotify_album_titles(limit=10)

    artist = next(added for added in fake_session.added if isinstance(added, Person))
    credit = next(added for added in fake_session.added if isinstance(added, MediaCredit))
    assert result == {
        "scanned": 1,
        "updated_titles": 1,
        "updated_release_dates": 1,
        "created_credits": 1,
        "failed": 0,
        "rate_limited": False,
    }
    assert item.title == "SOS"
    assert item.slug == "sos"
    assert item.release_date.isoformat() == "2022-12-09"
    assert artist.name == "SZA"
    assert artist.spotify_artist_id == "spotify-artist-sza"
    assert credit.media_item_id == item.id
    assert credit.person_id == artist.id
    assert credit.role == "primary"
    assert fake_session.commits == 1
    assert fake_session.rollbacks == 0


async def test_backfill_spotify_album_titles_splits_legacy_title_without_provider(monkeypatch):
    item = MediaItem(
        id="oti_album000001",
        media_type="music",
        title="SZA — SOS",
        slug="sza-sos",
    )
    album = Album(media_item_id=item.id, spotify_id="spotify-album-sos")

    class FakeResult:
        def all(self):
            return [(album, item)]

    class FakeSession:
        def __init__(self):
            self.added = []
            self.commits = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _stmt):
            return FakeResult()

        async def scalar(self, _stmt):
            return None

        def add(self, item):
            self.added.append(item)

        async def flush(self):
            for idx, item in enumerate(self.added):
                if hasattr(item, "id") and item.id is None:
                    item.id = f"oti_mock{idx:08d}"

        async def commit(self):
            self.commits += 1

        async def rollback(self):
            raise AssertionError("legacy split backfill should not roll back")

    class FakeSpotifyProvider:
        calls = 0

        def __init__(self, _redis):
            pass

        async def get_album(self, _spotify_id):
            self.calls += 1
            raise AssertionError("legacy split backfill should not call Spotify")

    fake_session = FakeSession()
    monkeypatch.setattr(sync_tasks, "async_session", lambda: fake_session)
    monkeypatch.setattr(sync_tasks, "get_redis", AsyncMock(return_value=object()))
    monkeypatch.setattr(sync_tasks, "SpotifyProvider", FakeSpotifyProvider)

    result = await _backfill_spotify_album_titles(limit=10)

    artist = next(added for added in fake_session.added if isinstance(added, Person))
    credit = next(added for added in fake_session.added if isinstance(added, MediaCredit))
    assert result == {
        "scanned": 1,
        "updated_titles": 1,
        "updated_release_dates": 0,
        "created_credits": 1,
        "failed": 0,
        "rate_limited": False,
    }
    assert item.title == "SOS"
    assert item.slug == "sos"
    assert artist.name == "SZA"
    assert artist.spotify_artist_id is None
    assert credit.person_id == artist.id
    assert credit.role == "primary"
    assert fake_session.commits == 1

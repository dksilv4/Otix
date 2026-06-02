"""Tests for MusicBrainz sync task and stub handling."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import otix.tasks.sync.musicbrainz as sync_tasks
from otix.domain.media import Album, ExternalID, MediaItem
from otix.tasks.sync.musicbrainz import _sync_musicbrainz_album


async def test_sync_musicbrainz_album_with_stub_creates_new_media_item(monkeypatch):
    class FakeSession:
        def __init__(self):
            self.added = []
            self.committed = False
            self.flushed = False

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def scalar(self, stmt):
            return ext_id

        async def get(self, model, pk):
            return None

        def add(self, item):
            self.added.append(item)

        def add_all(self, items):
            self.added.extend(items)

        def begin_nested(self):
            class FakeNested:
                async def __aenter__(self):
                    return self

                async def __aexit__(self, *_args):
                    return None

            return FakeNested()

        async def execute(self, stmt):
            class FakeResult:
                def scalars(self):
                    class FakeScalars:
                        def all(self):
                            return []

                    return FakeScalars()

                def all(self):
                    return []

            return FakeResult()

        async def delete(self, item):
            pass

        async def flush(self):
            self.flushed = True
            for idx, item in enumerate(self.added):
                if hasattr(item, "id") and item.id is None:
                    item.id = f"oti_mock{idx:08d}"

        async def commit(self):
            self.committed = True

    # Setup the stub ExternalID (media_item_id and entity_id are None)
    ext_id = ExternalID(
        provider="musicbrainz",
        external_id="mbid-123",
        media_item_id=None,
        entity_id=None,
        entity_type=None,
    )

    class FakeMusicBrainzProvider:
        def __init__(self, _redis):
            pass

        async def get_release(self, mbid):
            return {
                "id": "mbid-123",
                "title": "Mock Album",
                "disambiguation": "Mock Disambiguation",
                "date": "2026-06-01",
                "relations": [],
                "media": [],
            }

        async def get_cover_art(self, mbid):
            return None

    fake_session = FakeSession()
    monkeypatch.setattr(sync_tasks, "async_session", lambda: fake_session)
    monkeypatch.setattr(sync_tasks, "get_redis", AsyncMock(return_value=object()))
    monkeypatch.setattr(sync_tasks, "MusicBrainzProvider", FakeMusicBrainzProvider)
    monkeypatch.setattr(sync_tasks, "_progress_incr", AsyncMock())
    monkeypatch.setattr(sync_tasks, "app", MagicMock())

    result = await _sync_musicbrainz_album("mbid-123")

    assert result is not None
    assert result["mbid"] == "mbid-123"
    assert result["title"] == "Mock Album"

    # Verify a new MediaItem and Album were added
    media_item = next(item for item in fake_session.added if isinstance(item, MediaItem))
    album = next(item for item in fake_session.added if isinstance(item, Album))

    assert media_item.title == "Mock Album"
    assert media_item.id is not None
    assert album.media_item_id == media_item.id
    assert ext_id.entity_id == media_item.id
    assert ext_id.media_item_id == media_item.id
    assert ext_id.entity_type == "media_item"
    assert fake_session.committed is True

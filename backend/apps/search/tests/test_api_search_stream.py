"""Tests for the two-stage Server-Sent Events (SSE) streaming search endpoint."""

import json
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.media.models import Game, MediaItem, Movie, Show


def _seed_media(media_type: str, title: str, slug: str) -> MediaItem:
    item = MediaItem.objects.create(media_type=media_type, title=title, slug=slug, popularity=50.0)
    subtype = {"movie": Movie, "show": Show, "game": Game}[media_type]
    subtype.objects.create(media_item=item)
    return item


class SearchStreamEndpointTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.movie = _seed_media("movie", "Inception", "inception")
        self.game = _seed_media("game", "Inception Game", "inception-game")

    def test_search_stream_requires_q_param(self) -> None:
        response = self.client.get("/api/v1/search/stream")
        self.assertEqual(response.status_code, 400)

    def test_search_stream_delivers_local_and_done_events(self) -> None:
        response = self.client.get("/api/v1/search/stream", {"q": "Inception"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/event-stream")

        content = b"".join(response.streaming_content).decode("utf-8")
        self.assertIn("event: local", content)
        self.assertIn("event: done", content)

        # Parse local event payload
        events = {}
        for block in content.strip().split("\n\n"):
            lines = block.strip().split("\n")
            if len(lines) >= 2 and lines[0].startswith("event:"):
                event_name = lines[0].split("event:")[1].strip()
                data_str = lines[1].split("data:")[1].strip()
                events[event_name] = json.loads(data_str)

        self.assertIn("local", events)
        local_items = events["local"]
        self.assertIsInstance(local_items, list)
        self.assertGreaterEqual(len(local_items), 2)
        titles = {it["title"] for it in local_items}
        self.assertIn("Inception", titles)
        self.assertIn("Inception Game", titles)

        self.assertIn("done", events)
        self.assertEqual(events["done"]["status"], "complete")
        self.assertGreaterEqual(events["done"]["total_local"], 2)

    def test_search_stream_filters_by_media_type(self) -> None:
        response = self.client.get("/api/v1/search/stream", {"q": "Inception", "media_type": "movie"})
        self.assertEqual(response.status_code, 200)
        content = b"".join(response.streaming_content).decode("utf-8")

        for block in content.strip().split("\n\n"):
            lines = block.strip().split("\n")
            if len(lines) >= 2 and lines[0].startswith("event: local"):
                local_items = json.loads(lines[1].split("data:")[1].strip())
                self.assertTrue(all(it["media_type"] == "movie" for it in local_items))
                titles = {it["title"] for it in local_items}
                self.assertIn("Inception", titles)
                self.assertNotIn("Inception Game", titles)

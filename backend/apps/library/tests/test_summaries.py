"""Tests for library summary asset resolution (``summaries.enrich_media_items``)."""

from __future__ import annotations

from django.test import TestCase

from apps.library.services.summaries import enrich_media_items
from apps.media.models import MediaAsset, MediaItem


class ResolvedBackdropTests(TestCase):
    def _item(self) -> MediaItem:
        return MediaItem.objects.create(
            media_type="movie", title="Blade Runner", slug="blade-runner-lib"
        )

    def test_backdrop_prefers_textless_backdrop_row(self) -> None:
        item = self._item()
        MediaAsset.objects.create(
            media_item=item, asset_type="backdrop", url="http://img.example/texted.png", score=90
        )
        MediaAsset.objects.create(
            media_item=item,
            asset_type="textless_backdrop",
            url="http://img.example/clean.png",
            score=10,
        )
        enrich_media_items([item])
        self.assertEqual(item._resolved_backdrop_url, "http://img.example/clean.png")

    def test_backdrop_falls_back_to_backdrop_row_when_no_textless(self) -> None:
        item = self._item()
        MediaAsset.objects.create(
            media_item=item, asset_type="backdrop", url="http://img.example/texted.png", score=50
        )
        enrich_media_items([item])
        self.assertEqual(item._resolved_backdrop_url, "http://img.example/texted.png")

    def test_textless_poster_falls_back_to_clean_backdrop(self) -> None:
        item = self._item()
        MediaAsset.objects.create(
            media_item=item, asset_type="backdrop", url="http://img.example/texted.png", score=50
        )
        enrich_media_items([item])
        self.assertEqual(item._resolved_textless_poster_url, "http://img.example/texted.png")

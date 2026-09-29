"""Tests for franchise/collection name normalization."""

from __future__ import annotations

from django.test import SimpleTestCase

from apps.lists.services.collection import normalize_franchise_name


class TestNormalizeFranchiseName(SimpleTestCase):
    def test_strips_collection_suffix(self):
        self.assertEqual(normalize_franchise_name("The Witcher Collection"), "the witcher")

    def test_strips_franchise_suffix(self):
        self.assertEqual(normalize_franchise_name("The Witcher Franchise"), "the witcher")

    def test_strips_film_series_suffix(self):
        self.assertEqual(normalize_franchise_name("Star Wars Film Series"), "star wars")

    def test_strips_series_suffix(self):
        self.assertEqual(normalize_franchise_name("Harry Potter Series"), "harry potter")

    def test_strips_saga_suffix(self):
        self.assertEqual(normalize_franchise_name("Twilight Saga"), "twilight")

    def test_strips_trilogy_suffix(self):
        self.assertEqual(normalize_franchise_name("The Godfather Trilogy"), "the godfather")

    def test_lowercases(self):
        self.assertEqual(normalize_franchise_name("THE WITCHER"), "the witcher")

    def test_removes_punctuation(self):
        self.assertEqual(normalize_franchise_name("Marvel's Avengers"), "marvels avengers")

    def test_collapses_whitespace(self):
        self.assertEqual(normalize_franchise_name("  Star   Wars  "), "star wars")

    def test_no_suffix_unchanged(self):
        self.assertEqual(normalize_franchise_name("The Witcher"), "the witcher")

    def test_suffix_must_be_at_end(self):
        self.assertEqual(normalize_franchise_name("Collection Agency"), "collection agency")

    def test_different_names_produce_different_output(self):
        a = normalize_franchise_name("Star Wars Collection")
        b = normalize_franchise_name("Star Trek Franchise")
        self.assertNotEqual(a, b)

    def test_same_ip_different_suffixes_match(self):
        """Cross-provider matching: IGDB "The Witcher" vs TMDB "The Witcher Collection"."""
        a = normalize_franchise_name("The Witcher")
        b = normalize_franchise_name("The Witcher Collection")
        self.assertEqual(a, b)

"""Tests for IGDB franchise extraction."""

from __future__ import annotations

from otix.providers.igdb.transformer import extract_franchise


class TestExtractFranchise:
    def test_extracts_franchise_from_valid_data(self):
        result = extract_franchise({
            "franchise": {"id": 123, "name": "The Witcher"},
        })
        assert result == {"id": 123, "name": "The Witcher"}

    def test_returns_none_when_no_franchise_key(self):
        assert extract_franchise({"name": "Some Game"}) is None

    def test_returns_none_when_franchise_is_none(self):
        assert extract_franchise({"franchise": None}) is None

    def test_returns_none_when_franchise_not_dict(self):
        assert extract_franchise({"franchise": "not a dict"}) is None

    def test_returns_none_when_franchise_missing_id(self):
        assert extract_franchise({"franchise": {"name": "The Witcher"}}) is None

    def test_returns_none_when_franchise_missing_name(self):
        assert extract_franchise({"franchise": {"id": 123}}) is None

    def test_returns_none_when_franchise_name_empty(self):
        assert extract_franchise({"franchise": {"id": 123, "name": ""}}) is None

    def test_casts_float_id_to_int(self):
        result = extract_franchise({
            "franchise": {"id": 123.0, "name": "The Witcher"},
        })
        assert result == {"id": 123, "name": "The Witcher"}

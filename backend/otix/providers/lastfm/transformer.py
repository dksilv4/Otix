# TODO: Review this file
"""Last.fm API response → domain enrichments."""

from __future__ import annotations

from otix.lib.types import JSONValue


def extract_wiki_summary(raw: dict[str, JSONValue]) -> str | None:
    wiki = raw.get("wiki")
    if isinstance(wiki, dict):
        return wiki.get("summary") if isinstance(wiki.get("summary"), str) else None
    return None


def extract_tags(raw: dict[str, JSONValue]) -> list[str]:
    tags = raw.get("toptags", {}).get("tag", []) if isinstance(raw.get("toptags"), dict) else raw.get("tags", {}).get("tag", [])
    if isinstance(tags, list):
        return [t["name"] for t in tags if isinstance(t, dict) and t.get("name")]
    return []


def extract_playcount(raw: dict[str, JSONValue]) -> int | None:
    pc = raw.get("playcount")
    if isinstance(pc, (int, str)):
        return int(pc)
    return None


def extract_listeners(raw: dict[str, JSONValue]) -> int | None:
    lr = raw.get("listeners")
    if isinstance(lr, (int, str)):
        return int(lr)
    return None

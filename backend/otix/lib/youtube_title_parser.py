# TODO: Review this file
"""YouTube music video title parser.

Three-layer approach:
  1. Normalize — unicode dashes, whitespace, separator detection
  2. Extract — artist/song split, featuring artists, remix detection
  3. Validate — confidence scoring

Returns a ParsedTitle dataclass with structured fields.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ── Known bracket markers (ordered by length to match longest first) ──

_BRACKET_MARKERS = [
    # Parenthesized
    "Official Music Video", "Official Video", "Official Audio",
    "Official Lyric Video", "Official Performance Video",
    "Lyric Video", "Lyrics", "Lyric",
    "Visualizer", "Visualizer Video",
    "Music Video", "MV",
    "Audio", "Audio Only",
    "Performance Video", "Performance",
    "Official", "Video", "HD", "4K", "HQ", "High Quality",
    "Explicit", "Clean", "Edited",
    "Remix", "Extended Mix", "Radio Edit", "Club Mix", "Short Version", "Extended Version",
    "Album Version", "Single Version", "Single Edit",
    "Slowed", "Sped Up", "Nightcore",
    "Live", "Live Performance",
    "prod.", "produced by",
    "with",
    # Featuring variants — handled separately below first
]

# featuring markers extracted from brackets (not part of the main artist)
_FEAT_MARKERS = ["feat.", "ft.", "featuring"]

# Separator patterns (ordered by priority)
_SEPARATORS = [" - ", " | ", " – ", " — ", " → "]

# Unicode dashes to normalize
_UNICODE_DASHES = {
    "–": " - ",  # en dash
    "—": " - ",  # em dash
    "―": " - ",  # horizontal bar
    "→": " - ",  # right arrow
}


@dataclass
class ParsedTitle:
    """Structured result from parsing a music video title."""

    artist: str
    song_title: str
    featuring_artists: list[str] = field(default_factory=list)
    is_remix: bool = False
    remixer: str | None = None
    is_live: bool = False
    confidence: float = 1.0
    raw_title: str = ""


def parse_music_title(raw_title: str, channel_title: str | None = None) -> ParsedTitle:
    """Parse a YouTube video title into artist + song components.

    Handles Topic channels: if channel_title looks like "Artist - Topic",
    the artist comes from the channel and the song is the full video title.

    Returns ParsedTitle with confidence 0.0 if unparseable.
    """
    result = ParsedTitle(artist="", song_title="", raw_title=raw_title)

    # ── Layer 1: Normalize ──
    normalized = _normalize(raw_title)

    # ── Layer 2: Extract ──

    # Special case: Topic channel — artist from channel, song is bare title
    topic_artist = _topic_channel_artist(channel_title) if channel_title else None
    if topic_artist:
        artist = topic_artist
        song = _strip_all_brackets(normalized).strip()
        result.artist = artist
        result.song_title = song
        result.confidence = 0.95 if song else 0.0
        return result

    # Find the separator
    sep_pos = _find_separator(normalized)
    if sep_pos == -1:
        # No separator — treat whole title as song, try channel title as artist
        if channel_title:
            result.artist = _strip_topic_suffix(channel_title)
            result.song_title = _strip_all_brackets(normalized).strip()
            result.confidence = 0.3
            return result
        result.song_title = _strip_all_brackets(normalized).strip()
        result.confidence = 0.0
        return result

    left = normalized[:sep_pos].strip()
    right = normalized[sep_pos + 3:].strip()

    # Determine orientation
    if _looks_like_artist(left) and _looks_like_song(right):
        artist_side, song_side = left, right
    elif _looks_like_artist(right) and _looks_like_song(left):
        artist_side, song_side = right, left
    else:
        # Default: left = artist, right = song
        artist_side, song_side = left, right

    # Parse artists (split on , & feat. ft.)
    artists, feats = _parse_artist_list(artist_side)
    main_artist = artists[0] if artists else artist_side

    # Strip brackets from song side
    song = _strip_all_brackets(song_side).strip()

    # Detect featuring in song side brackets
    song_feats = _extract_feat_from_brackets(song_side)
    feats.extend(song_feats)

    # Detect remix
    is_remix, remixer = _detect_remix(song_side)

    # Detect live
    is_live = _detect_live(song_side)

    # Detach featuring from song title itself (e.g., "Song Title feat. X")
    song = _strip_trailing_feat(song)

    result.artist = main_artist.strip()
    result.song_title = song.strip()
    result.featuring_artists = [f.strip() for f in feats if f.strip()]
    result.is_remix = is_remix
    result.remixer = remixer
    result.is_live = is_live
    result.confidence = _compute_confidence(result)

    return result


# ── Layer 1: Normalize ──


def _normalize(title: str) -> str:
    s = title.strip()
    for dash, replacement in _UNICODE_DASHES.items():
        s = s.replace(dash, replacement)
    return s


# ── Layer 2: Extract ──


def _find_separator(normalized: str) -> int:
    """Find the position of the best separator. Returns -1 if none found."""
    for sep in _SEPARATORS:
        pos = normalized.find(sep)
        if pos > 0:  # not at the start
            return pos
    return -1


def _looks_like_artist(s: str) -> bool:
    """Heuristic: artist side is shorter, no video-specific brackets."""
    s = s.strip()
    if len(s) > 100:
        return False
    bracket_count = s.count("(") + s.count("[")
    if bracket_count >= 2:
        return False
    return True


def _looks_like_song(s: str) -> bool:
    """Heuristic: song side may have brackets, may be longer."""
    s = s.strip()
    return len(s) >= 1


def _parse_artist_list(artist_side: str) -> tuple[list[str], list[str]]:
    """Parse a multi-artist string into main artists and featuring artists."""
    artists: list[str] = []
    feats: list[str] = []

    # Try splitting by featuring markers first (these indicate separate artists)
    for marker in _FEAT_MARKERS:
        pattern = re.compile(rf"\s+{re.escape(marker)}\s+", re.IGNORECASE)
        parts = pattern.split(artist_side, maxsplit=1)
        if len(parts) == 2:
            artists = _split_by_comma_or_ampersand(parts[0])
            feats = _split_by_comma_or_ampersand(parts[1])
            return artists, feats

    # No featuring marker — split by comma or &
    artists = _split_by_comma_or_ampersand(artist_side)
    return artists, feats


def _split_by_comma_or_ampersand(s: str) -> list[str]:
    """Split by comma or & but preserve compound names if possible."""
    # First try splitting by " & "
    parts = s.split(" & ")
    if len(parts) > 1:
        result = []
        for p in parts:
            result.extend([x.strip() for x in p.split(", ")])
        return result
    # Fall back to comma split
    return [x.strip() for x in s.split(", ")]


def _strip_all_brackets(s: str) -> str:
    """Strip all known bracket markers from a string."""
    s = s.strip()

    # Remove [content] brackets
    s = re.sub(r"\s*\[[^\]]*\]\s*$", "", s)

    # Remove nested (...) brackets from end
    while True:
        prev = s
        # Try known markers first (longest match first)
        for marker in _BRACKET_MARKERS:
            # Pattern: (marker) or (marker - detail)
            pattern = re.compile(
                r"\s*\(\s*" + re.escape(marker) + r"(?:\s*[-–—]\s*[^)]+)?\s*\)\s*$",
                re.IGNORECASE,
            )
            s = pattern.sub("", s).strip()
        # Remove any trailing (...)
        s = re.sub(r"\s*\([^)]*\)\s*$", "", s, count=1).strip()
        # Remove trailing featuring
        s = _strip_single_trailing_feat(s)
        if s == prev:
            break

    return s


def _extract_feat_from_brackets(s: str) -> list[str]:
    """Extract featuring artists from bracket expressions like '(feat. X)' or '(ft. X)'."""
    feats: list[str] = []
    for marker in _FEAT_MARKERS:
        pattern = re.compile(
            r"\(\s*" + re.escape(marker) + r"\s+([^)]+)\s*\)", re.IGNORECASE
        )
        for m in pattern.finditer(s):
            feat_text = m.group(1).strip()
            feats.extend([x.strip() for x in re.split(r"\s*,\s*|\s+&\s+", feat_text)])
        # Also check square brackets
        pattern = re.compile(
            r"\[\s*" + re.escape(marker) + r"\s+([^\]]+)\s*\]", re.IGNORECASE
        )
        for m in pattern.finditer(s):
            feat_text = m.group(1).strip()
            feats.extend([x.strip() for x in re.split(r"\s*,\s*|\s+&\s+", feat_text)])
    return feats


def _detect_remix(s: str) -> tuple[bool, str | None]:
    """Detect if the title indicates a remix and who the remixer is."""
    # Pattern: (Artist Remix) or (Artist Remix) or (Remix)
    m = re.search(r"\(\s*([^)]+)\s+Remix\s*\)", s, re.IGNORECASE)
    if m:
        return True, m.group(1).strip()
    if re.search(r"\(\s*Remix\s*\)", s, re.IGNORECASE):
        return True, None
    return False, None


def _detect_live(s: str) -> bool:
    return bool(re.search(r"\(\s*Live(?:\s|\))", s, re.IGNORECASE))


def _strip_trailing_feat(song: str) -> str:
    """Strip 'feat. X' from the end of the song title itself."""
    for marker in _FEAT_MARKERS:
        pattern = re.compile(r"\s+" + re.escape(marker) + r"\s+[^)]+$", re.IGNORECASE)
        song = pattern.sub("", song).strip()
    return song


def _strip_single_trailing_feat(s: str) -> str:
    for marker in _FEAT_MARKERS:
        pattern = re.compile(
            r"\s*\(\s*" + re.escape(marker) + r"\s+[^)]*\s*\)\s*$", re.IGNORECASE
        )
        s = pattern.sub("", s).strip()
    return s


# ── Layer 3: Validate ──


def _compute_confidence(result: ParsedTitle) -> float:
    if not result.artist or not result.song_title:
        return 0.0
    if len(result.artist) < 1 or len(result.song_title) < 1:
        return 0.0
    # Deduct for generic-looking artists/songs
    artist_lower = result.artist.lower()
    if artist_lower in {"various", "various artists", "unknown", "unknown artist"}:
        return 0.2
    if len(result.artist) > 80:
        return max(0.0, result.confidence - 0.3)
    return 0.9


# ── Topic channel helpers ──


def _topic_channel_artist(channel_title: str) -> str | None:
    """If channel is an auto-generated Topic channel, return the artist name."""
    if channel_title.endswith(" - Topic"):
        return channel_title[: -len(" - Topic")].strip()
    return None


def _strip_topic_suffix(channel_title: str) -> str:
    if channel_title.endswith(" - Topic"):
        return channel_title[: -len(" - Topic")].strip()
    return channel_title

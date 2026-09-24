#!/usr/bin/env python3
"""Test YouTube Music inner API viability for liked songs import.

Usage:
  1) Via Otix DB (needs running backend):
     python scripts/test_yt_music_api.py --user-id <uuid>

  2) With a raw Google OAuth token:
     python scripts/test_yt_music_api.py --token ya29...

  3) With headers file (browser cookies exported from ytmusicapi):
     python scripts/test_yt_music_api.py --headers headers.json

Questions answered:
  - Does YT Music inner API return structured metadata (artist, title, album)?
  - Does existing Google OAuth (youtube scope) work?
  - What fields available for matching?
  - Match rate vs Otix albums (when DB available)?
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

try:
    import httpx
except ImportError:
    print("ERROR: httpx required. Install: pip install httpx")
    sys.exit(1)


# ── Constants ───────────────────────────────────────────────────────────────

YT_MUSIC_BASE = "https://music.youtube.com/youtubei/v1"
# Public API key embedded in YT Music web app -same one ytmusicapi uses
YT_MUSIC_KEY = "AIzaSyC9XL3ZjBddKy3b7FhdiRgslc9SqZ7k8Is"

CLIENT_VERSION = "1.20250310.00.00"

# Browse IDs for YouTube Music library sections
BROWSE_IDS = {
    "liked_videos": "FEmusic_liked_videos",
    "liked_playlists": "FEmusic_liked_playlists",
    "library": "FEmusic_library_landing",
    "history": "FEmusic_history",
    "home": "FEmusic_home",
    "listen_again": "FEmusic_listen_again",
}

# SAPISID cookies needed from browser
SAPISID_COOKIE_NAMES = [
    "SAPISID",
    "__Secure-3PAPISID",
    "__Secure-3PSID",
    "HSID",
    "SSID",
    "APISID",
    "SID",
    "SIDCC",
    "__Secure-3PSIDCC",
]

# ── Helpers ─────────────────────────────────────────────────────────────────


def _build_context() -> dict:
    """Build YT Music API context block."""
    return {
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": CLIENT_VERSION,
                "platform": "DESKTOP",
                "hl": "en",
                "gl": "US",
            },
            "user": {"enableSafetyMode": False},
        }
    }


def _extract_songs(browse_response: dict) -> list[dict]:
    """Extract song-level metadata from a YT Music response.

    Handles multiple response structures:
      - browse: sectionListRenderer -> musicShelfRenderer
      - browse: singleColumnBrowseResultsRenderer -> tabs -> sectionListRenderer
      - search: tabbedSearchResultsRenderer -> tabs -> tabRenderer -> sectionListRenderer
      - playlist: musicPlaylistShelfRenderer

    Returns list of dicts with keys: title, artist, album, videoId, thumbnails
    """
    songs: list[dict] = []
    contents = browse_response.get("contents", {})

    # Collect all section list contents from various structures
    section_lists: list[list[dict]] = []

    # 1. Direct sectionListRenderer
    slr = contents.get("sectionListRenderer", {})
    if slr:
        section_lists.append(slr.get("contents", []))

    # 2. singleColumnBrowseResultsRenderer -> tabs -> tabRenderer -> sectionListRenderer
    single = contents.get("singleColumnBrowseResultsRenderer", {})
    if single:
        tabs = single.get("tabs", [])
        for tab in tabs:
            tab_content = (
                tab.get("tabRenderer", {}).get("content", {}).get("sectionListRenderer", {})
            )
            if tab_content:
                section_lists.append(tab_content.get("contents", []))

    # 3. tabbedSearchResultsRenderer (search results)
    tabbed = contents.get("tabbedSearchResultsRenderer", {})
    if tabbed:
        for tab in tabbed.get("tabs", []):
            tab_content = (
                tab.get("tabRenderer", {}).get("content", {}).get("sectionListRenderer", {})
            )
            if tab_content:
                section_lists.append(tab_content.get("contents", []))

    # 4. musicPlaylistShelfRenderer (direct playlist access)
    # Try from content wrapper
    for content_source in [
        contents.get("singleColumnBrowseResultsRenderer", {})
        .get("tabs", [{}])[0]
        .get("tabRenderer", {})
        .get("content", {}),
        contents,
    ]:
        playlist_shelf = (
            content_source.get("sectionListRenderer", {})
            .get("contents", [{}])[0]
            .get("musicPlaylistShelfRenderer", {})
        )
        if playlist_shelf:
            for item in playlist_shelf.get("contents", []):
                song = _parse_song_item(item)
                if song:
                    songs.append(song)
            return songs

    for section_list in section_lists:
        for section in section_list:
            # musicShelfRenderer is the main container for song lists
            shelf = section.get("musicShelfRenderer", {})
            if not shelf:
                shelf = section.get("musicCarouselShelfRenderer", {})
            if not shelf:
                continue

            for item in shelf.get("contents", []):
                song = _parse_song_item(item)
                if song:
                    songs.append(song)

    return songs


def _parse_song_item(item: dict) -> dict | None:
    """Parse a single YT Music response item into structured song data."""
    # musicResponsiveListItemRenderer is the standard format
    renderer = item.get("musicResponsiveListItemRenderer", {})
    if not renderer:
        return None

    flex_columns = renderer.get("flexColumns", [])
    fixed_columns = renderer.get("fixedColumns", [])
    video_id = _extract_video_id(renderer)

    title = ""
    artist = ""
    album = ""
    duration = ""
    thumbnails = []

    # Extract from flex columns (title, artist, album)
    for i, col in enumerate(flex_columns):
        runs = (
            col.get("musicResponsiveListItemFlexColumnRenderer", {}).get("text", {}).get("runs", [])
        )
        text = "".join(run.get("text", "") for run in runs)

        if i == 0:
            title = text
            # Get thumbnails from first column
            thumbnail = (
                col.get("musicResponsiveListItemFlexColumnRenderer", {})
                .get("text", {})
                .get("runs", [{}])[0]
                .get("navigationEndpoint", {})
                .get("watchEndpoint", {})
            )
        elif i == 1:
            artist = text
        elif i == 2:
            album = text

    # Extract duration from fixed columns
    for col in fixed_columns:
        runs = (
            col.get("musicResponsiveListItemFixedColumnRenderer", {})
            .get("text", {})
            .get("runs", [])
        )
        text = "".join(run.get("text", "") for run in runs)
        if text and not duration:
            duration = text

    # Extract thumbnails
    thumbnail_renderer = renderer.get("thumbnail", {}).get("musicThumbnailRenderer", {})
    thumbnails = [
        t.get("url", "") for t in thumbnail_renderer.get("thumbnail", {}).get("thumbnails", [])
    ]

    return {
        "title": title.strip() if title else "",
        "artist": artist.strip() if artist else "",
        "album": album.strip() if album else "",
        "video_id": video_id or "",
        "duration": duration.strip() if duration else "",
        "thumbnails": thumbnails,
    }


def _extract_video_id(renderer: dict) -> str | None:
    """Extract video ID from a musicResponsiveListItemRenderer."""
    # Try playbackEndpoint in the playNavigationEndpoint
    play_nav = renderer.get("playNavigationEndpoint", {}) or {}
    if play_nav:
        vid = play_nav.get("watchEndpoint", {}).get("videoId") or play_nav.get(
            "watchPlaylistEndpoint", {}
        ).get("videoId")
        if vid:
            return vid

    # Try navigation endpoint in the overlay
    overlay = renderer.get("overlay", {})
    music_item = overlay.get("musicItemThumbnailOverlayRenderer", {})
    content = music_item.get("content", {})
    music_play_button = content.get("musicPlayButtonRenderer", {})
    play_nav = music_play_button.get("playNavigationEndpoint", {})
    vid = play_nav.get("watchEndpoint", {}).get("videoId")
    if vid:
        return vid

    # Try the first flex column's navigation
    flex = renderer.get("flexColumns", [{}])[0]
    flex_renderer = flex.get("musicResponsiveListItemFlexColumnRenderer", {})
    runs = flex_renderer.get("text", {}).get("runs", [])
    for run in runs:
        nav = run.get("navigationEndpoint", {})
        vid = nav.get("watchEndpoint", {}).get("videoId")
        if vid:
            return vid

    return None


def _format_summary(songs: list[dict], elapsed: float) -> str:
    """Format a summary of fetched songs."""
    total = len(songs)
    with_title = sum(1 for s in songs if s["title"])
    with_artist = sum(1 for s in songs if s["artist"])
    with_album = sum(1 for s in songs if s["album"])
    with_video_id = sum(1 for s in songs if s["video_id"])

    lines = [
        f"\n{'=' * 60}",
        f"YouTube Music Inner API - Test Results",
        f"{'=' * 60}",
        f"Total songs fetched:     {total}",
        f"With title:              {with_title} ({with_title / total * 100:.1f}% )"
        if total
        else "",
        f"With artist:             {with_artist} ({with_artist / total * 100:.1f}% )"
        if total
        else "",
        f"With album:              {with_album} ({with_album / total * 100:.1f}% )"
        if total
        else "",
        f"With video_id:           {with_video_id} ({with_video_id / total * 100:.1f}% )"
        if total
        else "",
        f"Time taken:              {elapsed:.2f}s",
        f"{'=' * 60}",
    ]
    return "\n".join(str(l) for l in lines if l)


def _print_sample(songs: list[dict], n: int = 10) -> None:
    """Print first N songs as a sample."""
    print(f"\nSample of first {min(n, len(songs))} songs:")
    print("-" * 60)
    for i, song in enumerate(songs[:n], 1):
        print(f"  {i:2}. {song['artist'] or '?'} - {song['title'] or '?'}")
        if song["album"]:
            print(f"      Album: {song['album']}")
        if song["video_id"]:
            print(f"      YouTube: youtu.be/{song['video_id']}")
        print()


# ── Auth ────────────────────────────────────────────────────────────────────

AUTH_MODE: str = "oauth"  # "oauth" or "sapisid"


async def get_token_from_otix_db(user_id: str) -> str | None:
    """Fetch a user's Google OAuth token from Otix DB.

    Uses same flow as get_user_google_access_token.
    Requires DATABASE_URL env var and running PostgreSQL.
    """
    try:
        sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
        os.environ.setdefault("OTIX_SETTINGS_MODULE", "otix.infrastructure.config")
        from otix.infrastructure.database import async_session
        from otix.domain.user import User
        from otix.services.google_auth_service import (
            get_user_google_access_token,
        )
    except ImportError as e:
        print(f"Cannot load Otix modules: {e}")
        print("Try: --sapisidhash <hash> instead")
        return None

    try:
        async with async_session() as session:
            user = await session.get(User, user_id)
            if not user:
                print(f"No user found with id={user_id}")
                return None
            token = await get_user_google_access_token(user, session=session)
            if token:
                print(f"Got OAuth token via Otix DB (user={user_id})")
            else:
                print(f"No valid Google token for user={user_id}")
            return token
    except Exception as e:
        print(f"DB error: {e}")
        return None


async def get_token_from_cli(user_id: str | None = None) -> str | None:
    """CLI prompt for browser-copied token."""
    print("\nNeed auth token for YouTube Music API.")
    print("\nOption 1 - SAPISIDHASH (from browser DevTools):")
    print("  1. Go to https://music.youtube.com")
    print("  2. Open DevTools -> Network tab")
    print("  3. Filter 'browse' - click any request")
    print("  4. Find Request Headers -> Authorization: SAPISIDHASH <hash>")
    print("  5. Copy full value: 'SAPISIDHASH <hash>'")
    print("\nOption 2 - OAuth Bearer token (ya29...):")
    print("  1. Same DevTools -> look for Bearer token")
    if user_id:
        if input(f"\nTry Otix DB for user {user_id}? [Y/n]: ").lower() in ("", "y", "yes"):
            token = await get_token_from_otix_db(user_id)
            if token:
                return token
            print("Falling back to manual...\n")

    return input("\nPaste auth value (SAPISIDHASH ... or ya29...): ").strip() or None


def _make_auth_headers(auth_value: str, cookies: str | None = None) -> dict:
    """Build headers for YT Music API based on auth type."""
    headers = {
        "Content-Type": "application/json",
        "Origin": "https://music.youtube.com",
        "X-Goog-AuthUser": "0",
    }

    auth_value = auth_value.strip()
    if auth_value.startswith("SAPISIDHASH"):
        headers["Authorization"] = auth_value
        headers["X-Origin"] = "https://music.youtube.com"
    elif auth_value.startswith("ya29") or auth_value.startswith("Bearer "):
        if auth_value.startswith("Bearer "):
            auth_value = auth_value[7:]
        headers["Authorization"] = f"Bearer {auth_value}"
    else:
        headers["Authorization"] = f"Bearer {auth_value}"

    if cookies:
        headers["Cookie"] = cookies

    return headers


# ── API calls ───────────────────────────────────────────────────────────────


async def fetch_browse(
    client: httpx.AsyncClient,
    browse_id: str,
    headers: dict,
    params: dict | None = None,
) -> dict | None:
    """Call YT Music browse endpoint."""
    payload = {
        **_build_context(),
        "browseId": browse_id,
    }
    if params:
        payload.update(params)

    url = f"{YT_MUSIC_BASE}/browse?key={YT_MUSIC_KEY}&alt=json"

    try:
        resp = await client.post(url, json=payload, headers=headers, timeout=30)
        if resp.status_code == 401:
            print(f"  Auth error (401) for {browse_id} - auth value invalid or expired")
            return None
        if resp.status_code == 403:
            print(f"  Forbidden (403) for {browse_id} -insufficient auth")
            return None
        if resp.status_code == 404:
            print(f"  Not found (404) for {browse_id} -browse ID not valid for this account")
            return None
        resp.raise_for_status()
        return resp.json()
    except httpx.TimeoutException:
        print(f"  Timeout for {browse_id}")
        return None
    except Exception as e:
        print(f"  Error for {browse_id}: {e}")
        return None


async def test_browse_endpoint(
    client: httpx.AsyncClient, headers: dict, label: str, browse_id: str
) -> list[dict]:
    """Test a specific YT Music browse endpoint and return extracted songs."""
    print(f"\n  [TEST] Testing '{label}' ({browse_id})...")
    data = await fetch_browse(client, browse_id, headers)
    if not data:
        return []

    songs = _extract_songs(data)
    print(f"    -> {len(songs)} songs extracted")
    if songs:
        print(f"    -> Sample: {songs[0]['artist']} -{songs[0]['title']}")
    return songs


async def test_get_liked_playlist(client: httpx.AsyncClient, headers: dict) -> list[dict]:
    """Try fetching Liked Songs via playlist endpoint.

    In YT Music, liked songs actually form a playlist.
    The special playlist ID for liked songs might be accessible.
    """
    print("\n  [TEST] Testing Liked Songs via playlist endpoint...")

    # Try the music playlist endpoint - LM (Liked Music) playlist
    # YouTube stores liked songs as playlist ID "LM" (Liked Music)
    payload = {
        **_build_context(),
        "playlistId": "LM",
    }

    try:
        url = f"{YT_MUSIC_BASE}/playlist?key={YT_MUSIC_KEY}&alt=json"
        resp = await client.post(url, json=payload, headers=headers, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            songs = _extract_songs_from_playlist(data)
            print(f"    -> {len(songs)} songs from LM playlist")
            return songs
        else:
            print(f"    -> LM playlist returned {resp.status_code}")
    except Exception as e:
        print(f"    -> LM playlist error: {e}")

    return []


def _extract_songs_from_playlist(data: dict) -> list[dict]:
    """Extract songs from a playlist response."""
    songs: list[dict] = []

    # Navigate to playlist contents
    contents = data.get("contents", {})
    single = contents.get("singleColumnBrowseResultsRenderer", {}) or contents.get(
        "singleColumnMusicWatchNextResultsRenderer", {}
    )
    tabs = single.get("tabs", [])
    if not tabs:
        # Try playlistRenderer directly
        playlist = (
            contents.get("singleColumnBrowseResultsRenderer", {})
            .get("tabs", [{}])[0]
            .get("tabRenderer", {})
            .get("content", {})
            .get("sectionListRenderer", {})
            .get("contents", [{}])[0]
            .get("musicPlaylistShelfRenderer", {})
        )
        if not playlist:
            # Try other structures
            tab = single.get("tab", {})
            if tab:
                content = tab.get("content", {})
            sections = (
                content.get("sectionListRenderer", {}).get("contents", [])
                if "content" in dir()
                else []
            )
            for section in sections:
                shelf = section.get("musicPlaylistShelfRenderer", {})
                if shelf:
                    for item in shelf.get("contents", []):
                        song = _parse_song_item(item)
                        if song:
                            songs.append(song)
                    return songs

        for item in playlist.get("contents", []):
            song = _parse_song_item(item)
            if song:
                songs.append(song)
        return songs

    for tab in tabs:
        tab_content = tab.get("tabRenderer", {}).get("content", {})
        sections = tab_content.get("sectionListRenderer", {}).get("contents", [])
        for section in sections:
            shelf = section.get("musicPlaylistShelfRenderer", {}) or section.get(
                "musicShelfRenderer", {}
            )
            if shelf:
                for item in shelf.get("contents", []):
                    song = _parse_song_item(item)
                    if song:
                        songs.append(song)

    return songs


async def test_search(client: httpx.AsyncClient, headers: dict, query: str) -> list[dict]:
    """Test YT Music search to verify structured metadata in results."""
    print(f"\n  [TEST] Testing search ('{query}')...")

    payload = {
        **_build_context(),
        "query": query,
    }

    try:
        url = f"{YT_MUSIC_BASE}/search?key={YT_MUSIC_KEY}&alt=json"
        resp = await client.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        songs = _extract_songs(data)
        print(f"    -> {len(songs)} results with structured metadata")
        if songs:
            s = songs[0]
            print(f"    -> First: {s['artist']} - {s['title']} [{s['album']}]")
        else:
            # Debug: dump response structure
            contents = data.get("contents", {})
            top_keys = list(contents.keys()) if contents else []
            print(f"    -> Response top keys: {top_keys}")
            for key in top_keys:
                section = contents.get(key, {})
                sub_keys = list(section.keys()) if section else []
                print(f"    -> {key} keys: {sub_keys}")
                if isinstance(section, dict):
                    inner = section.get("contents", section.get("tabs", []))
                    if isinstance(inner, list):
                        print(f"    -> {key}.contents count: {len(inner)}")
                        if inner:
                            print(
                                f"    -> First inner type keys: {list(inner[0].keys()) if isinstance(inner[0], dict) else type(inner[0]).__name__}"
                            )
        return songs
    except Exception as e:
        import traceback

        print(f"    -> Search error: {e}")
        traceback.print_exc()
        return []


# ── Matching ────────────────────────────────────────────────────────────────


def analyze_match_potential(songs: list[dict]) -> dict:
    """Analyze how well we could match these songs to Otix albums.

    Checks field completeness and estimates match difficulty.
    """
    total = len(songs)
    if not total:
        return {"total": 0}

    # Rich metadata = has both artist AND title (minimum for matching)
    has_artist_title = sum(1 for s in songs if s["artist"] and s["title"])

    # Has album name too (easier matching via album+track)
    has_album = sum(1 for s in songs if s["album"])

    # Has video_id (can cross-reference with existing YouTube sync)
    has_video_id = sum(1 for s in songs if s["video_id"])

    # Estimate: songs that would be easy to match
    easy_match = sum(1 for s in songs if s["artist"] and s["title"] and s["album"])

    # Classification
    classifications = {"song+artist+album": 0, "song+artist_only": 0, "minimal": 0}
    for s in songs:
        if s["artist"] and s["title"] and s["album"]:
            classifications["song+artist+album"] += 1
        elif s["artist"] and s["title"]:
            classifications["song+artist_only"] += 1
        else:
            classifications["minimal"] += 1

    return {
        "total": total,
        "with_artist_and_title": has_artist_title,
        "with_artist_title_and_album": has_album,
        "with_video_id": has_video_id,
        "easy_match": easy_match,
        "classifications": classifications,
        "pct_artist_title": round(has_artist_title / total * 100, 1),
        "pct_album": round(has_album / total * 100, 1),
    }


# ── Main ────────────────────────────────────────────────────────────────────


async def main():
    parser = argparse.ArgumentParser(description="Test YouTube Music inner API viability")
    parser.add_argument("--user-id", help="Otix user ID (use DB token)")
    parser.add_argument("--token", help="Raw Google OAuth token (ya29...)")
    parser.add_argument("--sapisidhash", help="SAPISIDHASH auth value (from DevTools headers)")
    parser.add_argument("--cookies", help="Cookie string or path to cookies.txt")
    parser.add_argument("--search", help="Test search endpoint with this query")
    parser.add_argument("--sample", type=int, default=10, help="Number of sample songs to show")
    args = parser.parse_args()

    # ── Get auth value ──────────────────────────────────────────────────────
    auth_value = args.sapisidhash or args.token
    cookies = args.cookies

    if not auth_value and args.user_id:
        auth_value = await get_token_from_otix_db(args.user_id)
    if not auth_value:
        auth_value = await get_token_from_cli(args.user_id)
    if not auth_value:
        print("No auth value available. Cannot proceed.")
        sys.exit(1)

    # Read cookies from file if path provided
    if cookies and Path(cookies).exists():
        cookies = Path(cookies).read_text().strip()

    # Build auth headers
    headers = _make_auth_headers(auth_value, cookies)

    # Sanitize for display
    auth_preview = auth_value[:20] + "..." if len(auth_value) > 25 else auth_value
    is_sapisid = auth_value.startswith("SAPISIDHASH")
    print(f"\nUsing auth: {'SAPISIDHASH' if is_sapisid else 'OAuth Bearer'} {auth_preview}")
    print(f"Cookies: {'Yes' if cookies else 'No'}")

    # ── Test API ────────────────────────────────────────────────────────────
    async with httpx.AsyncClient() as client:
        # Test search first -quick auth validity check
        if args.search:
            await test_search(client, headers, args.search)
            return

        all_songs: list[dict] = []
        start = time.time()

        # 1. Try Liked Videos directly (best case)
        print("\n-- Testing Browse Endpoints --")
        songs = await test_browse_endpoint(
            client, headers, "Liked Videos", BROWSE_IDS["liked_videos"]
        )
        all_songs.extend(songs)

        # 2. Try LM playlist
        if not all_songs:
            songs = await test_get_liked_playlist(client, headers)
            all_songs.extend(songs)

        # 3. Try Liked Playlists
        if not all_songs:
            songs = await test_browse_endpoint(
                client, headers, "Liked Playlists", BROWSE_IDS["liked_playlists"]
            )
            all_songs.extend(songs)

        # 4. Try Library Landing
        if not all_songs:
            songs = await test_browse_endpoint(client, headers, "Library", BROWSE_IDS["library"])
            all_songs.extend(songs)

        # 5. Try home page fallback
        if not all_songs:
            songs = await test_browse_endpoint(client, headers, "Home", BROWSE_IDS["home"])
            all_songs.extend(songs)

        elapsed = time.time() - start

        # ── Results ─────────────────────────────────────────────────────────
        if not all_songs:
            print("\n  [WARN] No songs fetched from any endpoint.")
            print("  Possible issues:")
            print("  - Token lacks youtube scope (need 'https://www.googleapis.com/auth/youtube')")
            print("  - YT Music browse requires additional headers (X-Goog-AuthUser, cookies)")
            print("  - Account has no liked songs in YouTube Music")
            print("\n  Recommendation: Extract a browser cookie headers.json via ytmusicapi")
            print("  and pass with --headers, or try the Datamuse/ytmusic approach.\n")
            return

        # Deduplicate by video_id
        seen = set()
        unique_songs = []
        for s in all_songs:
            vid = s.get("video_id") or s.get("title", "") + s.get("artist", "")
            if vid not in seen:
                seen.add(vid)
                unique_songs.append(s)

        # Print summary
        print(f"\n{'=' * 60}")
        print(f"  YT MUSIC INNER API -VIABILITY TEST")
        print(f"{'=' * 60}")
        print(f"  Endpoints tried:    {', '.join(BROWSE_IDS.keys())}")
        print(f"  Total raw items:    {len(all_songs)}")
        print(f"  Unique items:       {len(unique_songs)}")
        print(f"  Time:               {elapsed:.2f}s")
        print(f"\n  -- Metadata Completeness --")

        analysis = analyze_match_potential(unique_songs)
        print(
            f"  Artist + Title:     {analysis['with_artist_and_title']}/{analysis['total']} ({analysis['pct_artist_title']}%)"
        )
        print(
            f"  + Album:            {analysis['with_artist_title_and_album']}/{analysis['total']} ({analysis['pct_album']}%)"
        )
        print(f"  + Video ID:         {analysis['with_video_id']}/{analysis['total']}")
        print(f"\n  -- Match Difficulty --")
        print(f"  Easy (artist+title+album):  {analysis['classifications']['song+artist+album']}")
        print(f"  Medium (artist+title only): {analysis['classifications']['song+artist_only']}")
        print(f"  Minimal:                    {analysis['classifications']['minimal']}")

        print(f"\n  -- Verdict --")
        if analysis["pct_artist_title"] >= 90:
            print(f"  [EXCELLENT] {analysis['pct_artist_title']}% have artist+title.")
            print(f"     Far better than title-parsing approach.")
        elif analysis["pct_artist_title"] >= 70:
            print(f"  [GOOD] {analysis['pct_artist_title']}% have artist+title.")
            print(f"     Better than title-parsing, but some still missing.")
        elif analysis["pct_artist_title"] >= 40:
            print(f"  [MIXED] {analysis['pct_artist_title']}% have artist+title.")
            print(f"     May need fallback to title parsing.")
        else:
            print(f"  [POOR] Only {analysis['pct_artist_title']}% have structured metadata.")
            print(f"     Title parsing may still be needed as fallback.")

        print(f"\n  -- Sample Songs --")
        _print_sample(unique_songs, args.sample)

        # Print some raw data for debugging
        print(f"\n  -- Raw Metadata Sample (first song) --")
        if unique_songs:
            print(json.dumps(unique_songs[0], indent=2))

        # Export for further analysis
        out_path = Path(__file__).parent / "yt_music_test_results.json"
        with open(out_path, "w") as f:
            json.dump(
                {
                    "summary": {
                        "total": analysis["total"],
                        "with_artist_title": analysis["with_artist_and_title"],
                        "with_album": analysis["with_artist_title_and_album"],
                        "with_video_id": analysis["with_video_id"],
                        "elapsed_seconds": elapsed,
                    },
                    "songs": unique_songs,
                },
                f,
                indent=2,
            )
        print(f"\n  Full results exported to: {out_path}")
        print()


if __name__ == "__main__":
    asyncio.run(main())

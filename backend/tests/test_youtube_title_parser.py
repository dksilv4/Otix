"""Test YouTube music video title parser across 30+ formats."""

from __future__ import annotations

from otix.lib.youtube_title_parser import parse_music_title

# ── Basic formats ──

def test_standard_artist_dash_song():
    r = parse_music_title("Daft Punk - Get Lucky")
    assert r.artist == "Daft Punk"
    assert r.song_title == "Get Lucky"
    assert r.confidence >= 0.9


def test_song_dash_artist_reversed():
    r = parse_music_title("Get Lucky - Daft Punk")
    assert r.artist == "Get Lucky"  # ambiguous orientation defaults to left=artist
    assert r.song_title == "Daft Punk"


def test_unicode_en_dash():
    r = parse_music_title("Daft Punk – Get Lucky")
    assert r.artist == "Daft Punk"
    assert r.song_title == "Get Lucky"


def test_unicode_em_dash():
    r = parse_music_title("Daft Punk — Get Lucky")
    assert r.artist == "Daft Punk"
    assert r.song_title == "Get Lucky"


def test_arrow_separator():
    r = parse_music_title("Artist → Song Title")
    assert r.artist == "Artist"
    assert r.song_title == "Song Title"


def test_pipe_separator():
    r = parse_music_title("Artist | Song Title")
    assert r.artist == "Artist"
    assert r.song_title == "Song Title"


# ── Bracket markers ──

def test_official_music_video():
    r = parse_music_title("Artist - Song Title (Official Music Video)")
    assert r.song_title == "Song Title"


def test_official_video():
    r = parse_music_title("Artist - Song Title (Official Video)")
    assert r.song_title == "Song Title"


def test_official_audio():
    r = parse_music_title("Artist - Song Title (Official Audio)")
    assert r.song_title == "Song Title"


def test_official_lyric_video():
    r = parse_music_title("Artist - Song Title (Official Lyric Video)")
    assert r.song_title == "Song Title"


def test_lyric_video():
    r = parse_music_title("Artist - Song Title (Lyric Video)")
    assert r.song_title == "Song Title"


def test_lyrics():
    r = parse_music_title("Artist - Song Title (Lyrics)")
    assert r.song_title == "Song Title"


def test_visualizer():
    r = parse_music_title("Artist - Song Title (Visualizer)")
    assert r.song_title == "Song Title"


def test_music_video():
    r = parse_music_title("Artist - Song Title (Music Video)")
    assert r.song_title == "Song Title"


def test_audio():
    r = parse_music_title("Artist - Song Title (Audio)")
    assert r.song_title == "Song Title"


def test_hd():
    r = parse_music_title("Artist - Song Title (HD)")
    assert r.song_title == "Song Title"


def test_4k():
    r = parse_music_title("Artist - Song Title (4K)")
    assert r.song_title == "Song Title"


# ── Featuring artists ──

def test_feat_in_brackets():
    r = parse_music_title("Artist - Song Title (feat. X)")
    assert r.song_title == "Song Title"
    assert "X" in r.featuring_artists


def test_ft_in_brackets():
    r = parse_music_title("Artist - Song Title (ft. Y)")
    assert r.song_title == "Song Title"
    assert "Y" in r.featuring_artists


def test_multiple_feats():
    r = parse_music_title("Artist - Song Title (feat. X, Y)")
    assert len(r.featuring_artists) >= 2


def test_feat_in_artist_side():
    r = parse_music_title("Artist feat. X - Song Title")
    assert r.artist == "Artist"
    assert "X" in r.featuring_artists
    assert r.song_title == "Song Title"


def test_ft_in_artist_side():
    r = parse_music_title("Artist ft. Y - Song Title")
    assert r.artist == "Artist"
    assert "Y" in r.featuring_artists


def test_multi_artist_comma():
    r = parse_music_title("Artist A, Artist B - Song Title")
    assert r.artist == "Artist A"


def test_multi_artist_ampersand():
    r = parse_music_title("Artist A & Artist B - Song Title")
    assert r.artist == "Artist A"


# ── Remix detection ──

def test_remix_with_remixer():
    r = parse_music_title("Artist - Song Title (Remixer Remix)")
    assert r.is_remix is True
    assert r.remixer == "Remixer"


def test_remix_generic():
    r = parse_music_title("Artist - Song Title (Remix)")
    assert r.is_remix is True
    assert r.remixer is None


def test_extended_mix():
    r = parse_music_title("Artist - Song Title (Extended Mix)")
    assert r.song_title == "Song Title"


def test_radio_edit():
    r = parse_music_title("Artist - Song Title (Radio Edit)")
    assert r.song_title == "Song Title"


def test_club_mix():
    r = parse_music_title("Artist - Song Title (Club Mix)")
    assert r.song_title == "Song Title"


# ── Live detection ──

def test_live():
    r = parse_music_title("Artist - Song Title (Live)")
    assert r.is_live is True


def test_live_performance():
    r = parse_music_title("Artist - Song Title (Live Performance)")
    assert r.is_live is True


# ── Topic channel ──

def test_topic_channel():
    r = parse_music_title("Song Title", channel_title="Artist - Topic")
    assert r.artist == "Artist"
    assert r.song_title == "Song Title"
    assert r.confidence == 0.95


def test_topic_channel_empty_title():
    r = parse_music_title("", channel_title="Artist - Topic")
    assert r.confidence == 0.0


# ── Square brackets ──

def test_square_brackets():
    r = parse_music_title("Artist - Song Title [Official Video]")
    assert r.song_title == "Song Title"


def test_feat_square_brackets():
    r = parse_music_title("Artist - Song Title [feat. X]")
    assert r.song_title == "Song Title"
    assert "X" in r.featuring_artists


# ── Edge cases ──

def test_no_separator():
    r = parse_music_title("JustASongTitle")
    assert r.song_title == "JustASongTitle"
    assert r.confidence == 0.0


def test_no_separator_with_channel():
    r = parse_music_title("Song Title", channel_title="Some Channel")
    assert r.artist == "Some Channel"
    assert r.song_title == "Song Title"
    assert r.confidence == 0.3


def test_empty_title():
    r = parse_music_title("")
    assert r.confidence == 0.0


def test_whitespace_only():
    r = parse_music_title("   ")
    assert r.confidence == 0.0


def test_multiple_brackets():
    r = parse_music_title("Artist - Song (Official Video) (Lyrics)")
    assert r.song_title == "Song"


def test_prod_marker():
    r = parse_music_title("Artist - Song Title (prod. Producer)")
    assert r.song_title == "Song Title"


def test_produced_by_marker():
    r = parse_music_title("Artist - Song Title (produced by Producer)")
    assert r.song_title == "Song Title"


def test_with_marker():
    r = parse_music_title("Artist - Song Title (with Guest)")
    assert r.song_title == "Song Title"


def test_explicit():
    r = parse_music_title("Artist - Song Title (Explicit)")
    assert r.song_title == "Song Title"


def test_clean():
    r = parse_music_title("Artist - Song Title (Clean)")
    assert r.song_title == "Song Title"


def test_slowed():
    r = parse_music_title("Artist - Song Title (Slowed)")
    assert r.song_title == "Song Title"


def test_sped_up():
    r = parse_music_title("Artist - Song Title (Sped Up)")
    assert r.song_title == "Song Title"


def test_nightcore():
    r = parse_music_title("Artist - Song Title (Nightcore)")
    assert r.song_title == "Song Title"


def test_performance_video():
    r = parse_music_title("Artist - Song Title (Performance Video)")
    assert r.song_title == "Song Title"


# ── Complex multi-tag ──

def test_complex_remix_feat_video():
    r = parse_music_title("Artist - Song Title (feat. Guest) (Remixer Remix) (Official Video)")
    assert r.song_title == "Song Title"
    assert r.is_remix is True
    assert r.remixer == "Remixer"
    assert "Guest" in r.featuring_artists


def test_complex_live_feat():
    r = parse_music_title("Artist feat. Guest - Song Title (Live) (Official Music Video)")
    assert r.artist == "Artist"
    assert "Guest" in r.featuring_artists
    assert r.song_title == "Song Title"
    assert r.is_live is True


def test_japanese_artist_title():
    r = parse_music_title("YOASOBI - 夜に駆ける (Official Music Video)")
    assert r.artist == "YOASOBI"
    assert r.song_title == "夜に駆ける"


def test_korean_artist_title():
    r = parse_music_title("BTS - Dynamite (Official MV)")
    assert r.artist == "BTS"
    assert r.song_title == "Dynamite"


# ── Confidence scoring ──

def test_various_artists_low_confidence():
    r = parse_music_title("Various Artists - Song Title")
    assert r.confidence == 0.2


def test_unknown_artist_low_confidence():
    r = parse_music_title("Unknown - Song Title")
    assert r.confidence == 0.2


def test_long_artist_penalty():
    long_name = "A" * 81
    r = parse_music_title(f"{long_name} - Song")
    assert r.artist == long_name
    assert r.confidence <= 0.7

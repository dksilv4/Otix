"""Unit tests for the YouTube music-video title parser (``parse_music_title``).

Covers the three layers (normalize / extract / validate) and the Topic-channel
shortcut where the artist comes from the channel title and the song is the bare
video title. Focused on the shapes real liked-music titles take; quirks are only
asserted where they are stable guarantees of the parser.
"""

from django.test import SimpleTestCase

from apps.integrations.services.youtube_title_parser import parse_music_title


class TopicChannelTests(SimpleTestCase):
    def test_topic_channel_artist_comes_from_channel(self):
        parsed = parse_music_title("Blinding Lights", "The Weeknd - Topic")
        self.assertEqual(parsed.artist, "The Weeknd")
        self.assertEqual(parsed.song_title, "Blinding Lights")
        self.assertEqual(parsed.confidence, 0.95)

    def test_topic_channel_strips_bracket_markers_from_song(self):
        parsed = parse_music_title(
            "Blinding Lights (Official Music Video)", "The Weeknd - Topic"
        )
        self.assertEqual(parsed.artist, "The Weeknd")
        self.assertEqual(parsed.song_title, "Blinding Lights")

    def test_topic_channel_with_empty_song_has_zero_confidence(self):
        parsed = parse_music_title("   ", "The Weeknd - Topic")
        self.assertEqual(parsed.confidence, 0.0)


class ArtistSongSplitTests(SimpleTestCase):
    def test_artist_separator_song(self):
        parsed = parse_music_title("The Weeknd - Blinding Lights")
        self.assertEqual(parsed.artist, "The Weeknd")
        self.assertEqual(parsed.song_title, "Blinding Lights")
        self.assertEqual(parsed.confidence, 0.9)

    def test_parenthesized_marker_is_stripped_from_song(self):
        parsed = parse_music_title(
            "Kendrick Lamar - HUMBLE. (Official Video)"
        )
        self.assertEqual(parsed.artist, "Kendrick Lamar")
        self.assertEqual(parsed.song_title, "HUMBLE.")

    def test_unicode_dash_separator_is_normalized(self):
        parsed = parse_music_title("Daft Punk — Get Lucky")
        self.assertEqual(parsed.artist, "Daft Punk")
        self.assertEqual(parsed.song_title, "Get Lucky")

    def test_featuring_artist_from_bracket(self):
        parsed = parse_music_title(
            "Post Malone - Sunflower (feat. Swae Lee)"
        )
        self.assertEqual(parsed.artist, "Post Malone")
        self.assertEqual(parsed.song_title, "Sunflower")
        self.assertEqual(parsed.featuring_artists, ["Swae Lee"])

    def test_remix_detected_with_remixer(self):
        parsed = parse_music_title("Kaytranada - Track X (Duck Sauce Remix)")
        self.assertTrue(parsed.is_remix)
        self.assertEqual(parsed.remixer, "Duck Sauce")

    def test_bare_remix_flag_without_remixer(self):
        parsed = parse_music_title("Daft Punk - Something (Remix)")
        self.assertTrue(parsed.is_remix)
        self.assertIsNone(parsed.remixer)

    def test_live_detected(self):
        parsed = parse_music_title("AC/DC - Thunderstruck (Live at River Plate)")
        self.assertTrue(parsed.is_live)


class FallbackTests(SimpleTestCase):
    def test_no_separator_uses_channel_as_artist(self):
        parsed = parse_music_title("Lofi Beats", "Chill Vibes")
        self.assertEqual(parsed.artist, "Chill Vibes")
        self.assertEqual(parsed.song_title, "Lofi Beats")
        self.assertEqual(parsed.confidence, 0.3)

    def test_no_separator_and_no_channel_scores_zero(self):
        parsed = parse_music_title("Some Random Upload")
        self.assertEqual(parsed.song_title, "Some Random Upload")
        self.assertEqual(parsed.confidence, 0.0)

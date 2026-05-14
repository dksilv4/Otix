"""Spotify enrichment: audio features, popularity, cross-reference linking."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album, ExternalID, Track
from otix.domain.asset import ExternalRating
from otix.lib.types import JSONValue
from otix.providers.spotify.client import SpotifyProvider
from otix.providers.spotify.transformer import (
    extract_audio_features,
    extract_popularity,
    extract_spotify_url,
    extract_image,
    extract_artist_spotify_ids,
)


class SpotifyHydrator:
    def __init__(self, provider: SpotifyProvider, session: AsyncSession):
        self._provider = provider
        self._session = session

    async def hydrate(self, album: Album) -> None:
        """Enrich an Album from Spotify: audio features, popularity, images, external ID."""
        spotify_id = album.spotify_id
        if not spotify_id:
            return

        try:
            sp_album = await self._provider.get_album(spotify_id)
        except Exception:
            return

        # Top-level album enrichment
        album.spotify_url = extract_spotify_url(sp_album) or album.spotify_url
        album.spotify_popularity = extract_popularity(sp_album)
        if not album.preview_url:
            album.preview_url = _pick_preview_from_album(sp_album)

        # Album-level audio features
        album_features = await self._fetch_album_features(sp_album)
        if album_features:
            album.audio_features = album_features

        # Album art
        cover_url = extract_image(sp_album)
        if cover_url and not album.media_item.poster_url:
            album.media_item.poster_url = cover_url

        if cover_url:
            from otix.domain.asset import MediaAsset
            from sqlalchemy.exc import IntegrityError

            exists = await self._session.scalar(
                select(MediaAsset).where(
                    MediaAsset.media_item_id == album.media_item_id,
                    MediaAsset.url == cover_url,
                )
            )
            if not exists:
                try:
                    async with self._session.begin_nested():
                        self._session.add(MediaAsset(
                            media_item_id=album.media_item_id,
                            asset_type="poster",
                            url=cover_url,
                            width=640,
                            height=640,
                            provider="spotify",
                        ))
                        await self._session.flush()
                except IntegrityError:
                    pass

        # Cross-link Spotify artist IDs to Person records
        spotify_artist_ids = extract_artist_spotify_ids(sp_album)
        for said in spotify_artist_ids:
            await self._link_artist_spotify_id(said)

        # Add Spotify ExternalID
        ext_exists = await self._session.scalar(
            select(ExternalID).where(
                ExternalID.media_item_id == album.media_item_id,
                ExternalID.provider == "spotify",
            )
        )
        if not ext_exists:
            self._session.add(ExternalID(
                provider="spotify",
                external_id=spotify_id,
                media_item_id=album.media_item_id,
            ))

        # Store Spotify popularity as external rating
        if album.spotify_popularity:
            await self._upsert_rating(album, "spotify", album.spotify_popularity, 100)

    async def hydrate_tracks(self, album: Album) -> None:
        """Link tracks to Spotify recordings and add per-track audio features."""
        if not album.spotify_id:
            return

        try:
            sp_tracks = []
            offset = 0
            while True:
                page = await self._provider.get_album_tracks(album.spotify_id, offset=offset)
                items = page.get("items", [])
                sp_tracks.extend(items)
                if not page.get("next"):
                    break
                offset += 50
        except Exception:
            return

        spotify_ids = [t.get("id") for t in sp_tracks if t.get("id")]
        features_map: dict[str, dict] = {}
        if spotify_ids:
            try:
                features_list = await self._provider.get_audio_features_batch(spotify_ids)
                features_map = {f["id"]: f for f in features_list if f and f.get("id")}
            except Exception:
                pass

        for idx, sp_t in enumerate(sp_tracks):
            if not sp_t.get("id"):
                continue
            # Match by position (track_number, disc_number)
            tn = sp_t.get("track_number", idx + 1)
            dn = sp_t.get("disc_number", 1)
            track = await self._session.scalar(
                select(Track).where(
                    Track.album_id == album.media_item_id,
                    Track.track_number == tn,
                    Track.disc_number == dn,
                )
            )
            if track is None:
                continue

            track.spotify_id = sp_t.get("id")
            track.preview_url = sp_t.get("preview_url")
            if not track.duration_ms:
                track.duration_ms = sp_t.get("duration_ms")

            feat = features_map.get(track.spotify_id)
            if feat:
                track.audio_features = extract_audio_features(feat)

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _fetch_album_features(self, sp_album: dict) -> dict | None:
        """Aggregate audio features from album tracks as an album-level average."""
        tracks = sp_album.get("tracks", {}).get("items", [])
        if not tracks:
            return None
        track_ids = [t["id"] for t in tracks if t.get("id")]
        if not track_ids:
            return None

        try:
            features_list = await self._provider.get_audio_features_batch(track_ids[:50])
        except Exception:
            return None

        valid = [f for f in features_list if f]
        if not valid:
            return None

        keys = ["tempo", "energy", "danceability", "valence", "acousticness", "instrumentalness", "liveness", "speechiness"]
        avg: dict[str, float] = {}
        for k in keys:
            vals = [f[k] for f in valid if k in f and f[k] is not None]
            if vals:
                avg[k] = sum(vals) / len(vals)
        return avg

    async def _link_artist_spotify_id(self, spotify_artist_id: str) -> None:
        from otix.domain.people import Person

        person = await self._session.scalar(
            select(Person).where(Person.spotify_artist_id == spotify_artist_id)
        )
        if person:
            return

        # Try to find the artist and update their spotify_id
        try:
            sp_artist = await self._provider.get_artist(spotify_artist_id)
        except Exception:
            return

        name = sp_artist.get("name")
        if not name:
            return

        person = await self._session.scalar(
            select(Person).where(Person.name == name)
        )
        if person is not None:
            if not person.spotify_artist_id:
                person.spotify_artist_id = spotify_artist_id
        else:
            person = Person(
                name=name,
                spotify_artist_id=spotify_artist_id,
                spotify_popularity=sp_artist.get("popularity"),
                spotify_follower_count=(sp_artist.get("followers") or {}).get("total"),
                spotify_genres=sp_artist.get("genres"),
                spotify_image_url=extract_image(sp_artist),
            )
            self._session.add(person)
            await self._session.flush()

    async def _upsert_rating(self, album: Album, provider: str, score: float, max_score: int) -> None:
        existing = await self._session.scalar(
            select(ExternalRating).where(
                ExternalRating.media_item_id == album.media_item_id,
                ExternalRating.provider == provider,
            )
        )
        if existing:
            existing.score = score
        else:
            self._session.add(ExternalRating(
                media_item_id=album.media_item_id,
                provider=provider,
                score=score,
                max_score=max_score,
            ))


def _pick_preview_from_album(sp_album: dict) -> str | None:
    tracks = sp_album.get("tracks", {}).get("items", [])
    for t in tracks:
        if t.get("preview_url"):
            return t["preview_url"]
    return None

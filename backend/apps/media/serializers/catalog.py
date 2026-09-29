"""Catalog response serializers.

Mirror the legacy ``MediaItemDetail`` / ``MediaItemSummary`` payloads in
``old-backend/otix/schemas/media.py`` as field-listed serializers. Asset URLs are
resolved once by ``apps.media.services.catalog`` and attached to each model
instance (``poster_url``/``backdrop_url``/...); the nested subtype dicts are
serialized from the OneToOne child rows (``movie``/``show``/``game``/``album``).
Keys the greenfield models do not carry (Steam/Plex/embedding-only fields)
serialize as ``None``/empty rather than being dropped.
"""

from datetime import date

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from apps.media.models import Episode, ExternalID, Game, MediaAsset, MediaItem, Movie, Season, Show


class GenreOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()


class PlatformOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    logo_image_id = serializers.CharField(allow_null=True)


class GameModeOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()


class MediaPlatformOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    platform = PlatformOutSerializer()


class MediaGameModeOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    game_mode = GameModeOutSerializer()


class WatchProviderOutSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    slug = serializers.CharField()
    logo_url = serializers.CharField(allow_null=True)


class MediaWatchProviderOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    watch_provider = WatchProviderOutSerializer()
    country_code = serializers.CharField()
    offering_type = serializers.CharField()
    url = serializers.CharField(allow_null=True)
    display_priority = serializers.IntegerField()


class MediaReleaseOutSerializer(serializers.Serializer):
    country_code = serializers.CharField()
    release_date = serializers.DateField(allow_null=True)
    certification = serializers.CharField(allow_null=True)
    release_type = serializers.IntegerField(allow_null=True)


class MediaVideoOutSerializer(serializers.Serializer):
    video_type = serializers.CharField(allow_null=True)
    url = serializers.CharField()
    provider = serializers.CharField(allow_null=True)
    provider_id = serializers.CharField(allow_null=True)


# Normal slot → the textless slot it fills (mirrors assets_service
# FAMILY_TEXTLESS_TYPE; kept local to avoid a service import in the serializer).
_FAMILY_TEXTLESS_TYPE = {
    "poster": "textless_poster",
    "textless_poster": "textless_poster",
    "backdrop": "textless_backdrop",
    "textless_backdrop": "textless_backdrop",
}


class MediaAssetOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    asset_type = serializers.CharField()
    url = serializers.CharField()
    width = serializers.IntegerField(allow_null=True)
    height = serializers.IntegerField(allow_null=True)
    lang = serializers.CharField(allow_null=True)
    style = serializers.CharField(allow_null=True)
    score = serializers.IntegerField(allow_null=True)
    provider = serializers.CharField(allow_null=True)
    # Admin-pinned context (general/dark/light), mirror state, and which
    # contexts this asset currently resolves for — surfaced to the chooser.
    selected_context = serializers.CharField(allow_null=True)
    local_name = serializers.CharField(allow_null=True)
    keep_local = serializers.BooleanField()
    current_contexts = serializers.SerializerMethodField()
    # True when this image is the family's (theme-agnostic) textless art: its
    # url is the current general winner of the family's textless slot. The slot
    # may be backed by a hidden materialized row sharing this url.
    is_textless = serializers.SerializerMethodField()

    def get_current_contexts(self, obj: MediaAsset) -> list[str]:
        current_ids = self.context.get("current_ids", {})
        return [ctx for ctx, pks in current_ids.items() if obj.pk in pks]

    def get_is_textless(self, obj: MediaAsset) -> bool:
        target = _FAMILY_TEXTLESS_TYPE.get(obj.asset_type)
        if target is None:
            return False
        winner_url = self.context.get("textless_urls", {}).get(target)
        return bool(winner_url) and obj.url == winner_url


class EpisodeOutSerializer(serializers.ModelSerializer):
    class Meta:
        model = Episode
        fields = (
            "id",
            "episode_number",
            "name",
            "overview",
            "runtime",
            "air_date",
            "still_url",
        )
        read_only_fields = fields


class SeasonOutSerializer(serializers.ModelSerializer):
    episode_count = serializers.SerializerMethodField()
    episodes = serializers.SerializerMethodField()

    class Meta:
        model = Season
        fields = (
            "id",
            "season_number",
            "name",
            "overview",
            "poster_url",
            "air_date",
            "episode_count",
            "episodes",
        )
        read_only_fields = fields

    def _episodes(self, obj: Season) -> list[Episode]:
        return sorted(obj.episodes.all(), key=lambda e: e.episode_number or 0)

    def get_episode_count(self, obj: Season) -> int:
        return len(self._episodes(obj))

    def get_episodes(self, obj: Season):
        return EpisodeOutSerializer(self._episodes(obj), many=True).data


class SeasonSummarySerializer(serializers.Serializer):
    """Feed/summary shape for a Season as a discover item (Trending Shows)."""

    id = serializers.IntegerField()
    show_id = serializers.IntegerField()
    show_title = serializers.SerializerMethodField()
    season_number = serializers.IntegerField()
    name = serializers.CharField(allow_null=True)
    overview = serializers.CharField(allow_null=True)
    poster_url = serializers.CharField(allow_null=True)
    air_date = serializers.DateField(allow_null=True)

    def get_show_title(self, obj: Season):
        show = getattr(obj, "show", None)
        media_item = getattr(show, "media_item", None)
        return getattr(media_item, "title", None)


class CollectionMovieOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    poster_url = serializers.CharField(allow_null=True)
    release_date = serializers.DateField(allow_null=True)
    slug = serializers.CharField()
    is_adult = serializers.BooleanField(default=False)


class CollectionOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    overview = serializers.CharField(allow_null=True)
    poster_url = serializers.CharField(allow_null=True)
    backdrop_url = serializers.CharField(allow_null=True)
    movies = serializers.SerializerMethodField()

    def get_movies(self, obj):
        movies = [m for m in obj.movies.all() if m.media_item_id is not None]
        movies.sort(key=lambda m: m.media_item.release_date or date.min)
        out = []
        for movie in movies:
            item = movie.media_item
            poster = getattr(item, "poster_url", None)
            if not poster and hasattr(item, "assets"):
                from apps.media.services.catalog import _pick_asset

                poster = _pick_asset(item, "poster", self.context.get("theme", "general"))
            out.append(
                {
                    "id": item.id,
                    "title": item.title,
                    "poster_url": poster,
                    "release_date": item.release_date,
                    "slug": item.slug,
                    "is_adult": item.is_adult,
                }
            )
        return out


class MovieDetailSerializer(serializers.Serializer):
    runtime = serializers.IntegerField(allow_null=True)
    budget = serializers.IntegerField(allow_null=True)
    revenue = serializers.IntegerField(allow_null=True)
    revenue_rank = serializers.IntegerField(allow_null=True)
    profit_pct = serializers.FloatField(allow_null=True)
    profit_rank = serializers.IntegerField(allow_null=True)
    loss_rank = serializers.IntegerField(allow_null=True)
    tagline = serializers.CharField(allow_null=True)
    is_anime = serializers.BooleanField()


class ShowDetailSerializer(serializers.Serializer):
    status = serializers.CharField(allow_null=True)
    first_air_date = serializers.DateField(allow_null=True)
    last_air_date = serializers.DateField(allow_null=True)
    number_of_seasons = serializers.IntegerField(allow_null=True)
    number_of_episodes = serializers.IntegerField(allow_null=True)
    is_anime = serializers.BooleanField()
    seasons = serializers.SerializerMethodField()

    def get_seasons(self, obj: Show):
        seasons = sorted(obj.seasons.all(), key=lambda s: s.season_number or 0)
        return SeasonOutSerializer(seasons, many=True).data


class GameDetailSerializer(serializers.Serializer):
    release_status = serializers.CharField(allow_null=True)
    website = serializers.CharField(allow_null=True)
    steam_app_id = serializers.IntegerField(allow_null=True)
    store_ids = serializers.DictField(allow_null=True)
    current_players = serializers.IntegerField(allow_null=True)
    price_json = serializers.JSONField(allow_null=True)
    recommendations = serializers.IntegerField(allow_null=True)
    review_summary = serializers.CharField(allow_null=True)
    is_free = serializers.BooleanField()
    has_multiplayer = serializers.BooleanField()
    time_to_beat = serializers.JSONField(allow_null=True)
    game_type = serializers.CharField(allow_null=True)
    parent_game_id = serializers.IntegerField(allow_null=True)
    parent_game_title = serializers.CharField(allow_null=True)
    is_dlc = serializers.BooleanField()
    is_beta = serializers.BooleanField()
    is_demo = serializers.BooleanField()


class MediaCreditPersonOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    photo_url = serializers.CharField(allow_null=True)


class MediaCreditOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    person = MediaCreditPersonOutSerializer(allow_null=True)
    role = serializers.CharField()
    character_name = serializers.CharField(allow_null=True)
    sort_order = serializers.IntegerField()


class CharacterAssetOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    asset_type = serializers.CharField()
    url = serializers.CharField()
    width = serializers.IntegerField(allow_null=True)
    height = serializers.IntegerField(allow_null=True)
    provider = serializers.CharField(allow_null=True)
    caption = serializers.CharField(allow_null=True)
    order = serializers.IntegerField()


class CharacterExternalIDOutSerializer(serializers.Serializer):
    provider = serializers.CharField()
    external_id = serializers.CharField()
    url = serializers.SerializerMethodField()

    def get_url(self, obj) -> str | None:
        import urllib.parse

        provider = getattr(obj, "provider", "")
        ext_id = getattr(obj, "external_id", "")
        if not ext_id:
            return None
        if provider == "wikidata":
            return f"https://www.wikidata.org/wiki/{ext_id}"
        if provider == "fandom":
            if ":" in ext_id:
                comm, title = ext_id.split(":", 1)
                return f"https://{comm}.fandom.com/wiki/{urllib.parse.quote(title)}"
            return f"https://fandom.com/wiki/{urllib.parse.quote(ext_id)}"
        if provider == "wikipedia":
            return f"https://en.wikipedia.org/wiki/{urllib.parse.quote(ext_id)}"
        if provider == "igdb":
            return f"https://www.igdb.com/characters/{urllib.parse.quote(ext_id)}"
        if provider == "btva":
            return f"https://www.behindthevoiceactors.com/characters/{urllib.parse.quote(ext_id)}"
        return None


class CharacterOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField(allow_null=True)
    gender = serializers.CharField(allow_null=True)
    species = serializers.CharField(allow_null=True)
    mug_shot_url = serializers.CharField(allow_null=True)
    assets = serializers.SerializerMethodField()
    external_ids = serializers.SerializerMethodField()

    def get_assets(self, obj):
        if hasattr(obj, "assets"):
            return CharacterAssetOutSerializer(obj.assets.all(), many=True).data
        return []

    def get_external_ids(self, obj):
        if hasattr(obj, "external_ids"):
            return CharacterExternalIDOutSerializer(obj.external_ids.all(), many=True).data
        return []


class MediaCharacterOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    character = CharacterOutSerializer()
    order = serializers.IntegerField()
    actor = serializers.SerializerMethodField()

    def get_actor(self, obj):
        actor_map = self.context.get("actor_map")
        from core.providers.wikidata import normalize_character_name

        norm_name = normalize_character_name(getattr(obj.character, "name", ""))
        if actor_map is not None:
            person = actor_map.get(norm_name)
            return MediaCreditPersonOutSerializer(person).data if person else None

        # Fallback for standalone calls: check prefetched credits on media_item
        media_item = getattr(obj, "media_item", None)
        if media_item and hasattr(media_item, "credits"):
            for c in media_item.credits.all():
                if (
                    c.role == "cast"
                    and c.character_name
                    and normalize_character_name(c.character_name) == norm_name
                    and c.person
                ):
                    return MediaCreditPersonOutSerializer(c.person).data
        return None


class CompanyOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    logo_url = serializers.CharField(allow_null=True)
    origin_country = serializers.CharField(allow_null=True)
    follower_count = serializers.IntegerField()
    is_followed = serializers.BooleanField(allow_null=True)
    avg_rating = serializers.FloatField(allow_null=True)
    user_rating = serializers.IntegerField(allow_null=True)


def company_out(company) -> dict | None:
    """Shape a Company row like the legacy ``CompanyOut`` (defaults when the
    follow/rating aggregates were not computed for a nested embed)."""
    if company is None:
        return None
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "logo_url": company.logo_url,
        "origin_country": company.origin_country,
        "follower_count": getattr(company, "follower_count", 0),
        "is_followed": getattr(company, "is_followed", None),
        "avg_rating": getattr(company, "avg_rating", None),
        "user_rating": getattr(company, "user_rating", None),
    }


class InvolvedCompanyOutSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    company = serializers.SerializerMethodField()
    developer = serializers.BooleanField()
    publisher = serializers.BooleanField()
    porting = serializers.BooleanField()
    supporting = serializers.BooleanField()
    production = serializers.BooleanField()
    distributor = serializers.BooleanField()

    def get_company(self, obj):
        return company_out(obj.company)


def _user_interactions(value) -> dict | None:
    if value is None:
        return None
    return {
        "liked": bool(value.get("liked")),
        "watchlisted": bool(value.get("watchlisted")),
        "watched": bool(value.get("watched")),
        "played": bool(value.get("played")),
        "started": bool(value.get("started")),
        "listened": bool(value.get("listened")),
        "owned": bool(value.get("owned")),
    }


class UserInteractionStateSerializer(serializers.Serializer):
    liked = serializers.BooleanField()
    watchlisted = serializers.BooleanField()
    watched = serializers.BooleanField()
    played = serializers.BooleanField()
    started = serializers.BooleanField()
    listened = serializers.BooleanField()
    owned = serializers.BooleanField()


class MediaItemSummarySerializer(serializers.Serializer):
    """List/similar/recommendation item shape (legacy ``MediaItemSummary``)."""

    id = serializers.IntegerField()
    media_type = serializers.CharField()
    title = serializers.CharField()
    slug = serializers.CharField()
    tmdb_id = serializers.CharField(allow_null=True)
    tvdb_id = serializers.CharField(allow_null=True, required=False, default=None)
    imdb_id = serializers.CharField(allow_null=True, required=False, default=None)
    igdb_id = serializers.CharField(allow_null=True, required=False, default=None)
    steam_app_id = serializers.IntegerField(allow_null=True, required=False, default=None)
    poster_url = serializers.CharField(allow_null=True)
    textless_poster_url = serializers.CharField(allow_null=True)
    backdrop_url = serializers.CharField(allow_null=True)
    logo_url = serializers.CharField(allow_null=True)
    logo_color_guess = serializers.CharField(allow_null=True)
    icon_url = serializers.CharField(allow_null=True)
    release_date = serializers.DateField(allow_null=True)
    popularity = serializers.FloatField()
    avg_rating = serializers.FloatField(allow_null=True)
    rating_count = serializers.IntegerField()
    overall_rating = serializers.FloatField(allow_null=True)
    overall_rating_source = serializers.CharField(allow_null=True)
    like_count = serializers.IntegerField()
    watchlist_count = serializers.IntegerField()
    watched_count = serializers.IntegerField()
    played_count = serializers.IntegerField()
    started_count = serializers.IntegerField()
    listened_count = serializers.IntegerField()
    view_count = serializers.IntegerField()
    is_adult = serializers.BooleanField()
    new_season_released = serializers.BooleanField(default=False, required=False)
    new_season_release_date = serializers.DateField(allow_null=True)
    user_interactions = serializers.SerializerMethodField()
    steam_playtime_forever = serializers.IntegerField(allow_null=True)
    steam_playtime_2weeks = serializers.IntegerField(allow_null=True)
    steam_rtime_last_played = serializers.IntegerField(allow_null=True)
    plex_view_count = serializers.IntegerField(allow_null=True)
    plex_last_viewed_at = serializers.DateTimeField(allow_null=True)
    album_artist_name = serializers.CharField(allow_null=True)
    album_track_count = serializers.IntegerField(allow_null=True)
    album_musicbrainz_release_group_id = serializers.CharField(allow_null=True)
    revenue = serializers.IntegerField(allow_null=True)
    budget = serializers.IntegerField(allow_null=True)

    def get_user_interactions(self, obj):
        return _user_interactions(getattr(obj, "user_interactions", None))


class MediaItemDetailSerializer(serializers.Serializer):
    """Full media detail (legacy ``MediaItemDetail``)."""

    id = serializers.IntegerField()
    media_type = serializers.CharField()
    title = serializers.CharField()
    slug = serializers.CharField()
    overview = serializers.CharField(allow_null=True)
    poster_url = serializers.CharField(allow_null=True)
    textless_poster_url = serializers.CharField(allow_null=True)
    backdrop_url = serializers.CharField(allow_null=True)
    logo_url = serializers.CharField(allow_null=True)
    logo_color_guess = serializers.CharField(allow_null=True)
    release_date = serializers.DateField(allow_null=True)
    popularity = serializers.FloatField()
    original_language = serializers.CharField(allow_null=True)
    completeness_score = serializers.FloatField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    avg_rating = serializers.FloatField(allow_null=True)
    rating_count = serializers.IntegerField()
    overall_rating = serializers.FloatField(allow_null=True)
    overall_rating_source = serializers.CharField(allow_null=True)
    tmdb_id = serializers.CharField(allow_null=True)
    tvdb_id = serializers.CharField(allow_null=True, required=False, default=None)
    imdb_id = serializers.CharField(allow_null=True, required=False, default=None)
    igdb_id = serializers.CharField(allow_null=True, required=False, default=None)
    steam_app_id = serializers.IntegerField(allow_null=True, required=False, default=None)
    like_count = serializers.IntegerField()
    watchlist_count = serializers.IntegerField()
    watched_count = serializers.IntegerField()
    played_count = serializers.IntegerField()
    started_count = serializers.IntegerField()
    listened_count = serializers.IntegerField()
    view_count = serializers.IntegerField()
    is_adult = serializers.BooleanField()
    new_season_released = serializers.BooleanField(default=False, required=False)
    new_season_release_date = serializers.DateField(allow_null=True)
    user_interactions = serializers.SerializerMethodField()
    steam_playtime_forever = serializers.IntegerField(allow_null=True)
    steam_playtime_2weeks = serializers.IntegerField(allow_null=True)
    steam_rtime_last_played = serializers.IntegerField(allow_null=True)
    youtube_video_id = serializers.CharField(allow_null=True)
    youtube_channel_title = serializers.CharField(allow_null=True)
    genres = serializers.SerializerMethodField()
    credits = serializers.SerializerMethodField()
    characters = serializers.SerializerMethodField()
    involved_companies = serializers.SerializerMethodField()
    releases = serializers.SerializerMethodField()
    platforms = serializers.SerializerMethodField()
    game_modes = serializers.SerializerMethodField()
    watch_providers = serializers.SerializerMethodField()
    screenshots = serializers.SerializerMethodField()
    videos = serializers.SerializerMethodField()
    movie = serializers.SerializerMethodField()
    show = serializers.SerializerMethodField()
    game = serializers.SerializerMethodField()
    album = serializers.SerializerMethodField()
    collection = serializers.SerializerMethodField()

    def get_user_interactions(self, obj):
        return _user_interactions(getattr(obj, "user_interactions", None))

    def get_genres(self, obj):
        genres = [mg.genre for mg in obj.media_genres.all() if mg.genre_id is not None]
        return GenreOutSerializer(genres, many=True).data

    def get_credits(self, obj):
        credits = [c for c in obj.credits.all() if c.person_id is not None]
        return MediaCreditOutSerializer(credits, many=True).data

    def get_characters(self, obj):
        from core.providers.wikidata import normalize_character_name

        characters = [mc for mc in obj.characters.all() if mc.character_id is not None]
        actor_map = {
            normalize_character_name(c.character_name): c.person
            for c in obj.credits.all()
            if c.person_id is not None and c.role == "cast" and c.character_name
        }
        ctx = {**self.context, "actor_map": actor_map}
        return MediaCharacterOutSerializer(characters, many=True, context=ctx).data

    def get_involved_companies(self, obj):
        companies = [ic for ic in obj.involved_companies.all() if ic.company_id is not None]
        return InvolvedCompanyOutSerializer(companies, many=True).data

    def get_releases(self, obj):
        return MediaReleaseOutSerializer(obj.releases.all(), many=True).data

    def get_platforms(self, obj):
        platforms = [mp for mp in obj.platforms.all() if mp.platform_id is not None]
        return MediaPlatformOutSerializer(platforms, many=True).data

    def get_game_modes(self, obj):
        game_modes = [gm for gm in obj.game_modes.all() if gm.game_mode_id is not None]
        return MediaGameModeOutSerializer(game_modes, many=True).data

    def get_watch_providers(self, obj):
        providers = [wp for wp in obj.watch_providers.all() if wp.watch_provider_id is not None]
        return MediaWatchProviderOutSerializer(providers, many=True).data

    def get_screenshots(self, obj):
        shots = [a for a in obj.assets.all() if (a.asset_type or "").lower() == "screenshot"]
        shots.sort(key=lambda a: a.score or 0, reverse=True)
        return MediaAssetOutSerializer(shots, many=True).data

    def get_videos(self, obj):
        return MediaVideoOutSerializer(obj.videos.all(), many=True).data

    def _subtype(self, obj, name):
        try:
            return getattr(obj, name)
        except ObjectDoesNotExist:
            return None

    def get_movie(self, obj):
        movie: Movie | None = self._subtype(obj, "movie")
        if movie is None:
            return None
        return {
            "runtime": movie.runtime,
            "budget": movie.budget,
            "revenue": movie.revenue,
            "revenue_rank": None,
            "profit_pct": None,
            "profit_rank": None,
            "loss_rank": None,
            "tagline": movie.tagline,
            "is_anime": movie.is_anime,
        }

    def get_show(self, obj):
        show: Show | None = self._subtype(obj, "show")
        if show is None:
            return None
        return ShowDetailSerializer(show).data

    def get_game(self, obj):
        game: Game | None = self._subtype(obj, "game")
        if game is None:
            return None
        steam_id = getattr(obj, "steam_app_id", None)
        if steam_id is None:
            steam_str = (
                ExternalID.objects.filter(
                    content_type=ContentType.objects.get_for_model(MediaItem),
                    object_id=obj.pk,
                    provider="steam",
                    media_type="game",
                )
                .values_list("external_id", flat=True)
                .first()
            )
            steam_id = int(steam_str) if steam_str and steam_str.isdigit() else None
        return {
            "release_status": game.release_status,
            "website": game.website,
            "steam_app_id": steam_id,
            "store_ids": {"steam": str(steam_id)} if steam_id else None,
            "current_players": game.current_players,
            "price_json": game.price_json,
            "recommendations": game.recommendations,
            "review_summary": game.review_summary,
            "is_free": game.is_free,
            "has_multiplayer": game.has_multiplayer,
            "time_to_beat": game.time_to_beat,
            "game_type": game.game_type or "main_game",
            "parent_game_id": game.parent_game_id,
            "parent_game_title": game.parent_game_title,
            "is_dlc": (game.game_type or "") == "dlc",
            "is_beta": (game.game_type or "") == "beta",
            "is_demo": (game.game_type or "") == "demo",
        }

    def get_album(self, _obj):
        return None

    def get_collection(self, obj):
        movie = self._subtype(obj, "movie")
        collection = getattr(movie, "collection", None) if movie is not None else None
        if collection is None:
            return None
        return CollectionOutSerializer(collection).data

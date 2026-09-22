"""TypedDict definitions for TMDB upstream API responses.

Provides strong typing for deserialized JSON payloads returned by TMDB v3 endpoints.
"""

from __future__ import annotations

from typing import NotRequired, TypedDict


class TMDBGenre(TypedDict):
    id: int
    name: str


class TMDBKeyword(TypedDict):
    id: int
    name: str


class TMDBKeywords(TypedDict):
    keywords: NotRequired[list[TMDBKeyword]]
    results: NotRequired[list[TMDBKeyword]]


class TMDBCompany(TypedDict):
    id: int
    name: str
    logo_path: NotRequired[str | None]
    origin_country: NotRequired[str | None]
    description: NotRequired[str | None]
    homepage: NotRequired[str | None]
    headquarters: NotRequired[str | None]


class TMDBCastMember(TypedDict):
    id: int
    name: str
    character: NotRequired[str | None]
    order: NotRequired[int]
    profile_path: NotRequired[str | None]
    credit_id: NotRequired[str]
    gender: NotRequired[int | None]
    popularity: NotRequired[float]


class TMDBCrewMember(TypedDict):
    id: int
    name: str
    job: NotRequired[str | None]
    department: NotRequired[str | None]
    order: NotRequired[int]
    profile_path: NotRequired[str | None]
    credit_id: NotRequired[str]


class TMDBCredits(TypedDict):
    cast: NotRequired[list[TMDBCastMember]]
    crew: NotRequired[list[TMDBCrewMember]]


class TMDBImage(TypedDict):
    file_path: str
    aspect_ratio: NotRequired[float]
    height: NotRequired[int]
    width: NotRequired[int]
    iso_639_1: NotRequired[str | None]
    vote_average: NotRequired[float]
    vote_count: NotRequired[int]


class TMDBImages(TypedDict):
    backdrops: NotRequired[list[TMDBImage]]
    logos: NotRequired[list[TMDBImage]]
    posters: NotRequired[list[TMDBImage]]


class TMDBVideo(TypedDict):
    id: str
    iso_639_1: NotRequired[str]
    iso_3166_1: NotRequired[str]
    name: str
    key: str
    site: str
    size: NotRequired[int]
    type: str
    official: NotRequired[bool]
    published_at: NotRequired[str]


class TMDBVideos(TypedDict):
    results: list[TMDBVideo]


class TMDBReleaseDateEntry(TypedDict):
    certification: NotRequired[str]
    descriptors: NotRequired[list[str]]
    iso_639_1: NotRequired[str]
    note: NotRequired[str]
    release_date: str
    release_type: NotRequired[int]


class TMDBReleaseDatesCountry(TypedDict):
    iso_3166_1: str
    release_dates: list[TMDBReleaseDateEntry]


class TMDBReleaseDates(TypedDict):
    results: list[TMDBReleaseDatesCountry]


class TMDBContentRating(TypedDict):
    descriptors: NotRequired[list[str]]
    iso_3166_1: str
    rating: str


class TMDBContentRatings(TypedDict):
    results: list[TMDBContentRating]


class TMDBWatchProviderItem(TypedDict):
    logo_path: NotRequired[str]
    provider_id: int
    provider_name: str
    display_priority: NotRequired[int]


class TMDBWatchProviderCountry(TypedDict):
    link: NotRequired[str]
    flatrate: NotRequired[list[TMDBWatchProviderItem]]
    rent: NotRequired[list[TMDBWatchProviderItem]]
    buy: NotRequired[list[TMDBWatchProviderItem]]


class TMDBWatchProviders(TypedDict):
    results: dict[str, TMDBWatchProviderCountry]


class TMDBEpisodeDetail(TypedDict):
    id: int
    episode_number: int
    name: str
    overview: NotRequired[str | None]
    air_date: NotRequired[str | None]
    runtime: NotRequired[int | None]
    still_path: NotRequired[str | None]
    vote_average: NotRequired[float]
    vote_count: NotRequired[int]
    season_number: NotRequired[int]


class TMDBSeasonSummary(TypedDict):
    id: int
    season_number: int
    name: str
    overview: NotRequired[str | None]
    poster_path: NotRequired[str | None]
    air_date: NotRequired[str | None]
    episode_count: NotRequired[int]


class TMDBSeasonDetail(TypedDict):
    id: int
    season_number: int
    name: str
    overview: NotRequired[str | None]
    poster_path: NotRequired[str | None]
    air_date: NotRequired[str | None]
    episodes: NotRequired[list[TMDBEpisodeDetail]]


class TMDBExternalIds(TypedDict):
    imdb_id: NotRequired[str | None]
    tvdb_id: NotRequired[int | str | None]
    wikidata_id: NotRequired[str | None]
    facebook_id: NotRequired[str | None]
    instagram_id: NotRequired[str | None]
    twitter_id: NotRequired[str | None]


class TMDBMovieDetail(TypedDict):
    id: int
    title: str
    original_title: NotRequired[str | None]
    overview: NotRequired[str | None]
    release_date: NotRequired[str | None]
    status: NotRequired[str | None]
    runtime: NotRequired[int | None]
    budget: NotRequired[int | None]
    revenue: NotRequired[int | None]
    tagline: NotRequired[str | None]
    popularity: NotRequired[float]
    vote_average: NotRequired[float]
    vote_count: NotRequired[int]
    original_language: NotRequired[str | None]
    adult: NotRequired[bool]
    genres: NotRequired[list[TMDBGenre]]
    credits: NotRequired[TMDBCredits]
    images: NotRequired[TMDBImages]
    videos: NotRequired[TMDBVideos]
    release_dates: NotRequired[TMDBReleaseDates]
    keywords: NotRequired[TMDBKeywords | list[TMDBKeyword]]
    production_companies: NotRequired[list[TMDBCompany]]
    external_ids: NotRequired[TMDBExternalIds]
    imdb_id: NotRequired[str | None]
    belongs_to_collection: NotRequired[dict[str, object] | None]
    poster_path: NotRequired[str | None]
    backdrop_path: NotRequired[str | None]


class TMDBShowDetail(TypedDict):
    id: int
    name: str
    original_name: NotRequired[str | None]
    overview: NotRequired[str | None]
    first_air_date: NotRequired[str | None]
    last_air_date: NotRequired[str | None]
    status: NotRequired[str | None]
    number_of_seasons: NotRequired[int]
    number_of_episodes: NotRequired[int]
    popularity: NotRequired[float]
    vote_average: NotRequired[float]
    vote_count: NotRequired[int]
    original_language: NotRequired[str | None]
    adult: NotRequired[bool]
    genres: NotRequired[list[TMDBGenre]]
    credits: NotRequired[TMDBCredits]
    images: NotRequired[TMDBImages]
    videos: NotRequired[TMDBVideos]
    content_ratings: NotRequired[TMDBContentRatings]
    keywords: NotRequired[TMDBKeywords | list[TMDBKeyword]]
    production_companies: NotRequired[list[TMDBCompany]]
    networks: NotRequired[list[TMDBCompany]]
    seasons: NotRequired[list[TMDBSeasonSummary]]
    external_ids: NotRequired[TMDBExternalIds]
    poster_path: NotRequired[str | None]
    backdrop_path: NotRequired[str | None]


class TMDBPersonDetail(TypedDict):
    id: int
    name: str
    biography: NotRequired[str | None]
    birthday: NotRequired[str | None]
    deathday: NotRequired[str | None]
    place_of_birth: NotRequired[str | None]
    profile_path: NotRequired[str | None]
    imdb_id: NotRequired[str | None]
    known_for_department: NotRequired[str | None]
    popularity: NotRequired[float]
    external_ids: NotRequired[TMDBExternalIds]

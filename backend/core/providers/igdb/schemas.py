"""Schemas, types, and Apicalypse field constants for the IGDB provider."""

from __future__ import annotations

from typing import Any

# Full field set for fetching a complete game record (hydration + seeding).
GAME_FIELDS = (
    "id,name,summary,storyline,first_release_date,"
    "rating,aggregated_rating,rating_count,aggregated_rating_count,"
    "hypes,url,slug,status,"
    "game_type,parent_game.name,"
    "cover.image_id,"
    "screenshots.image_id,screenshots.width,screenshots.height,"
    "artworks.image_id,artworks.width,artworks.height,artworks.image_type,artworks.alpha_channel,artworks.artwork_type,"
    "genres.name,themes.name,"
    "platforms.name,platforms.platform_logo.image_id,"
    "game_modes.name,"
    "websites.url,websites.type,"
    "external_games.external_game_source,external_games.uid,"
    "videos.video_id,videos.name,"
    "involved_companies.company.name,involved_companies.company.slug,"
    "involved_companies.company.logo.image_id,"
    "involved_companies.developer,involved_companies.publisher,"
    "involved_companies.porting,involved_companies.supporting,"
    "age_ratings,"
    "franchise.name,franchise.id"
)

# Field set consumed during catalog hydration / seed pass.
GAME_HYDRATION_FIELDS = (
    "id,name,slug,cover.image_id,first_release_date,storyline,summary,"
    "status,game_type,franchise.name,parent_game.name,"
    "websites.url,websites.type,"
    "platforms.name,genres.name,game_modes.name,"
    "screenshots.image_id,screenshots.width,screenshots.height,"
    "artworks.image_id,artworks.width,artworks.height,artworks.image_type,artworks.alpha_channel,artworks.artwork_type,"
    "videos.video_id,videos.name,age_ratings,"
    "involved_companies.developer,involved_companies.publisher,"
    "involved_companies.porting,involved_companies.supporting,"
    "involved_companies.company.name,involved_companies.company.slug,"
    "aggregated_rating,aggregated_rating_count,rating,rating_count,"
    "external_games.external_game_source,external_games.uid,"
    "similar_games"
)

# Minimal field set for search queries.
SEARCH_FIELDS = "id,name,slug,cover.image_id,first_release_date,platforms.name"

# Fields for character queries.
CHARACTER_FIELDS = "id,name,slug,description,gender,species,mug_shot.image_id,games"

# IGDB character gender enum -> normalized string.
CHARACTER_GENDER_MAP: dict[int, str] = {
    0: "not_applicable",
    1: "male",
    2: "female",
    3: "other",
}

# IGDB character species enum -> normalized string.
CHARACTER_SPECIES_MAP: dict[int, str] = {
    1: "human",
    2: "alien",
    3: "animal",
    4: "android",
    5: "unknown",
}

# Fields for company queries.
COMPANY_FIELDS = (
    "id,name,slug,description,logo.image_id,websites.url,websites.type,published,developed"
)

# External game sources
EXTERNAL_SOURCE_STEAM = 1
EXTERNAL_SOURCE_GOG = 5
EXTERNAL_SOURCE_EPIC = 26

# IGDB game status categories -> release status string.
IGDB_STATUS_MAP: dict[int, str] = {
    0: "released",
    2: "alpha",
    3: "beta",
    4: "early_access",
    5: "offline",
    6: "cancelled",
    7: "rumored",
    8: "delisted",
}

# IGDB game_type (category) -> human label.
IGDB_GAME_TYPE_MAP: dict[int, str] = {
    0: "main_game",
    1: "dlc_addon",
    2: "expansion",
    3: "bundle",
    4: "standalone_expansion",
    5: "mod",
    6: "episode",
    7: "season",
    8: "remake",
    9: "remaster",
    10: "expanded_game",
    11: "port",
    12: "fork",
    13: "pack",
    14: "update",
}

# IGDB game_mode names implying multiplayer.
MULTIPLAYER_MODES: set[str] = {
    "multiplayer",
    "co-operative",
    "online co-op",
    "split screen",
    "massively multiplayer",
    "battle royale",
}

# Age rating organization -> (system name, ISO 3166-1 alpha-2 country code).
AGE_RATING_ORG_MAP: dict[int, tuple[str, str]] = {
    1: ("ESRB", "US"),
    2: ("PEGI", "GB"),
    3: ("CERO", "JP"),
    4: ("USK", "DE"),
    5: ("GRAC", "KR"),
    6: ("ClassInd", "BR"),
    7: ("ACB", "AU"),
}

# Age rating category -> per-organization rating label.
AGE_RATING_LABEL_MAP: dict[int, str] = {
    # ESRB (org=1)
    1: "RP",
    2: "EC",
    3: "E",
    4: "E10+",
    5: "T",
    6: "M",
    7: "AO",
    # PEGI (org=2)
    8: "3",
    9: "7",
    10: "12",
    11: "16",
    12: "18",
    # CERO (org=3)
    13: "A",
    14: "B",
    15: "C",
    16: "D",
    17: "Z",
    # USK (org=4)
    18: "0",
    19: "6",
    20: "12",
    21: "16",
    22: "18",
    # GRAC (org=5)
    23: "ALL",
    24: "12+",
    25: "15+",
    26: "18+",
    # ClassInd (org=6)
    27: "ER",
    28: "L",
    29: "10",
    30: "12",
    31: "14",
    32: "16",
    33: "18",
    # ACB (org=7)
    34: "G",
    35: "PG",
    36: "M",
    37: "MA15+",
    38: "R18+",
}

# Platform name normalization mapping.
PLATFORM_NORMALIZATION: dict[str, str] = {
    "PC (Microsoft Windows)": "windows",
    "Mac": "macos",
    "Linux": "linux",
    "Windows": "windows",
    "MacOS": "macos",
    "PlayStation 5": "playstation-5",
    "PlayStation 4": "playstation-4",
    "Xbox Series X|S": "xbox-series-x-s",
    "Xbox One": "xbox-one",
    "Nintendo Switch": "nintendo-switch",
    "Android": "android",
    "iOS": "ios",
    "Web browser": "web",
    "VR": "vr",
    "Stadia": "stadia",
}

# Image classification constants
LOGO_IMAGE_TYPES: set[int] = {5, 6, 7, 14}
LOGO_ARTWORK_TYPES: set[int] = {5, 6, 7}
ICON_IMAGE_TYPES: set[int] = {13, 15}
ICON_ARTWORK_TYPES: set[int] = {12, 13}
COVER_IMAGE_TYPES: set[int] = {8, 9, 10, 11}
BACKDROP_MIN_ASPECT: float = 1.4


def cover_url(cover: Any, size: str = "t_original") -> str | None:
    """Build an IGDB cover image URL from a cover dict, image ID string, or None."""
    if isinstance(cover, dict):
        image_id = cover.get("image_id")
    elif isinstance(cover, str):
        image_id = cover
    else:
        return None
    if not image_id:
        return None
    return f"https://images.igdb.com/igdb/image/upload/{size}/{image_id}.jpg"


def image_url(image_id: Any, size: str = "t_original") -> str | None:
    """Build an IGDB CDN image URL for an artwork/screenshot/cover image ID."""
    if not isinstance(image_id, str) or not image_id:
        return None
    return f"https://images.igdb.com/igdb/image/upload/{size}/{image_id}.jpg"


def game_type_label(raw: dict[str, Any]) -> str | None:
    """Map an IGDB game_type / category value onto its human-readable label."""
    cat_raw = raw.get("game_type", raw.get("category"))
    if isinstance(cat_raw, str):
        cat_raw = cat_raw.strip()
        return cat_raw or None
    if isinstance(cat_raw, (int, float)) and not isinstance(cat_raw, bool):
        return IGDB_GAME_TYPE_MAP.get(int(cat_raw))
    return None


def character_gender_label(gender: int | str | None) -> str | None:
    """Map IGDB character gender integer code to normalized label."""
    if gender is None:
        return None
    try:
        return CHARACTER_GENDER_MAP.get(int(gender), str(gender))
    except (ValueError, TypeError):
        return str(gender)


def character_species_label(species: int | str | None) -> str | None:
    """Map IGDB character species integer code to normalized label."""
    if species is None:
        return None
    try:
        return CHARACTER_SPECIES_MAP.get(int(species), str(species))
    except (ValueError, TypeError):
        return str(species)


def character_mug_shot_url(mug_shot: Any, size: str = "t_cover_big") -> str | None:
    """Build an IGDB CDN image URL for a character mug_shot."""
    if not mug_shot:
        return None
    if isinstance(mug_shot, dict):
        img_id = mug_shot.get("image_id")
        return image_url(img_id, size) if img_id else None
    if isinstance(mug_shot, str):
        return image_url(mug_shot, size)
    return None

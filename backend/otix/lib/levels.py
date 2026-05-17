"""Level title definitions and XP/level mapping."""

from dataclasses import dataclass

XP_PER_LEVEL = 300


@dataclass
class LevelTier:
    min_level: int
    max_level: int
    title: str


LEVEL_TIERS: list[LevelTier] = [
    LevelTier(1, 4, "Novice"),
    LevelTier(5, 9, "Apprentice"),
    LevelTier(10, 19, "Adept"),
    LevelTier(20, 34, "Expert"),
    LevelTier(35, 49, "Master"),
    LevelTier(50, 74, "Grandmaster"),
    LevelTier(75, 99, "Legend"),
    LevelTier(100, 9999, "Transcendent"),
]


def get_level_title(level: int) -> str:
    for tier in LEVEL_TIERS:
        if tier.min_level <= level <= tier.max_level:
            return tier.title
    return "Novice"


REPUTATION_TIERS: list[LevelTier] = [
    LevelTier(-9999, 99, "Flagged"),
    LevelTier(100, 149, "Newcomer"),
    LevelTier(150, 249, "Contributor"),
    LevelTier(250, 399, "Trusted"),
    LevelTier(400, 599, "Respected"),
    LevelTier(600, 799, "Elite"),
    LevelTier(800, 1000, "Pillar"),
]


def get_reputation_tier(score: int) -> str:
    for tier in REPUTATION_TIERS:
        if tier.min_level <= score <= tier.max_level:
            return tier.title
    return "Newcomer"


def compute_level_info(total_xp: int) -> dict:
    """Return level, title, xp_to_next_level, xp_progress from total XP."""
    level = (total_xp // XP_PER_LEVEL) + 1
    xp_floor = (level - 1) * XP_PER_LEVEL
    xp_ceil = level * XP_PER_LEVEL
    xp_to_next = xp_ceil - xp_floor
    progress = min(1.0, (total_xp - xp_floor) / xp_to_next) if xp_to_next > 0 else 1.0
    return {
        "level": level,
        "level_title": get_level_title(level),
        "xp_to_next_level": xp_to_next,
        "xp_progress": round(progress, 2),
    }

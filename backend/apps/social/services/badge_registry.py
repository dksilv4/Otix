# ruff: noqa: E501  (transcribed legacy badge table; rows are intentionally long)

"""Achievement badge definitions.

Badges are code-defined, not stored in the DB: only earned badges persist as
``social.UserBadge`` rows. This module transcribes the legacy registry
(``old-backend/otix/lib/badges.py``) into data the API can serve: the achievement
list, badge-detail rows and the claim route's ``xp_reward``. XP itself is a
legacy ``User`` column that has no greenfield home yet, so ``xp_reward`` here is
the tier amount used by the claim response only.
"""

from __future__ import annotations

from dataclasses import dataclass

_XP_BY_TIER = {"bronze": 50, "silver": 100, "gold": 250, "platinum": 500, "special": 150}


@dataclass(frozen=True)
class BadgeDef:
    key: str
    label: str
    description: str
    icon: str
    tier: str
    target: float
    metric: str

    @property
    def xp_reward(self) -> int:
        return _XP_BY_TIER.get(self.tier, 50)


# (key, label, description, icon, tier, target, metric)
_RAW: tuple[tuple[str, str, str, str, str, float, str], ...] = (
    # Review milestones.
    (
        "first_review",
        "First Words",
        "Wrote your first review",
        "Feather",
        "special",
        1.0,
        "review_count",
    ),
    (
        "reviews_5",
        "Aspiring Critic",
        "Wrote 5 reviews",
        "MessageSquare",
        "bronze",
        5.0,
        "review_count",
    ),
    ("reviews_10", "Critic", "Wrote 10 reviews", "MessageSquare", "bronze", 10.0, "review_count"),
    (
        "reviews_25",
        "Wordsmith",
        "Wrote 25 reviews",
        "MessageSquare",
        "bronze",
        25.0,
        "review_count",
    ),
    (
        "reviews_50",
        "Prolific Critic",
        "Wrote 50 reviews",
        "MessageSquare",
        "silver",
        50.0,
        "review_count",
    ),
    (
        "reviews_100",
        "Review Machine",
        "Wrote 100 reviews",
        "MessageSquare",
        "gold",
        100.0,
        "review_count",
    ),
    (
        "reviews_250",
        "Connoisseur",
        "Wrote 250 reviews",
        "MessageSquare",
        "gold",
        250.0,
        "review_count",
    ),
    (
        "reviews_500",
        "Legendary Critic",
        "Wrote 500 reviews",
        "MessageSquare",
        "platinum",
        500.0,
        "review_count",
    ),
    (
        "reviews_1000",
        "All-Seeing Eye",
        "Wrote 1000 reviews",
        "MessageSquare",
        "platinum",
        1000.0,
        "review_count",
    ),
    # Interaction milestones.
    (
        "interactions_10",
        "First Steps",
        "Logged 10 media interactions",
        "Play",
        "bronze",
        10.0,
        "interaction_count",
    ),
    (
        "interactions_50",
        "Casual Fan",
        "Logged 50 media interactions",
        "Play",
        "bronze",
        50.0,
        "interaction_count",
    ),
    (
        "interactions_100",
        "Binger",
        "Logged 100 media interactions",
        "Play",
        "bronze",
        100.0,
        "interaction_count",
    ),
    (
        "interactions_250",
        "Enthusiast",
        "Logged 250 media interactions",
        "Play",
        "silver",
        250.0,
        "interaction_count",
    ),
    (
        "interactions_500",
        "Power User",
        "Logged 500 media interactions",
        "Play",
        "silver",
        500.0,
        "interaction_count",
    ),
    (
        "interactions_1000",
        "Media Mogul",
        "Logged 1000 media interactions",
        "Play",
        "gold",
        1000.0,
        "interaction_count",
    ),
    (
        "interactions_2000",
        "Culture Connoisseur",
        "Logged 2000 media interactions",
        "Play",
        "gold",
        2000.0,
        "interaction_count",
    ),
    (
        "interactions_5000",
        "Omnipresent",
        "Logged 5000 media interactions",
        "Play",
        "platinum",
        5000.0,
        "interaction_count",
    ),
    (
        "interactions_10000",
        "Grandmaster of Media",
        "Logged 10000 media interactions",
        "Play",
        "platinum",
        10000.0,
        "interaction_count",
    ),
    # List milestones.
    ("lists_1", "Cataloger", "Created 1 list", "List", "bronze", 1.0, "list_count"),
    ("lists_5", "Organizer", "Created 5 lists", "List", "bronze", 5.0, "list_count"),
    ("lists_10", "Curator", "Created 10 lists", "List", "bronze", 10.0, "list_count"),
    ("lists_25", "Collector", "Created 25 lists", "List", "silver", 25.0, "list_count"),
    ("lists_50", "Master Curator", "Created 50 lists", "List", "silver", 50.0, "list_count"),
    ("lists_100", "Archivist", "Created 100 lists", "List", "gold", 100.0, "list_count"),
    ("lists_250", "Library Director", "Created 250 lists", "List", "gold", 250.0, "list_count"),
    ("lists_500", "Alexandrian", "Created 500 lists", "List", "platinum", 500.0, "list_count"),
    # Workout milestones.
    (
        "workouts_1",
        "First Sweat",
        "Logged your first workout",
        "Dumbbell",
        "special",
        1.0,
        "workout_count",
    ),
    (
        "workouts_10",
        "Warmup Done",
        "Logged 10 workouts",
        "Dumbbell",
        "bronze",
        10.0,
        "workout_count",
    ),
    (
        "workouts_25",
        "Consistent",
        "Logged 25 workouts",
        "Dumbbell",
        "bronze",
        25.0,
        "workout_count",
    ),
    ("workouts_50", "Regular", "Logged 50 workouts", "Dumbbell", "bronze", 50.0, "workout_count"),
    (
        "workouts_100",
        "Dedicated",
        "Logged 100 workouts",
        "Dumbbell",
        "silver",
        100.0,
        "workout_count",
    ),
    (
        "workouts_200",
        "Athlete",
        "Logged 200 workouts",
        "Dumbbell",
        "silver",
        200.0,
        "workout_count",
    ),
    (
        "workouts_500",
        "Iron Will",
        "Logged 500 workouts",
        "Dumbbell",
        "gold",
        500.0,
        "workout_count",
    ),
    (
        "workouts_1000",
        "Olympian",
        "Logged 1000 workouts",
        "Dumbbell",
        "platinum",
        1000.0,
        "workout_count",
    ),
    # Level milestones (XP has no greenfield column yet, so level is always 1).
    ("level_2", "Newcomer", "Reached level 2", "Zap", "bronze", 2.0, "level"),
    ("level_5", "Rising Star", "Reached level 5", "Zap", "bronze", 5.0, "level"),
    ("level_10", "Established", "Reached level 10", "Zap", "silver", 10.0, "level"),
    ("level_20", "Veteran", "Reached level 20", "Zap", "gold", 20.0, "level"),
    ("level_35", "Champion", "Reached level 35", "Zap", "gold", 35.0, "level"),
    ("level_50", "Elite", "Reached level 50", "Zap", "platinum", 50.0, "level"),
    ("level_75", "Legend", "Reached level 75", "Zap", "platinum", 75.0, "level"),
    ("level_100", "Transcendent", "Reached level 100", "Zap", "special", 100.0, "level"),
    # Login streaks.
    ("streak_3", "Warmup Streak", "3-day login streak", "Flame", "bronze", 3.0, "login_streak"),
    ("streak_7", "Week Warrior", "7-day login streak", "Flame", "silver", 7.0, "login_streak"),
    (
        "streak_30",
        "Monthly Dedication",
        "30-day login streak",
        "Flame",
        "silver",
        30.0,
        "login_streak",
    ),
    (
        "streak_100",
        "Century Streak",
        "100-day login streak",
        "Flame",
        "platinum",
        100.0,
        "login_streak",
    ),
    # Friends.
    (
        "first_friend",
        "First Contact",
        "Made your first friend",
        "UserPlus",
        "special",
        1.0,
        "friend_count",
    ),
    ("friends_5", "Popular", "Made 5 friends", "Users", "silver", 5.0, "friend_count"),
    ("friends_20", "Socialite", "Made 20 friends", "Users", "gold", 20.0, "friend_count"),
    # Peer user ratings.
    ("perfect_10", "Perfect 10", "Rated 10 by 5+ users", "Award", "gold", 5.0, "user_rating_count"),
    # Review streaks.
    (
        "review_streak_2",
        "Weekly Ritual",
        "2-week review streak",
        "Flame",
        "bronze",
        2.0,
        "review_streak",
    ),
    (
        "review_streak_4",
        "Monthly Critic",
        "4-week review streak",
        "Flame",
        "silver",
        4.0,
        "review_streak",
    ),
    (
        "review_streak_8",
        "Dedicated Reviewer",
        "8-week review streak",
        "Flame",
        "gold",
        8.0,
        "review_streak",
    ),
    (
        "review_streak_26",
        "Half-Year Critic",
        "26-week review streak",
        "Flame",
        "platinum",
        26.0,
        "review_streak",
    ),
    # Workout streaks.
    (
        "workout_streak_7",
        "Workout Week",
        "7-day workout streak",
        "Dumbbell",
        "special",
        7.0,
        "workout_streak",
    ),
    (
        "workout_streak_14",
        "Fortnight Fitness",
        "14-day workout streak",
        "Dumbbell",
        "silver",
        14.0,
        "workout_streak",
    ),
    (
        "workout_streak_30",
        "Monthly Grind",
        "30-day workout streak",
        "Dumbbell",
        "gold",
        30.0,
        "workout_streak",
    ),
    (
        "workout_streak_100",
        "Iron Discipline",
        "100-day workout streak",
        "Dumbbell",
        "platinum",
        100.0,
        "workout_streak",
    ),
    # Media diversity.
    (
        "media_explorer",
        "Media Explorer",
        "Interacted with 2+ media types",
        "Compass",
        "special",
        2.0,
        "distinct_media_types",
    ),
    (
        "media_omnivore",
        "Media Omnivore",
        "Interacted with all 4 media types",
        "Layers",
        "gold",
        4.0,
        "distinct_media_types",
    ),
    # Review quality.
    (
        "upvotes_5",
        "Helpful Voice",
        "Received 5+ review upvotes",
        "ThumbsUp",
        "silver",
        5.0,
        "review_upvotes_received",
    ),
    (
        "upvotes_25",
        "Trusted Critic",
        "Received 25+ review upvotes",
        "ThumbsUp",
        "gold",
        25.0,
        "review_upvotes_received",
    ),
)

BADGE_DEFS: dict[str, BadgeDef] = {
    key: BadgeDef(key, label, description, icon, tier, target, metric)
    for key, label, description, icon, tier, target, metric in _RAW
}


def get_badge_def(badge_key: str) -> BadgeDef | None:
    """Look up a badge by key; ``None`` when the key is unknown."""
    return BADGE_DEFS.get(badge_key)


def ordered_badge_defs() -> list[BadgeDef]:
    """All definitions in the legacy registry's declaration order."""
    return list(BADGE_DEFS.values())

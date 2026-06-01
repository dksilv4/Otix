"""Achievement badge definitions.

Badges are code-defined (not stored in the DB). Only earned badges are persisted
in the user_badges table. This file defines badge metadata and unlock conditions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable


@dataclass
class BadgeDef:
    key: str
    label: str
    description: str
    icon: str  # lucide-react icon name
    tier: str  # bronze, silver, gold, platinum, special
    target: int | float
    metric_fn: Callable[["BadgeContext"], int | float] = field(repr=False)
    condition: Callable[["BadgeContext"], bool] = field(repr=False)

    @property
    def xp_reward(self) -> int:
        mapping = {
            "bronze": 50,
            "silver": 100,
            "gold": 250,
            "platinum": 500,
            "special": 150,
        }
        return mapping.get(self.tier.lower(), 50)



@dataclass
class BadgeContext:
    """Stats snapshot used by badge condition checks."""
    review_count: int = 0
    interaction_count: int = 0
    list_count: int = 0
    workout_count: int = 0
    total_xp: int = 0
    level: int = 1
    login_streak: int = 0
    review_streak: int = 0
    workout_streak: int = 0
    distinct_media_types: int = 0
    review_upvotes_received: int = 0
    user_rating_count: int = 0
    avg_user_rating: float | None = None
    friend_count: int = 0


BADGES: dict[str, BadgeDef] = {
    # ── Review milestones (9 badges) ──
    "first_review": BadgeDef(
        key="first_review", label="First Words", description="Wrote your first review",
        icon="Feather", tier="special", target=1,
        metric_fn=lambda c: c.review_count,
        condition=lambda c: c.review_count >= 1,
    ),
    "reviews_5": BadgeDef(
        key="reviews_5", label="Aspiring Critic", description="Wrote 5 reviews",
        icon="MessageSquare", tier="bronze", target=5,
        metric_fn=lambda c: c.review_count,
        condition=lambda c: c.review_count >= 5,
    ),
    "reviews_10": BadgeDef(
        key="reviews_10", label="Critic", description="Wrote 10 reviews",
        icon="MessageSquare", tier="bronze", target=10,
        metric_fn=lambda c: c.review_count,
        condition=lambda c: c.review_count >= 10,
    ),
    "reviews_25": BadgeDef(
        key="reviews_25", label="Wordsmith", description="Wrote 25 reviews",
        icon="MessageSquare", tier="bronze", target=25,
        metric_fn=lambda c: c.review_count,
        condition=lambda c: c.review_count >= 25,
    ),
    "reviews_50": BadgeDef(
        key="reviews_50", label="Prolific Critic", description="Wrote 50 reviews",
        icon="MessageSquare", tier="silver", target=50,
        metric_fn=lambda c: c.review_count,
        condition=lambda c: c.review_count >= 50,
    ),
    "reviews_100": BadgeDef(
        key="reviews_100", label="Review Machine", description="Wrote 100 reviews",
        icon="MessageSquare", tier="gold", target=100,
        metric_fn=lambda c: c.review_count,
        condition=lambda c: c.review_count >= 100,
    ),
    "reviews_250": BadgeDef(
        key="reviews_250", label="Connoisseur", description="Wrote 250 reviews",
        icon="MessageSquare", tier="gold", target=250,
        metric_fn=lambda c: c.review_count,
        condition=lambda c: c.review_count >= 250,
    ),
    "reviews_500": BadgeDef(
        key="reviews_500", label="Legendary Critic", description="Wrote 500 reviews",
        icon="MessageSquare", tier="platinum", target=500,
        metric_fn=lambda c: c.review_count,
        condition=lambda c: c.review_count >= 500,
    ),
    "reviews_1000": BadgeDef(
        key="reviews_1000", label="All-Seeing Eye", description="Wrote 1000 reviews",
        icon="MessageSquare", tier="platinum", target=1000,
        metric_fn=lambda c: c.review_count,
        condition=lambda c: c.review_count >= 1000,
    ),

    # ── Interaction milestones (9 badges) ──
    "interactions_10": BadgeDef(
        key="interactions_10", label="First Steps", description="Logged 10 media interactions",
        icon="Play", tier="bronze", target=10,
        metric_fn=lambda c: c.interaction_count,
        condition=lambda c: c.interaction_count >= 10,
    ),
    "interactions_50": BadgeDef(
        key="interactions_50", label="Casual Fan", description="Logged 50 media interactions",
        icon="Play", tier="bronze", target=50,
        metric_fn=lambda c: c.interaction_count,
        condition=lambda c: c.interaction_count >= 50,
    ),
    "interactions_100": BadgeDef(
        key="interactions_100", label="Binger", description="Logged 100 media interactions",
        icon="Play", tier="bronze", target=100,
        metric_fn=lambda c: c.interaction_count,
        condition=lambda c: c.interaction_count >= 100,
    ),
    "interactions_250": BadgeDef(
        key="interactions_250", label="Enthusiast", description="Logged 250 media interactions",
        icon="Play", tier="silver", target=250,
        metric_fn=lambda c: c.interaction_count,
        condition=lambda c: c.interaction_count >= 250,
    ),
    "interactions_500": BadgeDef(
        key="interactions_500", label="Power User", description="Logged 500 media interactions",
        icon="Play", tier="silver", target=500,
        metric_fn=lambda c: c.interaction_count,
        condition=lambda c: c.interaction_count >= 500,
    ),
    "interactions_1000": BadgeDef(
        key="interactions_1000", label="Media Mogul", description="Logged 1000 media interactions",
        icon="Play", tier="gold", target=1000,
        metric_fn=lambda c: c.interaction_count,
        condition=lambda c: c.interaction_count >= 1000,
    ),
    "interactions_2000": BadgeDef(
        key="interactions_2000", label="Culture Connoisseur", description="Logged 2000 media interactions",
        icon="Play", tier="gold", target=2000,
        metric_fn=lambda c: c.interaction_count,
        condition=lambda c: c.interaction_count >= 2000,
    ),
    "interactions_5000": BadgeDef(
        key="interactions_5000", label="Omnipresent", description="Logged 5000 media interactions",
        icon="Play", tier="platinum", target=5000,
        metric_fn=lambda c: c.interaction_count,
        condition=lambda c: c.interaction_count >= 5000,
    ),
    "interactions_10000": BadgeDef(
        key="interactions_10000", label="Grandmaster of Media", description="Logged 10000 media interactions",
        icon="Play", tier="platinum", target=10000,
        metric_fn=lambda c: c.interaction_count,
        condition=lambda c: c.interaction_count >= 10000,
    ),

    # ── List milestones (8 badges) ──
    "lists_1": BadgeDef(
        key="lists_1", label="Cataloger", description="Created 1 list",
        icon="List", tier="bronze", target=1,
        metric_fn=lambda c: c.list_count,
        condition=lambda c: c.list_count >= 1,
    ),
    "lists_5": BadgeDef(
        key="lists_5", label="Organizer", description="Created 5 lists",
        icon="List", tier="bronze", target=5,
        metric_fn=lambda c: c.list_count,
        condition=lambda c: c.list_count >= 5,
    ),
    "lists_10": BadgeDef(
        key="lists_10", label="Curator", description="Created 10 lists",
        icon="List", tier="bronze", target=10,
        metric_fn=lambda c: c.list_count,
        condition=lambda c: c.list_count >= 10,
    ),
    "lists_25": BadgeDef(
        key="lists_25", label="Collector", description="Created 25 lists",
        icon="List", tier="silver", target=25,
        metric_fn=lambda c: c.list_count,
        condition=lambda c: c.list_count >= 25,
    ),
    "lists_50": BadgeDef(
        key="lists_50", label="Master Curator", description="Created 50 lists",
        icon="List", tier="silver", target=50,
        metric_fn=lambda c: c.list_count,
        condition=lambda c: c.list_count >= 50,
    ),
    "lists_100": BadgeDef(
        key="lists_100", label="Archivist", description="Created 100 lists",
        icon="List", tier="gold", target=100,
        metric_fn=lambda c: c.list_count,
        condition=lambda c: c.list_count >= 100,
    ),
    "lists_250": BadgeDef(
        key="lists_250", label="Library Director", description="Created 250 lists",
        icon="List", tier="gold", target=250,
        metric_fn=lambda c: c.list_count,
        condition=lambda c: c.list_count >= 250,
    ),
    "lists_500": BadgeDef(
        key="lists_500", label="Alexandrian", description="Created 500 lists",
        icon="List", tier="platinum", target=500,
        metric_fn=lambda c: c.list_count,
        condition=lambda c: c.list_count >= 500,
    ),

    # ── Workout milestones (8 badges) ──
    "workouts_1": BadgeDef(
        key="workouts_1", label="First Sweat", description="Logged your first workout",
        icon="Dumbbell", tier="special", target=1,
        metric_fn=lambda c: c.workout_count,
        condition=lambda c: c.workout_count >= 1,
    ),
    "workouts_10": BadgeDef(
        key="workouts_10", label="Warmup Done", description="Logged 10 workouts",
        icon="Dumbbell", tier="bronze", target=10,
        metric_fn=lambda c: c.workout_count,
        condition=lambda c: c.workout_count >= 10,
    ),
    "workouts_25": BadgeDef(
        key="workouts_25", label="Consistent", description="Logged 25 workouts",
        icon="Dumbbell", tier="bronze", target=25,
        metric_fn=lambda c: c.workout_count,
        condition=lambda c: c.workout_count >= 25,
    ),
    "workouts_50": BadgeDef(
        key="workouts_50", label="Regular", description="Logged 50 workouts",
        icon="Dumbbell", tier="bronze", target=50,
        metric_fn=lambda c: c.workout_count,
        condition=lambda c: c.workout_count >= 50,
    ),
    "workouts_100": BadgeDef(
        key="workouts_100", label="Dedicated", description="Logged 100 workouts",
        icon="Dumbbell", tier="silver", target=100,
        metric_fn=lambda c: c.workout_count,
        condition=lambda c: c.workout_count >= 100,
    ),
    "workouts_200": BadgeDef(
        key="workouts_200", label="Athlete", description="Logged 200 workouts",
        icon="Dumbbell", tier="silver", target=200,
        metric_fn=lambda c: c.workout_count,
        condition=lambda c: c.workout_count >= 200,
    ),
    "workouts_500": BadgeDef(
        key="workouts_500", label="Iron Will", description="Logged 500 workouts",
        icon="Dumbbell", tier="gold", target=500,
        metric_fn=lambda c: c.workout_count,
        condition=lambda c: c.workout_count >= 500,
    ),
    "workouts_1000": BadgeDef(
        key="workouts_1000", label="Olympian", description="Logged 1000 workouts",
        icon="Dumbbell", tier="platinum", target=1000,
        metric_fn=lambda c: c.workout_count,
        condition=lambda c: c.workout_count >= 1000,
    ),

    # ── Level milestones (8 badges) ──
    "level_2": BadgeDef(
        key="level_2", label="Newcomer", description="Reached level 2",
        icon="Zap", tier="bronze", target=2,
        metric_fn=lambda c: c.level,
        condition=lambda c: c.level >= 2,
    ),
    "level_5": BadgeDef(
        key="level_5", label="Rising Star", description="Reached level 5",
        icon="Zap", tier="bronze", target=5,
        metric_fn=lambda c: c.level,
        condition=lambda c: c.level >= 5,
    ),
    "level_10": BadgeDef(
        key="level_10", label="Established", description="Reached level 10",
        icon="Zap", tier="silver", target=10,
        metric_fn=lambda c: c.level,
        condition=lambda c: c.level >= 10,
    ),
    "level_20": BadgeDef(
        key="level_20", label="Veteran", description="Reached level 20",
        icon="Zap", tier="gold", target=20,
        metric_fn=lambda c: c.level,
        condition=lambda c: c.level >= 20,
    ),
    "level_35": BadgeDef(
        key="level_35", label="Champion", description="Reached level 35",
        icon="Zap", tier="gold", target=35,
        metric_fn=lambda c: c.level,
        condition=lambda c: c.level >= 35,
    ),
    "level_50": BadgeDef(
        key="level_50", label="Elite", description="Reached level 50",
        icon="Zap", tier="platinum", target=50,
        metric_fn=lambda c: c.level,
        condition=lambda c: c.level >= 50,
    ),
    "level_75": BadgeDef(
        key="level_75", label="Legend", description="Reached level 75",
        icon="Zap", tier="platinum", target=75,
        metric_fn=lambda c: c.level,
        condition=lambda c: c.level >= 75,
    ),
    "level_100": BadgeDef(
        key="level_100", label="Transcendent", description="Reached level 100",
        icon="Zap", tier="special", target=100,
        metric_fn=lambda c: c.level,
        condition=lambda c: c.level >= 100,
    ),

    # ── Special & Streaks (8 badges) ──
    "streak_3": BadgeDef(
        key="streak_3", label="Warmup Streak", description="3-day login streak",
        icon="Flame", tier="bronze", target=3,
        metric_fn=lambda c: c.login_streak,
        condition=lambda c: c.login_streak >= 3,
    ),
    "streak_7": BadgeDef(
        key="streak_7", label="Week Warrior", description="7-day login streak",
        icon="Flame", tier="silver", target=7,
        metric_fn=lambda c: c.login_streak,
        condition=lambda c: c.login_streak >= 7,
    ),
    "streak_30": BadgeDef(
        key="streak_30", label="Monthly Dedication", description="30-day login streak",
        icon="Flame", tier="silver", target=30,
        metric_fn=lambda c: c.login_streak,
        condition=lambda c: c.login_streak >= 30,
    ),
    "streak_100": BadgeDef(
        key="streak_100", label="Century Streak", description="100-day login streak",
        icon="Flame", tier="platinum", target=100,
        metric_fn=lambda c: c.login_streak,
        condition=lambda c: c.login_streak >= 100,
    ),
    "first_friend": BadgeDef(
        key="first_friend", label="First Contact", description="Made your first friend",
        icon="UserPlus", tier="special", target=1,
        metric_fn=lambda c: c.friend_count,
        condition=lambda c: c.friend_count >= 1,
    ),
    "friends_5": BadgeDef(
        key="friends_5", label="Popular", description="Made 5 friends",
        icon="Users", tier="silver", target=5,
        metric_fn=lambda c: c.friend_count,
        condition=lambda c: c.friend_count >= 5,
    ),
    "friends_20": BadgeDef(
        key="friends_20", label="Socialite", description="Made 20 friends",
        icon="Users", tier="gold", target=20,
        metric_fn=lambda c: c.friend_count,
        condition=lambda c: c.friend_count >= 20,
    ),
    "perfect_10": BadgeDef(
        key="perfect_10", label="Perfect 10", description="Rated 10 by 5+ users",
        icon="Award", tier="gold", target=5,
        metric_fn=lambda c: c.user_rating_count,
        condition=lambda c: (
            c.user_rating_count >= 5
            and c.avg_user_rating is not None
            and c.avg_user_rating >= 10
        ),
    ),

    # ── Review streak badges (4 badges) ──
    "review_streak_2": BadgeDef(
        key="review_streak_2", label="Weekly Ritual", description="2-week review streak",
        icon="Flame", tier="bronze", target=2,
        metric_fn=lambda c: c.review_streak,
        condition=lambda c: c.review_streak >= 2,
    ),
    "review_streak_4": BadgeDef(
        key="review_streak_4", label="Monthly Critic", description="4-week review streak",
        icon="Flame", tier="silver", target=4,
        metric_fn=lambda c: c.review_streak,
        condition=lambda c: c.review_streak >= 4,
    ),
    "review_streak_8": BadgeDef(
        key="review_streak_8", label="Dedicated Reviewer", description="8-week review streak",
        icon="Flame", tier="gold", target=8,
        metric_fn=lambda c: c.review_streak,
        condition=lambda c: c.review_streak >= 8,
    ),
    "review_streak_26": BadgeDef(
        key="review_streak_26", label="Half-Year Critic", description="26-week review streak",
        icon="Flame", tier="platinum", target=26,
        metric_fn=lambda c: c.review_streak,
        condition=lambda c: c.review_streak >= 26,
    ),

    # ── Workout streak badges (4 badges) ──
    "workout_streak_7": BadgeDef(
        key="workout_streak_7", label="Workout Week", description="7-day workout streak",
        icon="Dumbbell", tier="special", target=7,
        metric_fn=lambda c: c.workout_streak,
        condition=lambda c: c.workout_streak >= 7,
    ),
    "workout_streak_14": BadgeDef(
        key="workout_streak_14", label="Fortnight Fitness", description="14-day workout streak",
        icon="Dumbbell", tier="silver", target=14,
        metric_fn=lambda c: c.workout_streak,
        condition=lambda c: c.workout_streak >= 14,
    ),
    "workout_streak_30": BadgeDef(
        key="workout_streak_30", label="Monthly Grind", description="30-day workout streak",
        icon="Dumbbell", tier="gold", target=30,
        metric_fn=lambda c: c.workout_streak,
        condition=lambda c: c.workout_streak >= 30,
    ),
    "workout_streak_100": BadgeDef(
        key="workout_streak_100", label="Iron Discipline", description="100-day workout streak",
        icon="Dumbbell", tier="platinum", target=100,
        metric_fn=lambda c: c.workout_streak,
        condition=lambda c: c.workout_streak >= 100,
    ),

    # ── Media diversity badges (2 badges) ──
    "media_explorer": BadgeDef(
        key="media_explorer", label="Media Explorer", description="Interacted with 2+ media types",
        icon="Compass", tier="special", target=2,
        metric_fn=lambda c: c.distinct_media_types,
        condition=lambda c: c.distinct_media_types >= 2,
    ),
    "media_omnivore": BadgeDef(
        key="media_omnivore", label="Media Omnivore", description="Interacted with all 4 media types",
        icon="Layers", tier="gold", target=4,
        metric_fn=lambda c: c.distinct_media_types,
        condition=lambda c: c.distinct_media_types >= 4,
    ),

    # ── Review quality badges (2 badges) ──
    "upvotes_5": BadgeDef(
        key="upvotes_5", label="Helpful Voice", description="Received 5+ review upvotes",
        icon="ThumbsUp", tier="silver", target=5,
        metric_fn=lambda c: c.review_upvotes_received,
        condition=lambda c: c.review_upvotes_received >= 5,
    ),
    "upvotes_25": BadgeDef(
        key="upvotes_25", label="Trusted Critic", description="Received 25+ review upvotes",
        icon="ThumbsUp", tier="gold", target=25,
        metric_fn=lambda c: c.review_upvotes_received,
        condition=lambda c: c.review_upvotes_received >= 25,
    ),
}

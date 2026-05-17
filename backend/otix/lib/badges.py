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
    condition: Callable[["BadgeContext"], bool] = field(repr=False)


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
    user_rating_count: int = 0
    avg_user_rating: float | None = None
    friend_count: int = 0


BADGES: dict[str, BadgeDef] = {
    # ── Review milestones ──
    "reviews_10": BadgeDef(
        key="reviews_10", label="Critic", description="Wrote 10 reviews",
        icon="MessageSquare", tier="bronze",
        condition=lambda c: c.review_count >= 10,
    ),
    "reviews_50": BadgeDef(
        key="reviews_50", label="Prolific Critic", description="Wrote 50 reviews",
        icon="MessageSquare", tier="silver",
        condition=lambda c: c.review_count >= 50,
    ),
    "reviews_100": BadgeDef(
        key="reviews_100", label="Review Machine", description="Wrote 100 reviews",
        icon="MessageSquare", tier="gold",
        condition=lambda c: c.review_count >= 100,
    ),
    "reviews_500": BadgeDef(
        key="reviews_500", label="Legendary Critic", description="Wrote 500 reviews",
        icon="MessageSquare", tier="platinum",
        condition=lambda c: c.review_count >= 500,
    ),
    # ── Interaction milestones ──
    "interactions_100": BadgeDef(
        key="interactions_100", label="Consumer", description="100 media interactions",
        icon="Play", tier="bronze",
        condition=lambda c: c.interaction_count >= 100,
    ),
    "interactions_500": BadgeDef(
        key="interactions_500", label="Power User", description="500 media interactions",
        icon="Play", tier="silver",
        condition=lambda c: c.interaction_count >= 500,
    ),
    "interactions_1000": BadgeDef(
        key="interactions_1000", label="Media Mogul", description="1000 media interactions",
        icon="Play", tier="gold",
        condition=lambda c: c.interaction_count >= 1000,
    ),
    # ── List milestones ──
    "lists_10": BadgeDef(
        key="lists_10", label="Curator", description="Created 10 lists",
        icon="List", tier="bronze",
        condition=lambda c: c.list_count >= 10,
    ),
    "lists_50": BadgeDef(
        key="lists_50", label="Master Curator", description="Created 50 lists",
        icon="List", tier="silver",
        condition=lambda c: c.list_count >= 50,
    ),
    "lists_100": BadgeDef(
        key="lists_100", label="Archivist", description="Created 100 lists",
        icon="List", tier="gold",
        condition=lambda c: c.list_count >= 100,
    ),
    # ── Workout milestones ──
    "workouts_50": BadgeDef(
        key="workouts_50", label="Regular", description="50 workouts logged",
        icon="Dumbbell", tier="bronze",
        condition=lambda c: c.workout_count >= 50,
    ),
    "workouts_200": BadgeDef(
        key="workouts_200", label="Athlete", description="200 workouts logged",
        icon="Dumbbell", tier="silver",
        condition=lambda c: c.workout_count >= 200,
    ),
    "workouts_500": BadgeDef(
        key="workouts_500", label="Iron Will", description="500 workouts logged",
        icon="Dumbbell", tier="gold",
        condition=lambda c: c.workout_count >= 500,
    ),
    # ── Level milestones ──
    "level_5": BadgeDef(
        key="level_5", label="Rising Star", description="Reached level 5",
        icon="Zap", tier="bronze",
        condition=lambda c: c.level >= 5,
    ),
    "level_10": BadgeDef(
        key="level_10", label="Established", description="Reached level 10",
        icon="Zap", tier="silver",
        condition=lambda c: c.level >= 10,
    ),
    "level_20": BadgeDef(
        key="level_20", label="Veteran", description="Reached level 20",
        icon="Zap", tier="gold",
        condition=lambda c: c.level >= 20,
    ),
    "level_50": BadgeDef(
        key="level_50", label="Elite", description="Reached level 50",
        icon="Zap", tier="platinum",
        condition=lambda c: c.level >= 50,
    ),
    "level_100": BadgeDef(
        key="level_100", label="Transcendent", description="Reached level 100",
        icon="Zap", tier="platinum",
        condition=lambda c: c.level >= 100,
    ),
    # ── Special badges ──
    "first_review": BadgeDef(
        key="first_review", label="First Words", description="Wrote your first review",
        icon="Feather", tier="special",
        condition=lambda c: c.review_count >= 1,
    ),
    "first_friend": BadgeDef(
        key="first_friend", label="Social Butterfly", description="Made your first friend",
        icon="UserPlus", tier="special",
        condition=lambda c: c.friend_count >= 1,
    ),
    "streak_7": BadgeDef(
        key="streak_7", label="Week Warrior", description="7-day login streak",
        icon="Flame", tier="special",
        condition=lambda c: c.login_streak >= 7,
    ),
    "streak_30": BadgeDef(
        key="streak_30", label="Monthly Dedication", description="30-day login streak",
        icon="Flame", tier="silver",
        condition=lambda c: c.login_streak >= 30,
    ),
    "perfect_10": BadgeDef(
        key="perfect_10", label="Perfect 10", description="Rated 10 by 5+ users",
        icon="Award", tier="gold",
        condition=lambda c: (
            c.user_rating_count >= 5
            and c.avg_user_rating is not None
            and c.avg_user_rating >= 10
        ),
    ),
}

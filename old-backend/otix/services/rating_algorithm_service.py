"""Rating algorithm: blends community ratings (90%) with external ratings (10%).

All outputs are on a **0–100 scale**.

Algorithm:
- Community (Otix user) ratings: 90% weight when available
- External ratings: 10% weight, equal weight across providers
- Paired critic+user providers (IGDB) use gap-based blending:
    - Gap >= 3.0 (1–10) + user > critic → critic ignored, user boosted 5%
    - Gap >= 3.0 + critic > user → critic ignored, user used as-is
    - 0 < gap < 3.0 → linear interpolation, critic weight 0.5 → 0
    - No gap → 50/50
- Falls back to 100% external when no community ratings exist, so every
  media item with any rating data gets an Otix score.
"""

from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import ExternalRating
from otix.domain.media import MediaItem

# Paired (critic_provider, user_provider) keys to blend together
_CRITIC_USER_PAIRS: dict[str, tuple[str, str]] = {
    "igdb": ("igdb_critic", "igdb_user"),
}

# On 1–10: at or above this gap, critic weight drops to 0
_CRITIC_GAP_THRESHOLD = 3.0

# Boost applied to user score when critics are low but users are high
_USER_HIGH_BOOST = 1.05


def _normalize(score: float, max_score: float) -> float:
    return score / max_score * 10


def _blend_pair(critic_score: float, user_score: float) -> float:
    """Blend a critic+user pair using gap-based logic.

    All values on 1–10 scale.
    """
    gap = abs(critic_score - user_score)

    if gap >= _CRITIC_GAP_THRESHOLD:
        if user_score > critic_score:
            return min(user_score * _USER_HIGH_BOOST, 10.0)
        return user_score

    if gap == 0:
        return (critic_score + user_score) / 2

    critic_weight = max(0.0, 0.5 * (1 - gap / _CRITIC_GAP_THRESHOLD))
    user_weight = 1.0 - critic_weight
    return critic_weight * critic_score + user_weight * user_score


def _compute_external_composite(normalized: list[dict]) -> float | None:
    """Average all external provider scores into a single 1–10 value."""
    if not normalized:
        return None

    provider_scores: dict[str, float] = {}
    consumed: set[str] = set()

    for pair_key, (critic_prov, user_prov) in _CRITIC_USER_PAIRS.items():
        critic = next((r for r in normalized if r["provider"] == critic_prov), None)
        user = next((r for r in normalized if r["provider"] == user_prov), None)

        if critic and user:
            provider_scores[pair_key] = _blend_pair(critic["score"], user["score"])
            consumed.update({critic_prov, user_prov})
        elif user:
            provider_scores[pair_key] = user["score"]
            consumed.add(user_prov)
        elif critic:
            provider_scores[pair_key] = critic["score"]
            consumed.add(critic_prov)

    for r in normalized:
        if r["provider"] not in consumed:
            provider_scores[r["provider"]] = r["score"]

    if not provider_scores:
        return None

    return sum(provider_scores.values()) / len(provider_scores)


async def compute_overall_rating(
    session: AsyncSession,
    media_item_id: str,
) -> tuple[float | None, str]:
    """Compute overall Otix rating for *media_item_id*.

    Returns a ***0–100*** ``(score, source)`` where *source* is ``"community"``
    when real Otix user ratings exist, or ``"external"`` when derived from
    external sources only.
    """
    item = await session.get(MediaItem, media_item_id)
    if item is None:
        return None, "empty"

    # External ratings — lightweight projection, no ORM overhead
    rows = await session.execute(
        select(
            ExternalRating.provider,
            ExternalRating.score,
            ExternalRating.max_score,
        ).where(
            ExternalRating.media_item_id == media_item_id,
            ExternalRating.max_score > 0,
        )
    )
    raw = rows.all()

    normalized = [{"provider": p, "score": _normalize(s, m)} for p, s, m in raw]
    external_composite = _compute_external_composite(normalized)

    has_community = item.rating_count > 0 and item.avg_rating is not None

    if has_community and external_composite is not None:
        overall = 0.9 * item.avg_rating + 0.1 * external_composite
        source = "community"
    elif has_community:
        overall = item.avg_rating
        source = "community"
    elif external_composite is not None:
        overall = external_composite
        source = "external"
    else:
        return None, "empty"

    # 0–100 scale
    raw_score = max(1.0, min(10.0, overall))
    return round(raw_score * 10, 1), source


async def compute_and_store_overall_rating(
    session: AsyncSession,
    media_item_id: str,
) -> tuple[float | None, str]:
    """Compute overall rating for *media_item_id* and persist on ``MediaItem``.

    Call this from any service that mutates ratings (user upsert / delete,
    external rating sync) so the cached column stays in sync.
    """
    score, source = await compute_overall_rating(session, media_item_id)
    await session.execute(
        update(MediaItem)
        .where(MediaItem.id == media_item_id)
        .values(overall_rating=score, overall_rating_source=source)
    )
    return score, source

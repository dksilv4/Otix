"""Epic Games Store — weekly free game notification task.

Polls Epic's public promotions endpoint weekly, cross-references against
users' libraries, and sends Otix notifications for unclaimed free games.

Architecture:
    1. Fetch current free promotions from Epic Store GraphQL API.
    2. For each free game, check if we've already seen it (EpicFreeGameClaim).
    3. For new promotions, find all users with active Epic integrations.
    4. For each user, check if the game is already in their library.
    5. Create Notification + push real-time via Redis pub/sub.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import httpx
import structlog
from sqlalchemy import select

from otix.domain.epic_integration import EpicFreeGameClaim, UserEpicGame
from otix.domain.notification import Notification
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async

logger = structlog.get_logger()

# ── Epic Store GraphQL constants ─────────────────────────────────────

EPIC_GRAPHQL_URL = "https://store.epicgames.com/graphql"

_FREE_PROMOTIONS_QUERY = {
    "query": """
    query FreeGames($locale: String!, $country: String!) {
        Catalog {
            searchStore(
                allowCountries: $country
                category: "freegames"
                count: 20
                locale: $locale
                sortBy: "effectiveDate"
                sortDir: "desc"
            ) {
                elements {
                    id
                    title
                    productSlug
                    offerMappings {
                        pageSlug
                    }
                    promotions {
                        promotionalOffers {
                            promotionalOffers {
                                startDate
                                endDate
                                discountSetting {
                                    discountType
                                    discountPercentage
                                }
                            }
                        }
                        upcomingPromotionalOffers {
                            promotionalOffers {
                                startDate
                                endDate
                                discountSetting {
                                    discountType
                                    discountPercentage
                                }
                            }
                        }
                    }
                    price {
                        totalPrice {
                            discountPrice
                            originalPrice
                            fmtPrice {
                                originalPrice
                                discountPrice
                            }
                        }
                    }
                    seller {
                        name
                    }
                }
            }
        }
    }
    """,
    "variables": {"locale": "en-US", "country": "US"},
}


async def fetch_free_promotions() -> list[dict]:
    """Fetch current free game promotions from Epic Store GraphQL API.

    Returns a list of free game offers currently available.
    Each item has: id, title, productSlug, promotions, price info.
    """
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                EPIC_GRAPHQL_URL,
                json=_FREE_PROMOTIONS_QUERY,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()

        elements = (
            data.get("data", {})
            .get("Catalog", {})
            .get("searchStore", {})
            .get("elements", [])
        )

        # Filter to only currently-free promotions (100% off and active)
        now = datetime.now(UTC)
        free_games = []
        for el in elements:
            offers = (
                el.get("promotions", {})
                .get("promotionalOffers", [])
            )
            for offer_group in offers:
                for offer in offer_group.get("promotionalOffers", []):
                    discount = offer.get("discountSetting", {})
                    if discount.get("discountPercentage") != 0:
                        continue  # not 100% off

                    start_str = offer.get("startDate")
                    end_str = offer.get("endDate")
                    if not start_str or not end_str:
                        continue

                    start = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                    end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))

                    if start <= now <= end:
                        page_slug = None
                        mappings = el.get("offerMappings", [])
                        if mappings:
                            page_slug = mappings[0].get("pageSlug")

                        price_data = el.get("price", {}).get("totalPrice", {})
                        original_price = None
                        if price_data.get("fmtPrice", {}).get("originalPrice"):
                            original_price = price_data["fmtPrice"]["originalPrice"]

                        free_games.append({
                            "epic_app_id": el["id"],
                            "title": el.get("title", "Unknown Game"),
                            "product_slug": page_slug or el.get("productSlug"),
                            "original_price": original_price,
                            "start_date": start,
                            "end_date": end,
                        })
                        break  # one free offer per element is enough

        logger.info("fetched epic free promotions", count=len(free_games))
        return free_games

    except Exception as e:
        logger.exception("failed to fetch epic free promotions", error=str(e))
        return []


# ── Main task ────────────────────────────────────────────────────────

async def _check_epic_free_games() -> dict:
    """Main routine: check for new free games and notify users."""
    free_games = await fetch_free_promotions()
    if not free_games:
        return {"status": "no_promotions", "games_found": 0, "notifications_sent": 0}

    # Unique promotion run ID (ISO week)
    now = datetime.now(UTC)
    promo_week = now.strftime("freegame-%Y-W%V")
    total_notifications = 0
    total_new_games = 0

    from otix.infrastructure.database import async_session

    async with async_session() as db:
        for game in free_games:
            # Check if this promotion game is already recorded
            existing = await db.scalar(
                select(EpicFreeGameClaim).where(
                    EpicFreeGameClaim.promotion_id == promo_week,
                    EpicFreeGameClaim.epic_app_id == game["epic_app_id"],
                ),
            )
            if existing:
                continue

            # Create claim record
            promotion_url = None
            if game.get("product_slug"):
                promotion_url = f"https://store.epicgames.com/en-US/p/{game['product_slug']}"

            claim = EpicFreeGameClaim(
                promotion_id=promo_week,
                epic_app_id=game["epic_app_id"],
                title=game["title"],
                original_price=game.get("original_price"),
                promotion_url=promotion_url,
                starts_at=game.get("start_date"),
                ends_at=game.get("end_date"),
                notified_user_ids=[],
            )
            db.add(claim)
            await db.flush()
            total_new_games += 1

            # Find all users with active Epic integrations
            users_result = await db.execute(
                select(User).where(
                    User.epic_id.isnot(None),
                ),
            )
            epic_users = list(users_result.scalars().all())

            for user in epic_users:
                # Skip if this user already owns the game
                owned = await db.scalar(
                    select(UserEpicGame).where(
                        UserEpicGame.user_id == user.id,
                        UserEpicGame.epic_app_id == game["epic_app_id"],
                    ),
                )
                if owned:
                    continue

                # Check if already notified
                if user.id in claim.notified_user_ids:
                    continue

                # Create notification
                body = (
                    f"{game['title']} is free on Epic Games Store! "
                    f"{'Normally ' + game['original_price'] + '. ' if game.get('original_price') else ''}"
                    f"Claim before {game['end_date'].strftime('%b %d, %Y')}."
                )

                notification = Notification(
                    user_id=user.id,
                    type="epic_free_game",
                    title=f"🎮 Free Game: {game['title']}",
                    body=body,
                    metadata_json={
                        "epic_app_id": game["epic_app_id"],
                        "promotion_id": promo_week,
                        "promotion_url": promotion_url,
                        "original_price": game.get("original_price"),
                        "ends_at": game["end_date"].isoformat() if game.get("end_date") else None,
                        "claimed": False,
                    },
                )
                db.add(notification)
                claim.notified_user_ids = claim.notified_user_ids + [user.id]
                total_notifications += 1

            await db.flush()

        await db.commit()

    logger.info(
        "epic free games check complete",
        games_found=len(free_games),
        new_games=total_new_games,
        notifications_sent=total_notifications,
    )
    return {
        "status": "ok",
        "games_found": len(free_games),
        "new_games_recorded": total_new_games,
        "notifications_sent": total_notifications,
    }


# ── Celery task ──────────────────────────────────────────────────────

from otix.infrastructure.celery import app as _celery_app  # noqa: E402


@_celery_app.task(
    name="promotions.epic.free_games",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    autoretry_for=(Exception,),
)
def check_epic_free_games_task(self) -> dict | None:
    """Check Epic Store for weekly free games and notify users."""
    return run_async(_check_epic_free_games())

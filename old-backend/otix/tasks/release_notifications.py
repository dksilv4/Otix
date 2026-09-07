# TODO: Review this file
"""Check watchlisted items for newly released media and notify users.

Triggered by an ``after_insert`` SQLAlchemy signal on ``MediaRelease`` —
whenever a media item is synced or re-hydrated and a past/current release
date is inserted, watchlisters are notified immediately.

Re-syncs happen naturally via the catalog hydration pipeline (every ~30 min),
so future-dated releases are caught automatically when their date passes
and the item is next refreshed.
"""
from __future__ import annotations

from datetime import date

import structlog
from sqlalchemy import text

from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async
from otix.services.notification_service import NotificationService

logger = structlog.get_logger()

# ── Human-readable labels for release types ────────────────────────

_RELEASE_TYPE_LABELS: dict[str, str] = {
    "premiere": "Premiere",
    "theatrical_limited": "Limited Theatrical",
    "theatrical": "Theaters",
    "digital": "Digital",
    "physical": "Physical",
    "tv": "TV",
}


# ── Helpers ─────────────────────────────────────────────────────────


async def _notify_watchlisters(
    media_item_id: str,
    media_title: str,
    media_slug: str,
    media_type: str | None,
    release_type_str: str,
    release_date: date,
    country_code: str,
) -> int:
    """Create ``release_available`` notifications for all watchlisters of *media_item_id*.

    Each (user, media_item, release_type) tuple is guarded by ``NOT EXISTS``
    so duplicates are never sent — safe to call on re-hydration.
    """
    query = text("""
        SELECT umi.user_id
        FROM user_media_interactions umi
        WHERE umi.media_item_id = :media_item_id
          AND umi.interaction_type = 'watchlisted'
          AND NOT EXISTS (
              SELECT 1 FROM notifications n
              WHERE n.user_id = umi.user_id
                AND n.type = 'release_available'
                AND n.metadata_json->>'media_item_id' = :media_item_id2
                AND n.metadata_json->>'release_type' = :release_type
          )
    """)

    async with async_session() as session:
        rows = (
            await session.execute(
                query,
                {
                    "media_item_id": media_item_id,
                    "media_item_id2": media_item_id,
                    "release_type": release_type_str,
                },
            )
        ).mappings().all()

        if not rows:
            return 0

        label = _RELEASE_TYPE_LABELS.get(release_type_str, release_type_str.replace("_", " ").title())
        verb = "is now available on" if release_date <= date.today() else "comes to"
        body = f"{media_title} {verb} {label}"

        meta = {
            "media_item_id": media_item_id,
            "media_title": media_title,
            "media_slug": media_slug,
            "media_type": media_type or "",
            "release_type": release_type_str,
            "release_date": str(release_date),
            "country_code": country_code,
        }

        svc = NotificationService(session)
        for row in rows:
            await svc.create(
                user_id=row["user_id"],
                type_="release_available",
                title="Now Available",
                body=body,
                metadata_json=meta,
            )

        await session.commit()
        logger.info(
            "notified watchlisters of new release",
            media_item_id=media_item_id,
            release_type=release_type_str,
            user_count=len(rows),
        )
        return len(rows)


# ── Task (triggered by after_insert signal on MediaRelease) ─────────


@app.task(
    name="notifications.check_media_release",
    bind=True,
    max_retries=1,
    default_retry_delay=10,
)
def check_media_release_task(self, media_item_id: str, release_type_str: str) -> dict:
    """Check if a specific release should trigger notifications for watchlisters."""
    return run_async(_check_media_release(media_item_id, release_type_str))


async def _check_media_release(media_item_id: str, release_type_str: str) -> dict:
    from otix.domain.media import MediaItem

    async with async_session() as session:
        item = await session.get(MediaItem, media_item_id)
        if item is None:
            logger.warning("media item not found for release notification", media_item_id=media_item_id)
            return {"notifications_created": 0}

        row = (
            await session.execute(
                text("""
                    SELECT country_code, release_date
                    FROM media_releases
                    WHERE media_item_id = :media_item_id
                      AND release_type = :release_type
                      AND release_date IS NOT NULL
                    ORDER BY release_date ASC
                    LIMIT 1
                """),
                {"media_item_id": media_item_id, "release_type": release_type_str},
            )
        ).mappings().one_or_none()

        if row is None:
            logger.warning("no release row found for notification", media_item_id=media_item_id, release_type=release_type_str)
            return {"notifications_created": 0}

    created = await _notify_watchlisters(
        media_item_id=media_item_id,
        media_title=item.title,
        media_slug=item.slug,
        media_type=item.media_type,
        release_type_str=release_type_str,
        release_date=row["release_date"],
        country_code=row["country_code"],
    )

    return {"notifications_created": created}

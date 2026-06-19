"""Epic Games Store library ingestion & matching engine.

Pipeline per game:

    ┌─────────────┐
    │ Epic Payload │
    └──────┬──────┘
           ▼
    ┌──────────────┐   yes   ┌──────────────────┐
    │ ExternalID    │────────►│ Link UserEpicGame│
    │ provider=epic │         │ → media_item_id  │
    └──────────────┘         └──────────────────┘
           │ no
           ▼
    ┌──────────────┐
    │ IGDB search   │────────► Sync IGDB game ──► Create ExternalID(epic)
    │ by title      │                             & link
    └──────────────┘
           │ no match
           ▼
    ┌──────────────────┐
    │ Store as unmatched│
    │ (media_item_id=null)
    └──────────────────┘

After all games processed, async-enqueue IGDB/SteamGridDB enrichment.
"""

from __future__ import annotations

import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.epic_integration import UserEpicGame
from otix.domain.media import ExternalID, MediaItem
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.schemas.epic import (
    EpicGamePayload,
    EpicGameResult,
    EpicLibraryPushResponse,
)
from otix.schemas.media import ExternalIDRef
from otix.services.game_matcher import GameMatcher, GameMatchRequest
from otix.services.external_id_service import ExternalIDService

logger = structlog.get_logger()

BATCH_SIZE = 100


# ── Public entry point ───────────────────────────────────────────────

async def ingest_epic_library(
    db: AsyncSession,
    user: User,
    account_id: str,
    display_name: str | None,
    games: list[EpicGamePayload],
) -> EpicLibraryPushResponse:
    """Main ingestion pipeline.

    Steps:
    1. Store/update Epic account info on User.
    2. Deduplicate payload → upsert UserEpicGame rows.
    3. For each game, run the 3-stage matching pipeline.
    4. Return result summary.
    """
    # ── 1. Update user Epic account info ──────────────────────────────
    user.epic_id = account_id
    if display_name:
        user.epic_display_name = display_name

    # ── 2. Deduplicate by epic_app_id (last wins) ─────────────────────
    seen: dict[str, EpicGamePayload] = {}
    for g in games:
        seen[g.epic_app_id] = g
    unique_games = list(seen.values())
    total = len(unique_games)

    logger.info(
        "ingesting epic library",
        user_id=user.id,
        account_id=account_id,
        raw_count=len(games),
        unique_count=total,
    )

    # ── 3. Pre-fetch existing ExternalID matches for all epic_app_ids ──
    epic_app_ids = [g.epic_app_id for g in unique_games]
    existing_match_map = await _get_existing_matches(db, epic_app_ids)
    # existing_match_map: {epic_app_id: media_item_id}

    # ── 4. Pre-fetch existing UserEpicGame rows ───────────────────────
    existing_rows = await _get_existing_user_games(db, user.id, epic_app_ids)
    # existing_rows: {epic_app_id: UserEpicGame}

    # ── 5. Process each game ──────────────────────────────────────────
    results: list[EpicGameResult] = []
    matched = created = unmatched = failed = 0

    for game in unique_games:
        result, media_item_id = await _process_single_game(
            db, user, game, existing_match_map, existing_rows,
        )
        results.append(result)
        if result.status == "matched":
            matched += 1
        elif result.status == "created":
            created += 1
        elif result.status == "unmatched":
            unmatched += 1
        else:
            failed += 1

    await db.flush()

    # ── 6. Remove games the user no longer owns (cleanup) ─────────────
    incoming_set = set(epic_app_ids)
    stale_ids = [
        app_id
        for app_id in existing_rows
        if app_id not in incoming_set
    ]
    if stale_ids:
        await db.execute(
            delete(UserEpicGame).where(
                UserEpicGame.user_id == user.id,
                UserEpicGame.epic_app_id.in_(stale_ids),
            ),
        )
        logger.info("removed stale epic games", user_id=user.id, count=len(stale_ids))

    await db.commit()

    # ── 7. Trigger async enrichment for unmatched/created games ───────
    unmatched_results = [r for r in results if r.status == "unmatched"]
    created_results = [r for r in results if r.status == "created"]
    if unmatched_results:
        _enqueue_igdb_resolution.delay(user.id)

    logger.info(
        "epic library ingestion complete",
        user_id=user.id,
        matched=matched,
        created=created,
        unmatched=unmatched,
        failed=failed,
        total=total,
    )

    return EpicLibraryPushResponse(
        account_id=account_id,
        matched=matched,
        created=created,
        unmatched=unmatched,
        failed=failed,
        total=total,
        results=results,
    )


# ── Per-game matching pipeline ───────────────────────────────────────

async def _process_single_game(
    db: AsyncSession,
    user: User,
    game: EpicGamePayload,
    existing_match_map: dict[str, str],
    existing_rows: dict[str, UserEpicGame],
) -> tuple[EpicGameResult, str | None]:
    """Run the 3-stage matching for one game.

    Stage 1 — Local ExternalID match
    Stage 2 — IGDB search by title
    Stage 3 — Store as unmatched
    """
    epic_app_id = game.epic_app_id

    # ── Stage 1: Local ExternalID check ───────────────────────────────
    media_item_id = existing_match_map.get(epic_app_id)
    match_type: str | None = None

    if media_item_id:
        match_type = "local"
        await _upsert_user_game(
            db, user.id, game, media_item_id, existing_rows,
        )
        logger.debug("matched locally", epic_app_id=epic_app_id, media_item_id=media_item_id)
        return (
            EpicGameResult(
                epic_app_id=epic_app_id,
                title=game.title,
                status="matched",
                media_item_id=media_item_id,
                match_type=match_type,
            ),
            media_item_id,
        )

    # ── Stage 2: GameMatcher ──────────────────────────────────────────
    try:
        redis = await get_redis()
        matcher = GameMatcher(db, redis)
        request = GameMatchRequest(
            title=game.title,
            developer=game.developer,
            publisher=game.publisher,
            platforms=[game.platform] if game.platform else None,
            external_ids=[ExternalIDRef(source="epic", id=epic_app_id)],
        )
        gm_result = await matcher.match_single(request)
        if gm_result.confidence > 0 and gm_result.media_item_id:
            media_item_id = gm_result.media_item_id
            # Persist Epic ExternalID for future Stage 1 lookups
            eid_service = ExternalIDService(db)
            await eid_service.upsert("epic", epic_app_id, "media_item", media_item_id)
            await _upsert_user_game(
                db, user.id, game, media_item_id, existing_rows,
            )
            logger.debug("matched via game matcher", epic_app_id=epic_app_id, media_item_id=media_item_id)
            return (
                EpicGameResult(
                    epic_app_id=epic_app_id,
                    title=game.title,
                    status="created" if gm_result.is_new else "matched",
                    media_item_id=media_item_id,
                    match_type=gm_result.match_type,
                ),
                media_item_id,
            )
    except Exception:
        logger.exception("game matcher failed for epic game", epic_app_id=epic_app_id)
        # Fall through to unmatched

    # ── Stage 3: Unmatched ────────────────────────────────────────────
    await _upsert_user_game(db, user.id, game, media_item_id=None, existing_rows=existing_rows)
    logger.debug("no match found, stored unmatched", epic_app_id=epic_app_id)
    return (
        EpicGameResult(
            epic_app_id=epic_app_id,
            title=game.title,
            status="unmatched",
        ),
        None,
    )


# ── DB helpers ───────────────────────────────────────────────────────

async def _get_existing_matches(
    db: AsyncSession,
    epic_app_ids: list[str],
) -> dict[str, str]:
    """Build {epic_app_id: media_item_id} map from ExternalID table."""
    if not epic_app_ids:
        return {}

    result = await db.execute(
        select(ExternalID).where(
            ExternalID.provider == "epic",
            ExternalID.external_id.in_(epic_app_ids),
            ExternalID.entity_type == "media_item",
        ),
    )
    return {
        ext.external_id: ext.entity_id
        for ext in result.scalars().all()
    }


async def _get_existing_user_games(
    db: AsyncSession,
    user_id: str,
    epic_app_ids: list[str],
) -> dict[str, UserEpicGame]:
    """Build {epic_app_id: UserEpicGame} map for the user."""
    if not epic_app_ids:
        return {}

    result = await db.execute(
        select(UserEpicGame).where(
            UserEpicGame.user_id == user_id,
            UserEpicGame.epic_app_id.in_(epic_app_ids),
        ),
    )
    return {g.epic_app_id: g for g in result.scalars().all()}


async def _upsert_user_game(
    db: AsyncSession,
    user_id: str,
    game: EpicGamePayload,
    media_item_id: str | None,
    existing_rows: dict[str, UserEpicGame],
) -> UserEpicGame:
    """Create or update a UserEpicGame row."""
    row = existing_rows.get(game.epic_app_id)
    if row is None:
        row = UserEpicGame(
            user_id=user_id,
            epic_app_id=game.epic_app_id,
            title=game.title,
            developer=game.developer,
            publisher=game.publisher,
            is_installed=game.is_installed,
            install_size=game.install_size,
            platform=game.platform or "Windows",
            last_played=game.last_played,
            media_item_id=media_item_id,
        )
        db.add(row)
    else:
        row.title = game.title
        row.developer = game.developer
        row.publisher = game.publisher
        row.is_installed = game.is_installed
        row.install_size = game.install_size
        row.platform = game.platform or "Windows"
        row.last_played = game.last_played
        row.media_item_id = media_item_id

    return row


# ── Celery task (deferred) ──────────────────────────────────────────

from otix.infrastructure.celery import app as _celery_app  # noqa: E402


@_celery_app.task(
    name="epic.resolve_unmatched",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def _enqueue_igdb_resolution(self, user_id: str) -> dict | None:
    """Deferred task: resolve unmatched Epic games via IGDB."""
    return run_async(_resolve_unmatched_games(user_id))


async def _resolve_unmatched_games(user_id: str) -> dict | None:
    """Step through unmatched UserEpicGame rows and try IGDB resolution."""
    from otix.infrastructure.database import async_session

    async with async_session() as db:
        # Fetch unmatched
        result = await db.execute(
            select(UserEpicGame).where(
                UserEpicGame.user_id == user_id,
                UserEpicGame.media_item_id.is_(None),
            ),
        )
        unmatched = list(result.scalars().all())
        if not unmatched:
            return {"resolved": 0, "remaining": 0, "total": 0}

        total = len(unmatched)
        redis = await get_redis()

        # Build GameMatchRequests for all unmatched games
        requests = [
            GameMatchRequest(
                title=game.title,
                developer=game.developer,
                publisher=game.publisher,
                platforms=[game.platform] if game.platform else None,
                external_ids=[ExternalIDRef(source="epic", id=game.epic_app_id)],
            )
            for game in unmatched
        ]

        matcher = GameMatcher(db, redis)
        match_results = await matcher.match_batch(requests)

        resolved = 0
        eid_service = ExternalIDService(db)

        for game, match in zip(unmatched, match_results):
            if match.confidence > 0 and match.media_item_id:
                game.media_item_id = match.media_item_id
                resolved += 1
                # Create epic ExternalID so next scan is instant
                await eid_service.upsert(
                    "epic",
                    game.epic_app_id,
                    "media_item",
                    match.media_item_id,
                )
            await db.flush()

        await db.commit()
        remaining = total - resolved

        logger.info(
            "epic-igdb resolve complete",
            user_id=user_id,
            resolved=resolved,
            remaining=remaining,
            total=total,
        )
        return {
            "resolved": resolved,
            "failed": 0,
            "remaining": remaining,
            "total": total,
        }


# ── Library queries ──────────────────────────────────────────────────

async def get_epic_library(
    db: AsyncSession,
    user_id: str,
    cursor: str | None = None,
    limit: int = 48,
) -> tuple[list[UserEpicGame], bool, str | None]:
    """Paginated Epic library, matched games first, then by last_played."""
    query = (
        select(UserEpicGame)
        .where(UserEpicGame.user_id == user_id)
        .order_by(
            UserEpicGame.media_item_id.is_(None).asc(),  # matched first
            UserEpicGame.last_played.desc().nulls_last(),
            UserEpicGame.title.asc(),
        )
        .limit(limit + 1)
    )

    # Cursor: {last_played_ts}__{title}
    if cursor:
        try:
            parts = cursor.split("__", 1)
            cursor_last_played = parts[0] if parts[0] != "None" else None
            cursor_title = parts[1] if len(parts) > 1 else ""
            query = query.where(
                func.coalesce(UserEpicGame.last_played, "1970-01-01").desc() < cursor_last_played
                if cursor_last_played
                else UserEpicGame.title > cursor_title,
            )
        except Exception:
            pass

    result = await db.execute(query)
    rows = list(result.scalars().all())
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        lp = last.last_played.isoformat() if last.last_played else "None"
        next_cursor = f"{lp}__{last.title}"

    return rows, has_more, next_cursor


async def get_epic_library_stats(
    db: AsyncSession,
    user_id: str,
) -> dict:
    """Get Epic library statistics for the user."""
    counts = await db.execute(
        select(
            func.count(UserEpicGame.id),
            func.count(UserEpicGame.media_item_id),
            func.max(UserEpicGame.updated_at),
        ).where(UserEpicGame.user_id == user_id),
    )
    total, matched_count, last_scanned = counts.one()

    return {
        "game_count": total or 0,
        "matched_count": matched_count or 0,
        "unmatched_count": (total or 0) - (matched_count or 0),
        "last_scanned_at": last_scanned.isoformat() if last_scanned else None,
    }

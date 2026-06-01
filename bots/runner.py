from __future__ import annotations

import asyncio
import random
import signal
import time

import structlog

from bots.bot import Bot
from bots.client import OtixClient
from bots.config import (
    BOT_ACTIVE_POOL,
    BOT_COOLDOWN_MAX,
    BOT_COOLDOWN_MIN,
    BOT_COUNT,
    STARTUP_STAGGER,
)

logger = structlog.get_logger()


class Runner:
    """Spawns N bots sharing a single httpx.AsyncClient.

    Only BOT_ACTIVE_POOL bots act concurrently (gated by a semaphore).
    Each bot runs a coherent multi-step session, then rests during a
    cooldown period scaled by the bot's chronotype and activity tier.
    """

    def __init__(self, count: int = BOT_COUNT) -> None:
        self.count = count
        self.client = OtixClient()
        self.bots: list[Bot] = []
        self._tasks: list[asyncio.Task[None]] = []
        self._shutdown = asyncio.Event()
        self._start_time: float = 0.0
        self._session_counts: dict[str, int] = {}
        self._error_counts: dict[str, int] = {}
        self._active_slots = asyncio.Semaphore(BOT_ACTIVE_POOL)

    async def run(self) -> None:
        logger.info("runner.starting",
                     bot_count=self.count,
                     active_pool=BOT_ACTIVE_POOL)
        self._start_time = time.monotonic()

        await self.client.start()
        await self._wait_for_api()

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(
                    sig, lambda: asyncio.create_task(self.shutdown())
                )
            except NotImplementedError:
                pass

        # Staggered startup
        stagger = STARTUP_STAGGER / max(self.count, 1)
        started = 0
        for i in range(self.count):
            bot = Bot(self.client, i + 1)
            self.bots.append(bot)
            task = asyncio.create_task(self._run_bot(bot))
            self._tasks.append(task)
            started += 1

            if started % 100 == 0:
                logger.info("runner.startup_progress", started=started, total=self.count)

            if i < self.count - 1:
                await asyncio.sleep(stagger)

        elapsed = time.monotonic() - self._start_time
        logger.info("runner.all_started",
                     bot_count=self.count,
                     startup_seconds=round(elapsed, 1))

        stats_task = asyncio.create_task(self._stats_reporter())

        await self._shutdown.wait()

        stats_task.cancel()
        logger.info("runner.shutting_down", bot_count=self.count)
        await self._stop_all()
        logger.info("runner.stopped")

    async def _wait_for_api(self, max_retries: int = 30, interval: float = 2.0) -> None:
        logger.info("runner.waiting_for_api")
        for i in range(max_retries):
            try:
                r = await self.client.client.get("/health")
                if r.status_code == 200:
                    logger.info("runner.api_ready")
                    return
            except Exception:
                pass
            remaining = (max_retries - i) * interval
            logger.info("runner.api_not_ready", retry=i + 1, max_retries=max_retries)
            await asyncio.sleep(interval)
        logger.warning("runner.api_not_ready_proceeding")

    async def shutdown(self) -> None:
        self._shutdown.set()

    async def _run_bot(self, bot: Bot) -> None:
        """Register/login the bot, then loop: session → per-bot cooldown."""
        try:
            async with self._active_slots:
                ok = await bot.start()
            if not ok:
                logger.error("runner.bot_start_failed", index=bot.index)
                return

            while not self._shutdown.is_set():
                async with self._active_slots:
                    if self._shutdown.is_set():
                        break
                    try:
                        await asyncio.wait_for(bot.run_session(), timeout=120.0)
                    except asyncio.TimeoutError:
                        logger.warning("bot.session_timeout", name=bot.display_name)
                        self._error_counts[bot.username] = self._error_counts.get(bot.username, 0) + 1
                    except Exception:
                        logger.exception("bot.session_error", name=bot.display_name)
                        self._error_counts[bot.username] = self._error_counts.get(bot.username, 0) + 1

                    self._session_counts[bot.username] = self._session_counts.get(bot.username, 0) + 1

                # Per-bot cooldown: scaled by chronotype and activity tier
                multiplier = bot.cooldown_multiplier()
                cooldown = random.uniform(BOT_COOLDOWN_MIN, BOT_COOLDOWN_MAX) * multiplier
                try:
                    await asyncio.wait_for(self._shutdown.wait(), timeout=cooldown)
                    break
                except asyncio.TimeoutError:
                    pass

        except Exception:
            logger.exception("bot.fatal", name=bot.display_name)
        finally:
            await bot.stop()

    async def _stats_reporter(self) -> None:
        """Print aggregate stats every 60 seconds."""
        while not self._shutdown.is_set():
            try:
                await asyncio.wait_for(self._shutdown.wait(), timeout=60.0)
                break
            except asyncio.TimeoutError:
                total_sessions = sum(self._session_counts.values())
                active = len([t for t in self._tasks if not t.done()])
                errored = sum(self._error_counts.values())
                elapsed = time.monotonic() - self._start_time
                logger.info(
                    "runner.stats",
                    active_tasks=active,
                    pool_size=BOT_ACTIVE_POOL,
                    total_bots=self.count,
                    total_sessions=total_sessions,
                    sessions_per_minute=round(total_sessions / (elapsed / 60), 1) if elapsed > 0 else 0,
                    total_errors=errored,
                )

    async def _stop_all(self) -> None:
        for bot in self.bots:
            await bot.stop()

        for task in self._tasks:
            if not task.done():
                task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

        await self.client.stop()


async def main() -> None:
    runner = Runner()
    await runner.run()


if __name__ == "__main__":
    structlog.configure(
        processors=[
            structlog.dev.set_exc_info,
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    asyncio.run(main())

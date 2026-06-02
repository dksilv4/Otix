import asyncio
import traceback
from otix.infrastructure.database import async_session
from sqlalchemy import select
from otix.domain.user import User
from otix.services.plex_sync_service import sync_plex


async def progress(event_type: str, **data):
    print(f"PROGRESS EVENT: {event_type} - {data}", flush=True)


# Monkeypatch _get_json to print URL before requesting
from otix.services import plex_sync_service

original_get_json = plex_sync_service._get_json


async def debug_get_json(url: str, token: str, timeout: float = 30.0) -> dict:
    print(f"[HTTP] GET {url} (timeout={timeout})", flush=True)
    try:
        res = await original_get_json(url, token, timeout=timeout)
        print(f"[HTTP] SUCCESS {url}", flush=True)
        return res
    except Exception as e:
        print(f"[HTTP] FAILED {url} - {type(e).__name__}: {e}", flush=True)
        raise


plex_sync_service._get_json = debug_get_json


async def run():
    async with async_session() as s:
        user = await s.scalar(select(User).where(User.username == "admin"))
        if not user:
            print("User admin not found", flush=True)
            return
        try:
            print("Starting plex sync...", flush=True)
            result = await sync_plex(s, user, progress=progress)
            print("Sync complete! Result:", result, flush=True)
        except Exception as e:
            print("Sync failed with exception:", flush=True)
            traceback.print_exc()


asyncio.run(run())

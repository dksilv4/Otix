#!/usr/bin/env python3
"""Backfill overall_rating and overall_rating_source for all media items."""

import asyncio
import sys
import os

# Ensure the backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

from otix.domain.media import MediaItem
from otix.infrastructure.config import Settings
from otix.services.rating_algorithm_service import compute_and_store_overall_rating


async def backfill():
    settings = Settings()
    engine = create_async_engine(settings.database_url, echo=False)

    async with AsyncSession(engine) as session:
        result = await session.execute(select(MediaItem.id))
        ids = [row[0] for row in result]
        print(f"Found {len(ids)} media items", flush=True)

        count = 0
        for i, mid in enumerate(ids, 1):
            try:
                await compute_and_store_overall_rating(session, mid)
                count += 1
            except Exception as e:
                pass  # skip items that error

            if i % 500 == 0 or i == len(ids):
                await session.commit()
                print(f"  Progress: {i}/{len(ids)} ({count} updated)", flush=True)

        print(f"Done! Updated {count} media items", flush=True)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(backfill())

"""
One-shot backfill: re-select logos preferring English language.
Run inside the API container:

    python3 -m otix.scripts.backfill_english_logos
"""
import asyncio

from sqlalchemy import select, update
from otix.infrastructure.database import async_session
from otix.domain.asset import MediaAsset
from otix.domain.media import MediaItem


async def backfill() -> None:
    async with async_session() as session:
        # Get all media items with a logo
        result = await session.execute(
            select(MediaItem.id, MediaItem.title, MediaItem.logo_url)
            .where(MediaItem.logo_url.isnot(None))
        )
        items = result.all()
        print(f"Found {len(items)} media items with logos")

        fixed_en = 0
        fixed_fallback = 0  # Items where current logo isn't English but no EN exists
        unchanged = 0

        for item_id, title, current_logo_url in items:
            # Get all logo assets for this item
            assets_result = await session.execute(
                select(MediaAsset.id, MediaAsset.url, MediaAsset.lang, MediaAsset.width)
                .where(
                    MediaAsset.media_item_id == item_id,
                    MediaAsset.asset_type == "logo",
                )
            )
            assets = assets_result.all()

            if not assets:
                unchanged += 1
                continue

            en_assets = [a for a in assets if a.lang == "en"]
            if en_assets:
                best = max(en_assets, key=lambda a: a.width or 0)
            else:
                best = max(assets, key=lambda a: a.width or 0)

            if best.url != current_logo_url:
                await session.execute(
                    update(MediaItem)
                    .where(MediaItem.id == item_id)
                    .values(logo_url=best.url)
                )
                if en_assets and best.lang == "en":
                    fixed_en += 1
                else:
                    fixed_fallback += 1
            else:
                unchanged += 1

            if (fixed_en + fixed_fallback) % 50 == 0 and (fixed_en + fixed_fallback) > 0:
                print(f"Progress: {fixed_en + fixed_fallback} fixed...")

        await session.commit()
        print(f"\nDone: {fixed_en} switched to English, "
              f"{fixed_fallback} set to best available (no EN), "
              f"{unchanged} unchanged")


if __name__ == "__main__":
    asyncio.run(backfill())

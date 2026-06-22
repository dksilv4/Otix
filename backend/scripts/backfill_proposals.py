"""Backfill match proposals from exported match data."""
from __future__ import annotations

import asyncio
import json

from otix.infrastructure.database import get_session
from otix.services.proposals_service import ProposalsService


async def main():
    with open("/app/epic_matches.json") as f:
        matches = json.load(f)
    print(f"Loaded {len(matches)} matches")

    created = 0
    async for session in get_session():
        svc = ProposalsService(session)
        for m in matches:
            try:
                proposal = await svc.create(
                    proposal_type="match",
                    target_type="media_item",
                    target_id=m["otix_media_id"],
                    payload={
                        "source": m["source"],
                        "source_game_id": m["source_game_id"],
                        "source_title": m.get("source_title", m["otix_title"]),
                        "developer": None,
                        "release_year": None,
                        "poster_url": m.get("poster_url"),
                        "otix_media_id": m["otix_media_id"],
                        "otix_title": m["otix_title"],
                        "otix_confidence": m["otix_confidence"],
                        "match_type": m["match_type"],
                    },
                    proposer=None,
                )
                print(f'  [{proposal.status}] {m["otix_title"]}')
                created += 1
            except Exception as e:
                print(f'  [FAIL] {m["otix_title"]}: {str(e)[:80]}')

    print(f"\nCreated {created}/{len(matches)} proposals")


asyncio.run(main())

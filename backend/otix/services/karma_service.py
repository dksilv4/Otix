from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.karma_transaction import KarmaTransaction
from otix.domain.review_vote import ReviewVote
from otix.domain.user import User


class KarmaService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ── Voting ──

    async def vote(
        self,
        voter_id: str,
        review_user_id: str,
        review_media_item_id: str,
        vote_type: str,
    ) -> str | None:
        """Upsert a vote. Returns the resulting vote_type or None if removed."""
        existing = await self.session.scalar(
            select(ReviewVote).where(
                ReviewVote.user_id == voter_id,
                ReviewVote.review_user_id == review_user_id,
                ReviewVote.review_media_item_id == review_media_item_id,
            )
        )

        if existing:
            if existing.vote_type == vote_type:
                # Toggle off — remove vote
                await self.session.delete(existing)
                if vote_type == "up":
                    await self._adjust_karma(review_user_id, -2, "review_upvote_removed")
                await self.session.flush()
                return None
            else:
                # Flip vote
                was_up = existing.vote_type == "up"
                existing.vote_type = vote_type
                if vote_type == "up":
                    await self._adjust_karma(review_user_id, 2, "review_upvote")
                elif was_up:
                    await self._adjust_karma(review_user_id, -2, "review_upvote_removed")
                await self.session.flush()
                return vote_type
        else:
            vote = ReviewVote(
                user_id=voter_id,
                review_user_id=review_user_id,
                review_media_item_id=review_media_item_id,
                vote_type=vote_type,
            )
            self.session.add(vote)
            if vote_type == "up":
                await self._adjust_karma(review_user_id, 2, "review_upvote")
            await self.session.flush()
            return vote_type

    async def remove_vote(
        self,
        voter_id: str,
        review_user_id: str,
        review_media_item_id: str,
    ) -> bool:
        vote = await self.session.scalar(
            select(ReviewVote).where(
                ReviewVote.user_id == voter_id,
                ReviewVote.review_user_id == review_user_id,
                ReviewVote.review_media_item_id == review_media_item_id,
            )
        )
        if not vote:
            return False

        if vote.vote_type == "up":
            await self._adjust_karma(review_user_id, -2, "review_upvote_removed")

        await self.session.delete(vote)
        await self.session.flush()
        return True

    async def get_vote_counts(
        self, review_user_id: str, review_media_item_id: str
    ) -> dict:
        result = await self.session.execute(
            select(
                ReviewVote.vote_type,
                func.count().label("cnt"),
            ).where(
                ReviewVote.review_user_id == review_user_id,
                ReviewVote.review_media_item_id == review_media_item_id,
            ).group_by(ReviewVote.vote_type)
        )
        counts = {"up": 0, "down": 0}
        for row in result:
            if row.vote_type in counts:
                counts[row.vote_type] = row.cnt
        return counts

    async def get_my_vote(
        self, voter_id: str, review_user_id: str, review_media_item_id: str
    ) -> str | None:
        return await self.session.scalar(
            select(ReviewVote.vote_type).where(
                ReviewVote.user_id == voter_id,
                ReviewVote.review_user_id == review_user_id,
                ReviewVote.review_media_item_id == review_media_item_id,
            )
        )

    # ── Karma ──

    async def get_karma_balance(self, user_id: str) -> int:
        user = await self.session.scalar(select(User).where(User.id == user_id))
        return user.karma if user else 0

    async def get_karma_transactions(
        self, user_id: str, cursor: str | None = None, limit: int = 20
    ) -> tuple[list[KarmaTransaction], str | None]:
        query = (
            select(KarmaTransaction)
            .where(KarmaTransaction.user_id == user_id)
            .order_by(KarmaTransaction.created_at.desc())
        )
        if cursor:
            query = query.where(KarmaTransaction.created_at < cursor)

        query = query.limit(limit + 1)
        result = await self.session.scalars(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        next_cursor = items[-1].created_at.isoformat() if has_more and items else None
        return items, next_cursor

    # ── Internal ──

    async def _adjust_karma(self, user_id: str, amount: int, reason: str) -> None:
        txn = KarmaTransaction(
            user_id=user_id,
            amount=amount,
            reason=reason,
        )
        self.session.add(txn)
        await self.session.execute(
            update(User).where(User.id == user_id).values(karma=User.karma + amount)
        )

# TODO: Review this file
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.company import Company, CompanyRating, UserCompanyFollow


class CompanyService:
    @staticmethod
    async def get_by_id_or_slug(session: AsyncSession, id: str | None = None, slug: str | None = None) -> Company | None:
        """Simple lookup by ID or slug. Returns None if not found."""
        if id:
            return await session.get(Company, id)
        elif slug:
            return await session.scalar(select(Company).where(Company.slug == slug))
        return None

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_company(self, company_id: str, user_id: str | None = None) -> dict | None:
        company = await self.session.scalar(
            select(Company).where(Company.id == company_id)
        )
        if not company:
            return None

        cid = company.id

        # Single query for follower count, avg rating, plus user-specific fields
        cols = [
            select(func.count())
            .select_from(UserCompanyFollow)
            .where(UserCompanyFollow.company_id == cid)
            .scalar_subquery()
            .label("follower_count"),
            select(func.avg(CompanyRating.score))
            .where(CompanyRating.company_id == cid)
            .scalar_subquery()
            .label("avg_rating"),
        ]
        if user_id:
            cols.extend([
                select(UserCompanyFollow.user_id)
                .where(UserCompanyFollow.user_id == user_id, UserCompanyFollow.company_id == cid)
                .scalar_subquery()
                .label("is_followed"),
                select(CompanyRating.score)
                .where(CompanyRating.user_id == user_id, CompanyRating.company_id == cid)
                .scalar_subquery()
                .label("user_rating"),
            ])

        row = (await self.session.execute(select(*cols).select_from(Company).where(Company.id == cid))).first()

        result = {
            "id": company.id,
            "name": company.name,
            "slug": company.slug,
            "logo_url": company.logo_url,
            "origin_country": company.origin_country,
            "follower_count": row.follower_count or 0,
            "is_followed": None,
            "avg_rating": round(float(row.avg_rating), 1) if row.avg_rating is not None else None,
            "user_rating": None,
        }

        if user_id:
            result["is_followed"] = row.is_followed is not None
            result["user_rating"] = row.user_rating

        return result

    async def follow(self, user_id: str, company_id: str) -> None:
        existing = await self.session.scalar(
            select(UserCompanyFollow).where(
                UserCompanyFollow.user_id == user_id,
                UserCompanyFollow.company_id == company_id,
            )
        )
        if existing:
            return
        self.session.add(UserCompanyFollow(user_id=user_id, company_id=company_id))
        await self.session.flush()

    async def unfollow(self, user_id: str, company_id: str) -> bool:
        follow = await self.session.scalar(
            select(UserCompanyFollow).where(
                UserCompanyFollow.user_id == user_id,
                UserCompanyFollow.company_id == company_id,
            )
        )
        if not follow:
            return False
        await self.session.delete(follow)
        await self.session.flush()
        return True

    async def rate(self, user_id: str, company_id: str, score: int) -> None:
        rating = await self.session.scalar(
            select(CompanyRating).where(
                CompanyRating.user_id == user_id,
                CompanyRating.company_id == company_id,
            )
        )
        if rating:
            rating.score = score
        else:
            self.session.add(CompanyRating(user_id=user_id, company_id=company_id, score=score))
        await self.session.flush()

    async def unrate(self, user_id: str, company_id: str) -> bool:
        rating = await self.session.scalar(
            select(CompanyRating).where(
                CompanyRating.user_id == user_id,
                CompanyRating.company_id == company_id,
            )
        )
        if not rating:
            return False
        await self.session.delete(rating)
        await self.session.flush()
        return True

    async def search_companies(
        self,
        query_str: str,
        limit: int = 50,
        query_embedding: list[float] | None = None,
    ) -> list[Company]:
        from sqlalchemy import union

        fts_q = select(Company.id).where(Company.name.op("%")(query_str), Company.embedding.isnot(None))
        branches = [fts_q]
        if query_embedding is not None and isinstance(query_embedding, list) and len(query_embedding) == 1024:
            vector_q = (
                select(Company.id)
                .where(Company.embedding.isnot(None))
                .order_by(Company.embedding.cosine_distance(query_embedding))
                .limit(limit)
            )
            branches.append(vector_q)

        matched_ids = union(*branches).subquery()

        base_q = select(Company).where(
            Company.id.in_(select(matched_ids)),
            Company.embedding.isnot(None),
        )

        sim = func.similarity(Company.name, query_str)
        if query_embedding is not None and isinstance(query_embedding, list) and len(query_embedding) == 1024:
            vector_sim = func.coalesce(1 - Company.embedding.cosine_distance(query_embedding), 0)
        else:
            vector_sim = 0

        order = (sim * 5 + vector_sim * 5).desc()
        q = base_q.order_by(order).limit(limit)

        result = await self.session.scalars(q)
        return list(result)


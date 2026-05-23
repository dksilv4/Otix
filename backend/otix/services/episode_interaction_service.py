from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.episode_interaction import UserEpisodeInteraction
from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import Episode, Season, MediaItem
from otix.infrastructure.celery import app
from otix.lib.xp import EPISODE_WATCHED, SEASON_COMPLETED_BONUS, SHOW_COMPLETED_BONUS


class EpisodeInteractionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_episode_interactions(
        self, user_id: str, show_id: str
    ) -> dict[str, dict]:
        result = await self.session.execute(
            select(Episode.id, UserEpisodeInteraction.created_at)
            .join(
                UserEpisodeInteraction,
                (UserEpisodeInteraction.episode_id == Episode.id)
                & (UserEpisodeInteraction.user_id == user_id),
                isouter=True,
            )
            .join(Season, Season.id == Episode.season_id)
            .where(Season.show_id == show_id)
        )
        interactions: dict[str, dict] = {}
        for ep_id, created_at in result:
            interactions[ep_id] = {
                "watched": created_at is not None,
                "watched_at": created_at.isoformat() if created_at else None,
            }
        return interactions

    async def set_episode_watched(
        self, user_id: str, episode_id: str
    ) -> UserEpisodeInteraction:
        existing = await self.session.scalar(
            select(UserEpisodeInteraction).where(
                UserEpisodeInteraction.user_id == user_id,
                UserEpisodeInteraction.episode_id == episode_id,
            )
        )
        if existing:
            return existing

        interaction = UserEpisodeInteraction(user_id=user_id, episode_id=episode_id)
        self.session.add(interaction)
        await self.session.flush()

        app.send_task("xp.award", args=[user_id, EPISODE_WATCHED])
        app.send_task("streak.update", args=[user_id])
        app.send_task("gamification.check_badges", args=[user_id])

        await self._check_season_completion(user_id, episode_id)
        await self._sync_show_watched_flag(user_id, episode_id)

        return interaction

    async def remove_episode_watched(self, user_id: str, episode_id: str) -> bool:
        result = await self.session.execute(
            delete(UserEpisodeInteraction).where(
                UserEpisodeInteraction.user_id == user_id,
                UserEpisodeInteraction.episode_id == episode_id,
            )
        )
        if result.rowcount == 0:
            return False

        await self._sync_show_watched_flag(user_id, episode_id)
        return True

    async def set_season_watched(self, user_id: str, season_id: str) -> int:
        episodes = (
            await self.session.execute(
                select(Episode.id).where(Episode.season_id == season_id)
            )
        ).all()
        episode_ids = [e[0] for e in episodes]

        existing = (
            await self.session.execute(
                select(UserEpisodeInteraction.episode_id).where(
                    UserEpisodeInteraction.user_id == user_id,
                    UserEpisodeInteraction.episode_id.in_(episode_ids),
                )
            )
        ).all()
        existing_ids = {e[0] for e in existing}
        new_ids = [eid for eid in episode_ids if eid not in existing_ids]

        if new_ids:
            stmt = pg_insert(UserEpisodeInteraction.__table__).values(
                [{"user_id": user_id, "episode_id": eid} for eid in new_ids]
            ).on_conflict_do_nothing()
            await self.session.execute(stmt)
            await self.session.flush()

            for _ in new_ids:
                app.send_task("xp.award", args=[user_id, EPISODE_WATCHED])

        # Check if season became complete from this operation
        season = await self.session.get(Season, season_id)
        if season:
            was_complete_before = len(existing_ids) == len(episode_ids)
            is_complete_now = len(new_ids) + len(existing_ids) == len(episode_ids)
            if is_complete_now and not was_complete_before:
                app.send_task("xp.award", args=[user_id, SEASON_COMPLETED_BONUS])
                app.send_task("streak.update", args=[user_id])
                app.send_task("gamification.check_badges", args=[user_id])

        if season and new_ids:
            await self._sync_show_watched_flag_for_show(user_id, season.show_id)
        elif season:
            await self._sync_show_watched_flag_for_show(user_id, season.show_id)

        return len(new_ids)

    async def remove_season_watched(self, user_id: str, season_id: str) -> int:
        episode_ids = (
            await self.session.execute(
                select(Episode.id).where(Episode.season_id == season_id)
            )
        ).all()

        if not episode_ids:
            return 0

        result = await self.session.execute(
            delete(UserEpisodeInteraction).where(
                UserEpisodeInteraction.user_id == user_id,
                UserEpisodeInteraction.episode_id.in_([e[0] for e in episode_ids]),
            )
        )

        season = await self.session.get(Season, season_id)
        if season:
            await self._sync_show_watched_flag_for_show(user_id, season.show_id)

        return result.rowcount

    async def set_show_watched(self, user_id: str, show_id: str) -> int:
        # Get all non-special season episodes
        episodes = (
            await self.session.execute(
                select(Episode.id)
                .join(Season, Season.id == Episode.season_id)
                .where(Season.show_id == show_id, Season.season_number > 0)
            )
        ).all()
        episode_ids = [e[0] for e in episodes]

        existing = (
            await self.session.execute(
                select(UserEpisodeInteraction.episode_id).where(
                    UserEpisodeInteraction.user_id == user_id,
                    UserEpisodeInteraction.episode_id.in_(episode_ids),
                )
            )
        ).all()
        existing_ids = {e[0] for e in existing}
        new_ids = [eid for eid in episode_ids if eid not in existing_ids]

        if new_ids:
            stmt = pg_insert(UserEpisodeInteraction.__table__).values(
                [{"user_id": user_id, "episode_id": eid} for eid in new_ids]
            ).on_conflict_do_nothing()
            await self.session.execute(stmt)
            await self.session.flush()

            for _ in new_ids:
                app.send_task("xp.award", args=[user_id, EPISODE_WATCHED])

        if new_ids:
            app.send_task("xp.award", args=[user_id, SHOW_COMPLETED_BONUS])
            app.send_task("streak.update", args=[user_id])
            app.send_task("gamification.check_badges", args=[user_id])

        await self._sync_show_watched_flag_for_show(user_id, show_id)
        return len(new_ids)

    async def remove_show_watched(self, user_id: str, show_id: str) -> int:
        episode_ids = (
            await self.session.execute(
                select(Episode.id)
                .join(Season, Season.id == Episode.season_id)
                .where(Season.show_id == show_id)
            )
        ).all()

        if not episode_ids:
            return 0

        result = await self.session.execute(
            delete(UserEpisodeInteraction).where(
                UserEpisodeInteraction.user_id == user_id,
                UserEpisodeInteraction.episode_id.in_([e[0] for e in episode_ids]),
            )
        )

        await self.session.execute(
            delete(UserMediaInteraction).where(
                UserMediaInteraction.user_id == user_id,
                UserMediaInteraction.media_item_id == show_id,
                UserMediaInteraction.interaction_type == "watched",
            )
        )

        return result.rowcount

    async def get_show_progress(
        self, user_id: str, show_id: str
    ) -> dict:
        # Get all episodes in non-special seasons
        all_episodes = (
            await self.session.execute(
                select(Episode.id, Season.season_number)
                .join(Season, Season.id == Episode.season_id)
                .where(Season.show_id == show_id, Season.season_number > 0)
            )
        ).all()

        total_episodes = len(all_episodes)
        if total_episodes == 0:
            return {
                "watched_episodes": 0,
                "total_episodes": 0,
                "progress_pct": 0.0,
                "completed_seasons": [],
            }

        all_ids = [e[0] for e in all_episodes]
        watched = (
            await self.session.execute(
                select(UserEpisodeInteraction.episode_id).where(
                    UserEpisodeInteraction.user_id == user_id,
                    UserEpisodeInteraction.episode_id.in_(all_ids),
                )
            )
        ).all()
        watched_ids = {e[0] for e in watched}

        # Compute completed seasons
        season_episodes: dict[int, int] = {}
        season_watched: dict[int, int] = {}
        for ep_id, season_num in all_episodes:
            season_episodes[season_num] = season_episodes.get(season_num, 0) + 1
            if ep_id in watched_ids:
                season_watched[season_num] = season_watched.get(season_num, 0) + 1

        completed_seasons = sorted(
            sn
            for sn, total in season_episodes.items()
            if season_watched.get(sn, 0) == total
        )

        return {
            "watched_episodes": len(watched_ids),
            "total_episodes": total_episodes,
            "progress_pct": round(len(watched_ids) / total_episodes * 100, 1),
            "completed_seasons": completed_seasons,
        }

    async def get_user_watch_time_minutes(self, user_id: str) -> int:
        # Watch time from movies
        from otix.domain.media import Movie

        movie_time = await self.session.scalar(
            select(func.coalesce(func.sum(Movie.runtime), 0))
            .select_from(UserMediaInteraction)
            .join(MediaItem, MediaItem.id == UserMediaInteraction.media_item_id)
            .join(Movie, Movie.media_item_id == MediaItem.id)
            .where(
                UserMediaInteraction.user_id == user_id,
                UserMediaInteraction.interaction_type == "watched",
                MediaItem.media_type == "movie",
            )
        ) or 0

        # Watch time from episodes
        episode_time = await self.session.scalar(
            select(func.coalesce(func.sum(Episode.runtime), 0))
            .select_from(UserEpisodeInteraction)
            .join(Episode, Episode.id == UserEpisodeInteraction.episode_id)
            .where(UserEpisodeInteraction.user_id == user_id)
        ) or 0

        return movie_time + episode_time

    async def _check_season_completion(
        self, user_id: str, episode_id: str
    ) -> None:
        episode = await self.session.get(Episode, episode_id)
        if episode is None:
            return

        season = await self.session.get(Season, episode.season_id)
        if season is None:
            return

        total = await self.session.scalar(
            select(func.count()).select_from(Episode).where(
                Episode.season_id == season.id
            )
        )
        watched_count = await self.session.scalar(
            select(func.count())
            .select_from(UserEpisodeInteraction)
            .join(Episode, Episode.id == UserEpisodeInteraction.episode_id)
            .where(
                UserEpisodeInteraction.user_id == user_id,
                Episode.season_id == season.id,
            )
        )

        if total and watched_count and watched_count == total:
            app.send_task("xp.award", args=[user_id, SEASON_COMPLETED_BONUS])

    async def _sync_show_watched_flag(
        self, user_id: str, episode_id: str
    ) -> None:
        episode = await self.session.get(Episode, episode_id)
        if episode is None:
            return
        season = await self.session.get(Season, episode.season_id)
        if season is None:
            return
        await self._sync_show_watched_flag_for_show(user_id, season.show_id)

    async def _sync_show_watched_flag_for_show(
        self, user_id: str, show_id: str
    ) -> None:
        # Check if all non-special-season episodes are watched
        non_special = (
            await self.session.execute(
                select(Episode.id)
                .join(Season, Season.id == Episode.season_id)
                .where(Season.show_id == show_id, Season.season_number > 0)
            )
        ).all()
        non_special_ids = [e[0] for e in non_special]

        if not non_special_ids:
            return

        watched = (
            await self.session.execute(
                select(UserEpisodeInteraction.episode_id).where(
                    UserEpisodeInteraction.user_id == user_id,
                    UserEpisodeInteraction.episode_id.in_(non_special_ids),
                )
            )
        ).all()
        watched_ids = {e[0] for e in watched}

        all_watched = len(watched_ids) == len(non_special_ids)

        existing = await self.session.scalar(
            select(UserMediaInteraction).where(
                UserMediaInteraction.user_id == user_id,
                UserMediaInteraction.media_item_id == show_id,
                UserMediaInteraction.interaction_type == "watched",
            )
        )

        if all_watched and existing is None:
            stmt = pg_insert(UserMediaInteraction.__table__).values({
                "user_id": user_id,
                "media_item_id": show_id,
                "interaction_type": "watched",
                "metadata": {},
            }).on_conflict_do_nothing()
            await self.session.execute(stmt)
        elif not all_watched and existing is not None:
            await self.session.delete(existing)

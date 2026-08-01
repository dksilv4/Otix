from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.episode_interaction import UserEpisodeInteraction
from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import MediaItem, Episode, Season, Show
from otix.domain.collection import CollectionItem
from otix.domain.franchise import FranchiseItem
from otix.schemas.calendar import CalendarEvent, CalendarResponse
from otix.schemas.media import EpisodeOut


RECENT_WINDOW_DAYS = 60


class CalendarService:
    def __init__(self, session: AsyncSession, user_id: str):
        self.session = session
        self.user_id = user_id

    async def get_events(self) -> CalendarResponse:
        events: list[CalendarEvent] = []
        events.extend(await self._watchlist_releases())
        events.extend(await self._recent_episodes())
        events.extend(await self._sequels())
        events.sort(key=lambda e: e.release_date, reverse=True)
        return CalendarResponse(events=events)

    async def _watchlist_releases(self) -> list[CalendarEvent]:
        """Items on the user's watchlist — upcoming or released within the recent window."""
        cutoff = date.today() - timedelta(days=RECENT_WINDOW_DAYS)
        result = await self.session.execute(
            select(MediaItem)
            .join(
                UserMediaInteraction,
                UserMediaInteraction.media_item_id == MediaItem.id,
            )
            .options(
                joinedload(MediaItem.movie),
                joinedload(MediaItem.show),
                joinedload(MediaItem.game),
                joinedload(MediaItem.album),
            )
            .where(
                UserMediaInteraction.user_id == self.user_id,
                UserMediaInteraction.interaction_type == "watchlisted",
                MediaItem.release_date >= cutoff,
            )
            .order_by(MediaItem.release_date.desc())
        )
        items = result.unique().scalars().all()
        today = date.today()
        return [
            CalendarEvent(
                id=f"wl-{item.id}",
                media_item_id=item.id,
                media_type=item.media_type,
                title=item.title,
                poster_url=item.poster_url,
                slug=item.slug,
                release_date=item.release_date,
                event_type="watchlist_release",
                reason=(
                    "Upcoming — from your watchlist"
                    if item.release_date >= today
                    else "Recently released — from your watchlist"
                ),
            )
            for item in items
            if item.release_date
        ]

    async def _recent_episodes(self) -> list[CalendarEvent]:
        """Recent and upcoming episodes for shows the user watches, excluding already-watched."""
        watched_shows = select(MediaItem.id).join(
            UserMediaInteraction,
            UserMediaInteraction.media_item_id == MediaItem.id,
        ).where(
            UserMediaInteraction.user_id == self.user_id,
            UserMediaInteraction.interaction_type.in_(["watched", "started"]),
            MediaItem.media_type == "show",
        )

        shows_from_episodes = select(Season.show_id).join(
            Episode, Episode.season_id == Season.id
        ).join(
            UserEpisodeInteraction,
            UserEpisodeInteraction.episode_id == Episode.id,
        ).where(UserEpisodeInteraction.user_id == self.user_id)

        watched_episode_ids = select(UserEpisodeInteraction.episode_id).where(
            UserEpisodeInteraction.user_id == self.user_id
        )

        show_ids_union = union(watched_shows, shows_from_episodes).subquery()
        cutoff = date.today() - timedelta(days=RECENT_WINDOW_DAYS)

        result = await self.session.execute(
            select(Episode, Season, Show, MediaItem)
            .join(Season, Season.id == Episode.season_id)
            .join(Show, Show.media_item_id == Season.show_id)
            .join(MediaItem, MediaItem.id == Show.media_item_id)
            .where(
                Season.show_id.in_(select(show_ids_union.c[0])),
                Episode.air_date >= cutoff,
                Episode.id.notin_(watched_episode_ids),
            )
            .order_by(Episode.air_date.desc())
        )
        rows = result.all()
        today = date.today()

        events: list[CalendarEvent] = []
        for episode, season, show, media_item in rows:
            prefix = "Upcoming" if episode.air_date >= today else "Recent"
            events.append(
                CalendarEvent(
                    id=f"ep-{episode.id}",
                    media_item_id=show.media_item_id,
                    media_type="show",
                    title=media_item.title,
                    poster_url=media_item.poster_url,
                    slug=media_item.slug,
                    release_date=episode.air_date,
                    event_type="new_episode",
                    reason=f"{prefix} — S{season.season_number}E{episode.episode_number} {episode.name or ''}".strip(),
                    episode_info=EpisodeOut.model_validate(episode),
                    season_number=season.season_number,
                )
            )
        return events

    async def _sequels(self) -> list[CalendarEvent]:
        """Future or recent releases in collections/franchises the user has interacted with."""
        user_item_ids = select(UserMediaInteraction.media_item_id).where(
            UserMediaInteraction.user_id == self.user_id,
            UserMediaInteraction.interaction_type.in_(
                ["watched", "played", "listened", "liked", "started"]
            ),
        )

        sequel_ids = select(CollectionItem.media_item_id).where(
            CollectionItem.collection_id.in_(
                select(CollectionItem.collection_id).where(
                    CollectionItem.media_item_id.in_(user_item_ids)
                )
            ),
            CollectionItem.media_item_id.notin_(user_item_ids),
        )

        franchise_ids = select(FranchiseItem.media_item_id).where(
            FranchiseItem.franchise_id.in_(
                select(FranchiseItem.franchise_id).where(
                    FranchiseItem.media_item_id.in_(user_item_ids)
                )
            ),
            FranchiseItem.media_item_id.notin_(user_item_ids),
        )

        combined = union(sequel_ids, franchise_ids).subquery()
        cutoff = date.today() - timedelta(days=RECENT_WINDOW_DAYS)

        result = await self.session.execute(
            select(MediaItem)
            .options(
                joinedload(MediaItem.movie),
                joinedload(MediaItem.show),
                joinedload(MediaItem.game),
                joinedload(MediaItem.album),
            )
            .where(
                MediaItem.id.in_(select(combined.c[0])),
                MediaItem.release_date >= cutoff,
            )
            .order_by(MediaItem.release_date.desc())
        )
        items = result.unique().scalars().all()
        today = date.today()

        return [
            CalendarEvent(
                id=f"seq-{item.id}",
                media_item_id=item.id,
                media_type=item.media_type,
                title=item.title,
                poster_url=item.poster_url,
                slug=item.slug,
                release_date=item.release_date,
                event_type="sequel",
                reason=(
                    "Upcoming — new in a franchise you've enjoyed"
                    if item.release_date >= today
                    else "Recently released — new in a franchise you've enjoyed"
                ),
            )
            for item in items
            if item.release_date
        ]

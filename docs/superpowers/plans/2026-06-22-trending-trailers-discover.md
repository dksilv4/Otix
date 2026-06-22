# Trending Trailers — Discover Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a trending YouTube trailers section to the discover page with an auto-playing hero carousel and a click-to-play section.

**Architecture:** Backend joins `media_videos` (type=trailer, provider=tmdb) with `media_items` (movie/show), ordered by popularity, deduped one trailer per item. Frontend adds two new components: `DiscoverTrailerHero` (auto-play YouTube iframe, 8s rotate) and `TrendingTrailersSection` (carousel + modal on click), plus a shared `TrailerVideoModal`.

**Tech Stack:** FastAPI (Python 3.12+), SQLAlchemy async, React 18, TanStack Query, YouTube IFrame Player, framer-motion

---

## File Structure

### Backend (3 files)
- **Create:** `backend/otix/api/discover/trailers/__init__.py` — package init
- **Create:** `backend/otix/api/discover/trailers/router.py` — trending trailers endpoint
- **Modify:** `backend/otix/api/discover/router.py` — register trailers sub-router

### Frontend (5 files)
- **Modify:** `frontend/src/features/discover/types.ts` — add `TrendingTrailerItem` type
- **Modify:** `frontend/src/features/discover/queries/discover-keys.ts` — add trailers key
- **Modify:** `frontend/src/features/discover/queries/discover-queries.ts` — add trailers query
- **Create:** `frontend/src/features/discover/components/molecules/trailer-video-modal.tsx` — modal with YouTube embed
- **Create:** `frontend/src/features/discover/components/organisms/discover-trailer-hero.tsx` — auto-play hero carousel
- **Create:** `frontend/src/features/discover/components/organisms/trending-trailers-section.tsx` — section with click-to-play
- **Modify:** `frontend/src/features/discover/components/organisms/discover-feed.tsx` — add both new sections
- **Modify:** `frontend/src/features/discover/index.ts` — export new components

---

## Global Constraints

- No new dependencies — use existing YouTube iframe embed (no API client library)
- All API responses use camelCase (FastAPI `model_config` handles this)
- Frontend follows existing pattern: `queryOptions` in `discover-queries.ts`, keys in `discover-keys.ts`
- Components use existing `Carousel`, `DiscoverMediaCard`, `MediaSectionSkeleton` patterns
- Empty state = `return null` for both hero and section (hide if no trailers)
- Adult content excluded per `current_user` preference on backend
- Redis cache TTL: 30 minutes for trailers endpoint

---

### Task 1: Backend — Schema + Endpoint + Router

**Files:**
- Create: `backend/otix/api/discover/trailers/__init__.py`
- Create: `backend/otix/api/discover/trailers/router.py`
- Modify: `backend/otix/api/discover/router.py`

**Interfaces:**
- Consumes: `MediaItem`, `MediaVideo` ORM models; `_cache_get`, `_cache_set` from `router_helpers`
- Produces: `GET /discover/trailers/trending` → `TrendingTrailerResponse(items: list[TrendingTrailerItem])`

- [ ] **Step 1: Create the trailers package init**

File `backend/otix/api/discover/trailers/__init__.py` — empty file.

- [ ] **Step 2: Update `schemas/media.py` — Add `TrendingTrailerItem` + response**

Add before `MediaItemListResponse` (around line 74):

```python
class TrendingTrailerItem(BaseModel):
    """A media item that has a trending YouTube trailer."""

    id: str
    media_type: str
    title: str
    slug: str
    poster_url: str | None = None
    textless_poster_url: str | None = None
    backdrop_url: str | None = None
    logo_url: str | None = None
    release_date: date | None = None
    popularity: float
    avg_rating: float | None = None
    rating_count: int = 0
    overview: str | None = None
    trailer_youtube_id: str = ""
    trailer_url: str = ""

    model_config = {"from_attributes": True}


class TrendingTrailerResponse(PaginatedResponse):
    items: list[TrendingTrailerItem]
```

- [ ] **Step 3: Create the trailers router**

File `backend/otix/api/discover/trailers/router.py`:

```python
from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy.dialects.postgresql import aggregate_order_by

from otix.api._utils import get_db, get_optional_user
from otix.api.discover.router_helpers import _cache_get, _cache_set
from otix.domain.asset import MediaVideo
from otix.domain.media import MediaItem
from otix.domain.user import User
from otix.schemas.media import TrendingTrailerItem, TrendingTrailerResponse
from otix.services.media_service import MediaService, should_exclude_adult

logger = structlog.get_logger()

router = APIRouter()
_TRAILERS_TTL = 1800  # 30 min

def _extract_youtube_id(url: str) -> str:
    """Extract YouTube video ID from a watch URL or return as-is if already an ID."""
    parsed = urlparse(url)
    if parsed.hostname in ("youtu.be",):
        return parsed.path.lstrip("/")
    qs = parse_qs(parsed.query)
    return qs.get("v", [url])[0]

@router.get("/trailers/trending", response_model=TrendingTrailerResponse)
async def trending_trailers(
    request: Request,
    limit: int = Query(20, ge=1, le=40),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> TrendingTrailerResponse:
    """Get trending media items that have YouTube trailers (movies & shows)."""
    ip = request.client.host if request.client else None
    exclude_adult = should_exclude_adult(current_user)
    cache_key = f"discover:trailers:trending:{limit}:adult{0 if exclude_adult else 1}"

    cached = await _cache_get(cache_key)
    if cached:
        logger.info("trending trailers cache hit", ip=ip)
        return TrendingTrailerResponse.model_validate(json.loads(cached))

    # Subquery: one trailer per media_item, preferring "Trailer" type over "Teaser"
    subq = (
        select(
            MediaVideo.media_item_id,
            MediaVideo.url,
            func.row_number().over(
                partition_by=MediaVideo.media_item_id,
                order_by=(
                    func.array_position(
                        ["Trailer", "Teaser"], MediaVideo.video_type
                    ).nullslast()
                ),
            ).label("rn")
        )
        .where(
            MediaVideo.video_type.in_(["Trailer", "Teaser"]),
            MediaVideo.provider == "tmdb",
        )
        .subquery()
    )

    query = (
        select(MediaItem, subq.c.url)
        .join(subq, MediaItem.id == subq.c.media_item_id)
        .where(subq.c.rn == 1)  # first trailer per item
        .where(MediaItem.media_type.in_(["movie", "show"]))
        .order_by(MediaItem.popularity.desc())
        .limit(limit)
    )

    if exclude_adult:
        query = query.where(MediaItem.is_adult == False)

    result = await db.execute(query)
    rows = result.all()

    items: list[TrendingTrailerItem] = []
    for media_item, trailer_url in rows:
        youtube_id = _extract_youtube_id(trailer_url)
        items.append(TrendingTrailerItem(
            id=media_item.id,
            media_type=media_item.media_type,
            title=media_item.title,
            slug=media_item.slug,
            poster_url=media_item.poster_url,
            textless_poster_url=media_item.textless_poster_url,
            backdrop_url=media_item.backdrop_url,
            logo_url=media_item.logo_url,
            release_date=media_item.release_date,
            popularity=media_item.popularity,
            avg_rating=media_item.avg_rating,
            rating_count=media_item.rating_count,
            overview=media_item.overview,
            trailer_youtube_id=youtube_id,
            trailer_url=trailer_url,
        ))

    response = TrendingTrailerResponse(
        items=items,
        next_cursor=None,
        has_more=False,
        total=len(items),
    )

    await _cache_set(cache_key, response.model_dump_json(), ex=_TRAILERS_TTL)
    logger.info("trending trailers fetched", count=len(items), ip=ip)
    return response
```

- [ ] **Step 4: Register the trailers router in discover router**

Edit `backend/otix/api/discover/router.py` — add import and include:

```python
from otix.api.discover.trailers.router import router as trailers_router

discover_router.include_router(trailers_router)
```

Place after existing includes (line 13), before closing.

- [ ] **Step 5: Commit**

```bash
git add \
  backend/otix/api/discover/trailers/__init__.py \
  backend/otix/api/discover/trailers/router.py \
  backend/otix/api/discover/router.py
git commit -m "feat: add /discover/trailers/trending endpoint"

# Co-Authored-By: Claude <noreply@anthropic.com>
```

---

### Task 2: Frontend — Types, Query Keys, and Query

**Files:**
- Modify: `frontend/src/features/discover/types.ts`
- Modify: `frontend/src/features/discover/queries/discover-keys.ts`
- Modify: `frontend/src/features/discover/queries/discover-queries.ts`

**Interfaces:**
- Produces: `TrendingTrailerItem` type, `discoverKeys.trailers()` key, `discoverQueries.trailers()` query → `TrendingTrailerItem[]`

- [ ] **Step 1: Add `TrendingTrailerItem` type**

Add to `frontend/src/features/discover/types.ts` after `RecordedMoodContext`:

```ts
export interface TrendingTrailerItem {
  id: string
  mediaType: string
  title: string
  slug: string
  posterUrl: string | null
  textlessPosterUrl: string | null
  backdropUrl: string | null
  logoUrl: string | null
  releaseDate: string | null
  popularity: number
  avgRating: number | null
  ratingCount: number
  overview: string | null
  trailerYoutubeId: string
  trailerUrl: string
}
```

- [ ] **Step 2: Add query key for trailers**

Add to `frontend/src/features/discover/queries/discover-keys.ts`:

```ts
export const discoverKeys = {
  all: () => ['discover'] as const,
  list: (mediaType: string, listType: string, genre?: string, language?: string, isAnime?: boolean) =>
    [...discoverKeys.all(), 'list', mediaType, listType, genre ?? '__all', language ?? '__all', isAnime ?? '__all'] as const,
  hero: () => [...discoverKeys.all(), 'hero'] as const,
  sections: () => [...discoverKeys.all(), 'sections'] as const,
  trailers: () => [...discoverKeys.all(), 'trailers'] as const,
}
```

- [ ] **Step 3: Add trailers query**

Add to `frontend/src/features/discover/queries/discover-queries.ts` after existing queries:

```ts
import type { TrendingTrailerItem } from '../types'

// Inside discoverQueries object, after sections():
trailers: () =>
  queryOptions({
    queryKey: discoverKeys.trailers(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: TrendingTrailerItem[] }>(
        '/discover/trailers/trending',
      )
      return data.items
    },
    staleTime: 1000 * 60 * 30,
    gcTime,
  }),
```

- [ ] **Step 4: Commit**

```bash
git add \
  frontend/src/features/discover/types.ts \
  frontend/src/features/discover/queries/discover-keys.ts \
  frontend/src/features/discover/queries/discover-queries.ts
git commit -m "feat: add trending trailers query and types"

# Co-Authored-By: Claude <noreply@anthropic.com>
```

---

### Task 3: Frontend — Trailer Video Modal

**Files:**
- Create: `frontend/src/features/discover/components/molecules/trailer-video-modal.tsx`

**Interfaces:**
- Consumes: `trailerYoutubeId: string`, `onClose: () => void`
- Produces: Modal portal with YouTube iframe

- [ ] **Step 1: Create `trailer-video-modal.tsx`**

```tsx
import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface TrailerVideoModalProps {
  youtubeId: string
  title: string
  onClose: () => void
}

export function TrailerVideoModal({ youtubeId, title, onClose }: TrailerVideoModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-4xl mx-4 aspect-video bg-black rounded-xl overflow-hidden shadow-2xl"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            aria-label="Close video"
          >
            <X className="h-4 w-4" />
          </button>

          {/* YouTube iframe */}
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
            title={title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/discover/components/molecules/trailer-video-modal.tsx
git commit -m "feat: add TrailerVideoModal component"

# Co-Authored-By: Claude <noreply@anthropic.com>
```

---

### Task 4: Frontend — Trailer Hero (Auto-Play)

**Files:**
- Create: `frontend/src/features/discover/components/organisms/discover-trailer-hero.tsx`

**Interfaces:**
- Consumes: `discoverQueries.trailers()` → `TrendingTrailerItem[]`
- Produces: Rendered hero section with auto-playing YouTube trailers

- [ ] **Step 1: Create `discover-trailer-hero.tsx`**

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { Badge } from '@ui/atoms/badge'
import { Skeleton } from '@ui/atoms/skeleton'
import { discoverQueries } from '@discover/queries/discover-queries'
import { MEDIA_TYPE_LABEL, MEDIA_TYPE_COLOR } from '@/constants/media'
import type { TrendingTrailerItem } from '@discover/types'

const AUTO_ROTATE_MS = 8000

export function DiscoverTrailerHero({ className }: { className?: string }) {
  const { data: items = [], isLoading } = useQuery(discoverQueries.trailers())
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const total = items.length
  const activeItem: TrendingTrailerItem | null = items[activeIndex] ?? null

  // Auto-rotate
  useEffect(() => {
    if (isPaused || total <= 1) return
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % total)
    }, AUTO_ROTATE_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPaused, total])

  const goTo = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  const goNext = useCallback(() => {
    if (total === 0) return
    setActiveIndex((prev) => (prev + 1) % total)
  }, [total])

  const goPrev = useCallback(() => {
    if (total === 0) return
    setActiveIndex((prev) => (prev - 1 + total) % total)
  }, [total])

  // Empty state
  if (!isLoading && total === 0) return null

  return (
    <section
      className={`relative w-full overflow-hidden rounded-2xl ${className || ''}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Loading skeleton */}
      {isLoading && (
        <div className="relative w-full aspect-[21/9] bg-zinc-900 rounded-2xl flex items-end p-8">
          <div className="space-y-3 w-full max-w-lg">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-96" />
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Active trailer */}
      {activeItem && (
        <div className="relative w-full aspect-[21/9] bg-zinc-900 rounded-2xl overflow-hidden">
          {/* YouTube background player */}
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${activeItem.trailerYoutubeId}?autoplay=1&mute=1&loop=1&playlist=${activeItem.trailerYoutubeId}&controls=0&showinfo=0&modestbranding=1&iv_load_policy=3&disablekb=1&playsinline=1`}
            title={activeItem.title}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ filter: 'brightness(0.6)' }}
            allow="autoplay; encrypted-media"
          />

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

          {/* Content overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeItem.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4 }}
                className="max-w-2xl"
              >
                {/* Badge row */}
                <div className="flex items-center gap-2 mb-2">
                  <Badge
                    size="sm"
                    className={`text-white border-none ${MEDIA_TYPE_COLOR[activeItem.mediaType as keyof typeof MEDIA_TYPE_COLOR] || ''}`}
                  >
                    {MEDIA_TYPE_LABEL[activeItem.mediaType as keyof typeof MEDIA_TYPE_LABEL] ?? 'Media'}
                  </Badge>
                  {activeItem.releaseDate && (
                    <span className="text-xs font-semibold text-white/70">
                      {activeItem.releaseDate.slice(0, 4)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
                    <Play className="h-3 w-3 fill-current" />
                    Trailer
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-2xl md:text-4xl font-bold text-white mb-2 line-clamp-1">
                  {activeItem.title}
                </h2>

                {/* Overview */}
                {activeItem.overview && (
                  <p className="text-sm md:text-base text-white/80 line-clamp-2 mb-4 max-w-xl">
                    {activeItem.overview}
                  </p>
                )}

                {/* CTA */}
                <Link
                  to="/media/$mediaType/$mediaId"
                  params={{ mediaType: activeItem.mediaType, mediaId: activeItem.id }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white font-semibold text-sm backdrop-blur-sm transition-all"
                >
                  <Play className="h-4 w-4 fill-current" />
                  View Details
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation arrows */}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all"
                aria-label="Previous trailer"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all"
                aria-label="Next trailer"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Dot indicators */}
          {total > 1 && (
            <div className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5">
              {items.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTo(idx)}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === activeIndex
                      ? 'w-6 bg-white'
                      : 'w-1.5 bg-white/40 hover:bg-white/60'
                  }`}
                  aria-label={`Go to trailer ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/discover/components/organisms/discover-trailer-hero.tsx
git commit -m "feat: add DiscoverTrailerHero with auto-play YouTube carousel"

# Co-Authored-By: Claude <noreply@anthropic.com>
```

---

### Task 5: Frontend — Trending Trailers Section (Click-to-Play)

**Files:**
- Create: `frontend/src/features/discover/components/organisms/trending-trailers-section.tsx`

**Interfaces:**
- Consumes: `discoverQueries.trailers()` → `TrendingTrailerItem[]`, `TrailerVideoModal`
- Produces: Rendered carousel section with play overlay

- [ ] **Step 1: Create `trending-trailers-section.tsx`**

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { discoverQueries } from '@discover/queries/discover-queries'
import { MediaCarousel } from '../molecules/discover-media-carousel'
import { MediaSectionSkeleton } from '../molecules/discover-media-section-skeleton'
import { DiscoverMediaCard } from '../molecules/discover-media-card'
import { TrailerVideoModal } from '../molecules/trailer-video-modal'
import type { TrendingTrailerItem } from '@discover/types'

function TrailerCard({
  item,
  onPlay,
}: {
  item: TrendingTrailerItem
  onPlay: () => void
}) {
  return (
    <div className="relative group cursor-pointer" onClick={onPlay}>
      <DiscoverMediaCard item={item} />
      {/* Play button overlay on hover */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all rounded-lg">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/90 text-black opacity-0 group-hover:opacity-100 transition-all shadow-lg transform group-hover:scale-110">
          <Play className="h-5 w-5 fill-current ml-0.5" />
        </div>
      </div>
    </div>
  )
}

export function TrendingTrailersSection({ className }: { className?: string }) {
  const { data: items = [], isLoading } = useQuery(discoverQueries.trailers())
  const [activeTrailer, setActiveTrailer] = useState<TrendingTrailerItem | null>(null)

  if (!isLoading && items.length === 0) return null

  return (
    <>
      <section className={className}>
        {isLoading ? (
          <MediaSectionSkeleton />
        ) : (
          <MediaCarousel
            title="Trending Trailers"
            viewAllLink="/search"
            viewAllSearch={{ q: '', type: '', sort: '' }}
          >
            {items.map((item) => (
              <TrailerCard
                key={item.id}
                item={item}
                onPlay={() => setActiveTrailer(item)}
              />
            ))}
          </MediaCarousel>
        )}
      </section>

      {/* Video modal */}
      {activeTrailer && (
        <TrailerVideoModal
          youtubeId={activeTrailer.trailerYoutubeId}
          title={activeTrailer.title}
          onClose={() => setActiveTrailer(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/discover/components/organisms/trending-trailers-section.tsx
git commit -m "feat: add TrendingTrailersSection with click-to-play modal"

# Co-Authored-By: Claude <noreply@anthropic.com>
```

---

### Task 6: Frontend — Wire into Feed + Exports

**Files:**
- Modify: `frontend/src/features/discover/components/organisms/discover-feed.tsx`
- Modify: `frontend/src/features/discover/index.ts`

**Interfaces:**
- Consumes: `DiscoverTrailerHero`, `TrendingTrailersSection`
- Produces: Full discover feed with trailer sections

- [ ] **Step 1: Update `discover-feed.tsx`**

Add imports and sections after hero, before Popular Movies:

```tsx
import { DiscoverTrailerHero } from './discover-trailer-hero'
import { TrendingTrailersSection } from './trending-trailers-section'

export function DiscoverFeed() {
  return (
    <div className="space-y-16">
      <DiscoverHero />
      <DiscoverTrailerHero />
      <TrendingTrailersSection />
      <MediaSection
        title="Popular Movies"
        mediaType="movie"
        listType="popular"
      />
      <MediaSection
        title="Popular Shows"
        mediaType="show"
        listType="popular"
      />
      <MediaSection
        title="Popular Games"
        mediaType="game"
        listType="popular"
      />
      <MediaSection
        title="Popular Music"
        mediaType="music"
        listType="popular"
      />
    </div>
  )
}
```

- [ ] **Step 2: Update `index.ts` exports**

Add to `frontend/src/features/discover/index.ts`:

```ts
export { DiscoverTrailerHero } from './components/organisms/discover-trailer-hero'
export { TrendingTrailersSection } from './components/organisms/trending-trailers-section'
export { TrailerVideoModal } from './components/molecules/trailer-video-modal'
export type { TrendingTrailerItem } from './types'
```

- [ ] **Step 3: Commit**

```bash
git add \
  frontend/src/features/discover/components/organisms/discover-feed.tsx \
  frontend/src/features/discover/index.ts
git commit -m "feat: wire trailer sections into discover feed"

# Co-Authored-By: Claude <noreply@anthropic.com>
```

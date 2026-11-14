import type { CSSProperties } from 'react'
import { getPlatformIconComponent, type SvgIconComponent } from '@media/game/utils/platform-icons'
import type { MediaItemSummary } from '@media/queries/media-queries'

export const isFanartUrl = (url?: string | null): boolean =>
  !!url && url.includes('assets.fanart.tv')

export const resolveHeroCardImage = (item: MediaItemSummary): string => {
  if (!isFanartUrl(item.textlessPosterUrl) && item.textlessPosterUrl) {
    return item.textlessPosterUrl
  }
  if (!isFanartUrl(item.posterUrl) && item.posterUrl) {
    return item.posterUrl
  }
  if (!isFanartUrl(item.backdropUrl) && item.backdropUrl) {
    return item.backdropUrl
  }
  return item.posterUrl || item.textlessPosterUrl || item.backdropUrl || ''
}

export const resolveHeroBackdropSource = (
  activeDetail?: { backdropUrl?: string | null; posterUrl?: string | null } | null,
  activeMediaItem?: MediaItemSummary | null,
): string | undefined => {
  const detailBackdrop = activeDetail?.backdropUrl
  const detailPoster = activeDetail?.posterUrl
  const itemBackdrop = activeMediaItem?.backdropUrl
  const itemPoster = activeMediaItem?.posterUrl
  const itemTextless = activeMediaItem?.textlessPosterUrl

  // Prefer stable item backdrop first, then detail backdrop
  const candidate =
    (!isFanartUrl(itemBackdrop) && itemBackdrop) ||
    (!isFanartUrl(detailBackdrop) && detailBackdrop) ||
    (!isFanartUrl(itemPoster) && itemPoster) ||
    (!isFanartUrl(detailPoster) && detailPoster) ||
    itemBackdrop ||
    detailBackdrop ||
    itemTextless ||
    itemPoster ||
    detailPoster ||
    null

  if (!candidate) return undefined
  return candidate.replace(/\/original\//, '/w1280/')
}

export const resolveHeroBackdropSrcSet = (url?: string): string | undefined => {
  if (!url || !url.includes('image.tmdb.org/t/p/')) return undefined
  const w780 = url.replace(/\/w1280\/|\/original\//, '/w780/')
  const w1280 = url.replace(/\/w780\/|\/original\//, '/w1280/')
  return `${w780} 780w, ${w1280} 1280w`
}

export const CONTENT_FADE = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] },
} as const

export const HERO_STAGE_FADE = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.02 },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
} as const

export { formatSeasonBadgeText } from '@/lib/utils/media-badge'

export const formatRatingPercent = (avgRating?: number | null): string | null => {
  if (avgRating == null || isNaN(avgRating)) return null
  const percent = avgRating > 10 ? Math.round(avgRating) : Math.round(avgRating * 10)
  return `${percent}%`
}

export const formatReleaseYear = (dateStr?: string | null): string | null => {
  if (!dateStr) return null
  const year = dateStr.slice(0, 4)
  return year.length === 4 ? year : null
}

export const calculateCardTransform = (
  slideOffset: number,
  cardOffset: number,
  isActive: boolean,
): CSSProperties => {
  const abs = Math.abs(slideOffset)
  const scale = Math.max(0.72, 1 - abs * 0.08)
  const translateY = abs * 12
  const layerGap = cardOffset * (1 - abs * 0.05)
  const rotateY = isActive ? 0 : slideOffset < 0 ? 12 : -12
  const translateZ = isActive ? 0 : -abs * 85

  let transform: string
  if (isActive) {
    transform = 'translateX(-50%) translateY(-50%) translateZ(0px) rotateY(0deg) scale(1)'
  } else {
    transform = [
      'translateX(-50%)',
      `translateX(${slideOffset * layerGap}px)`,
      `translateY(calc(-50% + ${translateY}px))`,
      `translateZ(${translateZ}px)`,
      `rotateY(${rotateY}deg)`,
      `scale(${scale})`,
    ].join(' ')
  }

  return {
    left: '50%',
    top: '50%',
    transform,
    zIndex: Math.max(0, 20 - abs * 4),
    transition:
      'transform 650ms cubic-bezier(0.16, 1, 0.3, 1), opacity 500ms ease-out',
    pointerEvents: abs >= 3 ? 'none' : 'auto',
    touchAction: 'manipulation',
  }
}

export const resolvePlatformIcon = (
  slug?: string | null,
  name?: string | null,
): SvgIconComponent | null => {
  if (slug) {
    const icon = getPlatformIconComponent(slug)
    if (icon) return icon
  }
  if (name) {
    const icon = getPlatformIconComponent(name)
    if (icon) return icon
  }
  return null
}

export const formatMediaFormatLabel = (mediaType?: string | null): string => {
  switch (mediaType) {
    case 'movie':
      return 'Movie'
    case 'show':
      return 'Shows'
    case 'game':
      return 'Game'
    default:
      return 'Featured'
  }
}

export const formatAudienceMetric = (
  popularity?: number | null,
  ratingCount?: number | null,
  watchedCount?: number | null,
): string => {
  const raw = watchedCount || ratingCount || popularity || 150
  if (raw >= 1000) {
    const k = (raw / 1000).toFixed(raw >= 10000 ? 0 : 1)
    return `${k}k+`
  }
  return `${Math.round(raw)}+`
}

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/

export const extractYoutubeIdFromUrl = (url?: string | null): string | null => {
  if (!url) return null
  const trimmed = url.trim()
  if (YOUTUBE_ID_REGEX.test(trimmed)) return trimmed
  try {
    const u = new URL(trimmed)
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v')
        if (v && YOUTUBE_ID_REGEX.test(v)) return v
      }
      const parts = u.pathname.split('/').filter(Boolean)
      const last = parts.pop()
      if (last && YOUTUBE_ID_REGEX.test(last)) return last
    }
  } catch {
    /* fallback to regex for non-standard urls */
  }
  const match = trimmed.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([a-zA-Z0-9_-]{11})/)
  return match?.[1] ?? null
}

export const extractTrailerYoutubeId = (
  youtubeVideoId?: string | null,
  videos?: Array<{ videoType?: string | null; url?: string | null; providerId?: string | null }> | null,
): string | null => {
  const directId = extractYoutubeIdFromUrl(youtubeVideoId)
  if (directId) return directId

  if (!videos || videos.length === 0) return null

  // Priority order: official trailers, teasers, game videos / gameplay, clips
  const priorityTypes = ['trailer', 'teaser', 'game_video', 'gameplay', 'clip']

  for (const p of priorityTypes) {
    const matched = videos.find((v) => v.videoType?.toLowerCase().includes(p))
    if (matched) {
      const fromUrl = extractYoutubeIdFromUrl(matched.url)
      if (fromUrl) return fromUrl
      if (matched.providerId && YOUTUBE_ID_REGEX.test(matched.providerId)) {
        return matched.providerId
      }
    }
  }

  // Fallback: check any remaining video that has a valid YouTube ID
  for (const v of videos) {
    const fromUrl = extractYoutubeIdFromUrl(v.url)
    if (fromUrl) return fromUrl
    if (v.providerId && YOUTUBE_ID_REGEX.test(v.providerId)) {
      return v.providerId
    }
  }

  return null
}


import type { CSSProperties } from 'react'
import { getPlatformIconComponent, type SvgIconComponent } from '@media/game/utils/platform-icons'

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

export const formatSeasonBadgeText = (releaseDate?: string | null): string => {
  if (!releaseDate) return 'New Season'
  const date = new Date(releaseDate)
  const now = new Date()
  const days = Math.floor((date.getTime() - now.getTime()) / 86400000)
  const month = date.toLocaleString('en-US', { month: 'short' })
  const year = date.getFullYear()
  if (days > 0) return `New Season · ${month} ${year}`
  if (days >= -14) return 'New Season · Just Landed'
  return `New Season · ${month} ${year}`
}

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
  const scale = Math.max(0.7, 1 - abs * 0.10)
  const translateY = abs * 14
  const layerGap = cardOffset * (1 - abs * 0.06)

  let transform: string
  if (isActive) {
    transform = 'translateX(-50%) translateY(-50%) scale(1)'
  } else {
    transform = [
      'translateX(-50%)',
      `translateX(${slideOffset * layerGap}px)`,
      `translateY(calc(-50% + ${translateY}px))`,
      `scale(${scale})`,
    ].join(' ')
  }

  return {
    left: '50%',
    top: '50%',
    transform,
    zIndex: Math.max(0, 10 - abs * 2),
    transition:
      'transform 600ms cubic-bezier(0.34, 1.3, 0.64, 1), opacity 500ms ease-out',
    pointerEvents: abs >= 3 ? 'none' : 'auto',
    perspective: '1200px',
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

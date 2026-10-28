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

export const resolveMediaCardRatingPosition = (opts: {
  hasActivityTag: boolean
  isAdult?: boolean
  newSeasonReleased?: boolean
}): string => {
  const { hasActivityTag, isAdult, newSeasonReleased } = opts
  if (hasActivityTag) {
    if (newSeasonReleased) return 'top-10 right-11'
    if (isAdult) return 'top-8 right-11'
    return 'top-3 right-11'
  }
  if (newSeasonReleased) return 'top-10 right-3'
  if (isAdult) return 'top-8 right-2.5'
  return 'top-2.5 right-2.5'
}


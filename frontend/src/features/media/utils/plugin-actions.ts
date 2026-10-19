import type { RequestWidget, PlayInstance } from '../components/organisms/plugin-detail-actions'

export const REQUESTABLE = new Set(['not_exists', 'error'])
export const IN_LIBRARY = new Set(['downloaded', 'requested', 'partially_available'])

export const getButtonState = (widget: RequestWidget) => {
  const instances = widget.props.instances || []
  const anyInLib = instances.some(i => IN_LIBRARY.has(i.status))
  const anyNotInLib = instances.some(i => REQUESTABLE.has(i.status))
  const anyDownloaded = instances.some(i => i.status === 'downloaded' || i.status === 'partially_available')
  const anyRequested = instances.some(i => i.status === 'requested' || i.status === 'partially_available')

  const requestLabel = widget.props.mediaType === 'movie' ? 'Request Movie' : 'Request Show'
  let label: string
  if (anyNotInLib) label = anyInLib ? 'Request Additional' : requestLabel
  else if (anyDownloaded && anyRequested) label = 'Partially Available'
  else if (anyDownloaded) label = 'Available'
  else label = 'Requested'

  let glow: string | null = null
  let statusTone: 'default' | 'emerald' | 'amber' = 'default'
  if (anyDownloaded) {
    glow = 'dk-interaction__glow--emerald'
    statusTone = 'emerald'
  } else if (anyRequested) {
    glow = 'dk-interaction__glow--amber'
    statusTone = 'amber'
  }
  return { label, glow, statusTone, anyDownloaded, anyRequested }
}

export const formatRemaining = (offsetMs: number, durationMs: number): string => {
  const leftMs = Math.max(0, durationMs - offsetMs)
  const totalMins = Math.round(leftMs / 60000)
  if (totalMins < 60) return `${totalMins}m left`
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  return `${hours}h ${mins > 0 ? `${mins}m ` : ''}left`
}

export const isPlexInstance = (inst?: PlayInstance | null): boolean => {
  if (!inst) return false
  const provider = inst.provider?.toLowerCase() || ''
  const providerLabel = inst.providerLabel?.toLowerCase() || ''
  const id = inst.id?.toLowerCase() || ''
  return provider === 'plex' || providerLabel === 'plex' || id.startsWith('plex|')
}

export const getStreamPresentation = (inst: PlayInstance) => {
  const offset = inst.viewOffset || 0
  const duration = inst.duration || 0
  const isResume = Boolean(offset > 5000 && (!duration || offset < duration - 15000) && !inst.viewed)
  const isWatched = Boolean(inst.viewed) && !isResume
  const hasEpisode = inst.seasonNumber != null && inst.episodeNumber != null
  const isPlex = isPlexInstance(inst)

  let primaryText: string
  let subText: string | null = null

  if (hasEpisode) {
    const epTag = `S${inst.seasonNumber}:E${inst.episodeNumber}`
    if (isResume) {
      primaryText = `Resume ${epTag}`
      subText = inst.episodeTitle || null
    } else if (isWatched) {
      primaryText = `Rewatch ${epTag}`
      subText = inst.episodeTitle || null
    } else {
      primaryText = `Play ${epTag}`
      subText = inst.episodeTitle || null
    }
  } else {
    if (isResume) {
      primaryText = 'Resume'
      subText = duration > 0 ? formatRemaining(offset, duration) : null
    } else if (isWatched) {
      primaryText = 'Watch Again'
    } else {
      primaryText = inst.title && inst.title !== inst.name && inst.title !== 'Stream' ? inst.title : 'Play'
    }
  }

  const progressPercent =
    inst.progressPercent ??
    (duration > 0 && offset > 0 ? Math.min(100, Math.round((offset / duration) * 100)) : 0)

  return { isResume, isWatched, primaryText, subText, progressPercent, isPlex }
}

export interface StreamButtonTheme {
  isPlex: boolean
  className: string
  iconClassName: string
  progressBarClassName: string
}

export const getStreamButtonTheme = (
  inst: PlayInstance,
  variant: 'default' | 'pill' = 'default',
): StreamButtonTheme => {
  const isPlex = isPlexInstance(inst)
  const { isResume } = getStreamPresentation(inst)

  if (variant === 'pill') {
    if (isPlex) {
      return {
        isPlex: true,
        className:
          'bg-gradient-to-r from-amber-500/25 via-amber-500/20 to-amber-600/25 text-amber-800 dark:text-amber-200 hover:from-amber-500/35 hover:via-amber-500/30 hover:to-amber-600/35 hover:text-amber-900 dark:hover:text-amber-100 shadow-lg shadow-amber-500/15 backdrop-blur-xl',
        iconClassName: 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400',
        progressBarClassName: 'bg-amber-500 dark:bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]',
      }
    }
    if (isResume) {
      return {
        isPlex: false,
        className:
          'bg-amber-500/25 text-amber-800 dark:text-amber-200 hover:bg-amber-500/35 hover:text-amber-900 dark:hover:text-amber-100 shadow-lg shadow-amber-500/10 backdrop-blur-xl',
        iconClassName: 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400',
        progressBarClassName: 'bg-amber-500 dark:bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]',
      }
    }
    return {
      isPlex: false,
      className:
        'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/30 hover:text-emerald-900 dark:hover:text-emerald-100 shadow-lg shadow-emerald-500/10 backdrop-blur-xl',
      iconClassName: 'fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400',
      progressBarClassName: 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]',
    }
  }

  // default / non-pill variant
  if (isPlex) {
    return {
      isPlex: true,
      className:
        'dk-interaction__btn glass-inset text-amber-800 dark:text-amber-200 hover:text-amber-900 dark:hover:text-amber-100 shadow-sm shadow-amber-500/10',
      iconClassName: 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400',
      progressBarClassName: 'bg-amber-500 dark:bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]',
    }
  }
  return {
    isPlex: false,
    className: 'dk-interaction__btn glass-inset text-foreground hover:text-foreground/90',
    iconClassName: 'fill-current text-current',
    progressBarClassName: 'bg-amber-500 dark:bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]',
  }
}

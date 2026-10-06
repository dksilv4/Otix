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

export const getStreamPresentation = (inst: PlayInstance) => {
  const offset = inst.viewOffset || 0
  const duration = inst.duration || 0
  const isResume = Boolean(offset > 5000 && (!duration || offset < duration - 15000) && !inst.viewed)
  const isWatched = Boolean(inst.viewed) && !isResume
  const hasEpisode = inst.seasonNumber != null && inst.episodeNumber != null

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
      primaryText = inst.title || 'Stream'
    }
  }

  const progressPercent =
    inst.progressPercent ??
    (duration > 0 && offset > 0 ? Math.min(100, Math.round((offset / duration) * 100)) : 0)

  return { isResume, isWatched, primaryText, subText, progressPercent }
}

import type { PlayableMediaItem } from '@/features/player/types/item'
import type { SeasonOut, EpisodeOut } from '@/features/media/queries/media-queries'
import type { StreamPlaybackSession, StreamSource } from '../types/stream-player'

export const safePlay = (el: HTMLVideoElement | null): void => {
  if (!el) return
  try {
    const res = el.play()
    if (res && typeof res.catch === 'function') {
      res.catch((err) => {
        if (err?.name === 'NotAllowedError') {
          // Autoplay policy: unmuted playback blocked. Try muted to start frames immediately.
          el.muted = true
          el.play().catch(() => {})
        }
      })
    }
  } catch {
    // Ignore error
  }
}

export const formatSeconds = (sec: number): string => {
  if (isNaN(sec) || sec < 0) return '0:00'
  const totalSec = Math.floor(sec)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export const calculateProgressFromEvent = (
  clientX: number,
  element: HTMLElement | null,
  duration: number,
): number => {
  if (!element || duration <= 0) return 0
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0) return 0
  const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return percent * duration
}

export interface PluginApi {
  callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown>
}

export const getPluginApi = (): PluginApi | undefined => {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { desktopAPI?: { plugin?: PluginApi } }).desktopAPI?.plugin
}

export { getPlexClientId, PLEX_CLIENT_ID_KEY } from '@/lib/player/utils'

export { buildYouTubeEmbedUrl } from '@/features/discover/utils/trailer'

export const formatAudioTrackLabel = (track: { label?: string; language?: string; index?: number }): string => {
  if (track.label && track.label !== 'Audio') return track.label
  if (track.language && track.language !== 'und') {
    return track.language.toUpperCase()
  }
  return `Track ${track.index ?? 1}`
}

export const formatAudioTrackDetails = (track: { codec?: string; channels?: number }): string => {
  const parts: string[] = []
  if (track.codec) parts.push(track.codec.toUpperCase())
  if (track.channels) {
    parts.push(track.channels === 6 ? '5.1' : track.channels === 8 ? '7.1' : `${track.channels}ch`)
  }
  return parts.join(' · ')
}

export const getAudioBadgeLabel = (
  activeAudio?: { label?: string; language?: string; index?: number } | null,
  audioTracks?: Array<{ label?: string; language?: string; index?: number }>,
): string => {
  const track = activeAudio || audioTracks?.[0]
  if (!track) return 'Audio'
  if (track.language && track.language !== 'und') {
    return track.language.toUpperCase()
  }
  if (track.label && track.label !== 'Audio') {
    return track.label
  }
  return `Track ${track.index ?? 1}`
}

export const formatSubtitleTrackLabel = (track: {
  label?: string
  language?: string
  index?: number
  format?: string
}): string => {
  if (track.label && track.label !== 'Subtitles') return track.label
  if (track.language && track.language !== 'und') {
    return track.language.toUpperCase()
  }
  return `Subtitle ${track.index !== undefined ? track.index + 1 : 1}`
}

export const getSubtitleBadgeLabel = (
  activeSubtitle?: { label?: string; language?: string } | null,
): string => {
  if (!activeSubtitle) return 'Off'
  if (activeSubtitle.language && activeSubtitle.language !== 'und') {
    return activeSubtitle.language.toUpperCase()
  }
  if (activeSubtitle.label && activeSubtitle.label !== 'Subtitles') {
    return activeSubtitle.label
  }
  return 'CC'
}

export interface WaveformBarData {
  norm: number
  baseHeightRatio: number
}

export const generateWaveformBars = (count = 64): WaveformBarData[] => {
  const bars: WaveformBarData[] = []
  const safeCount = Math.max(16, count)
  for (let i = 0; i < safeCount; i++) {
    const norm = safeCount > 1 ? i / (safeCount - 1) : 0
    // Multi-octave harmonic landscape with realistic acoustic dynamics
    const envelope = Math.sin(norm * Math.PI) * 0.32 + 0.28
    const broadWaves = Math.sin(norm * Math.PI * 4.2 + 0.3) * 0.16 + Math.cos(norm * Math.PI * 8.6 + 1.1) * 0.12
    const rhythmicDetail = Math.sin(norm * Math.PI * 18.2 + 0.8) * 0.08 + Math.cos(i * 1.85) * 0.06
    const highFrequency = Math.sin(i * 3.7) * 0.04
    const rawHeight = envelope + broadWaves + rhythmicDetail + highFrequency
    const base = Math.max(0.16, Math.min(0.96, rawHeight))
    bars.push({ norm, baseHeightRatio: Number(base.toFixed(3)) })
  }
  return bars
}

export interface BuildEpisodeQueueParams {
  showId: string
  showTitle?: string
  currentSeasonNumber: number
  currentEpisodeNumber: number
  seasons: SeasonOut[]
  sessionTemplate?: Partial<StreamPlaybackSession>
}

export const buildUpcomingEpisodeQueue = ({
  showId,
  showTitle,
  currentSeasonNumber,
  currentEpisodeNumber,
  seasons,
  sessionTemplate,
}: BuildEpisodeQueueParams): PlayableMediaItem[] => {
  if (!seasons || seasons.length === 0) return []

  const sortedSeasons = [...seasons]
    .filter((s) => s && typeof s.seasonNumber === 'number')
    .sort((a, b) => a.seasonNumber - b.seasonNumber)

  const source = (sessionTemplate?.source || 'plex') as StreamSource
  const queuedItems: PlayableMediaItem[] = []

  const createQueuedEpisodeItem = (
    seasonNumber: number,
    ep: EpisodeOut,
  ): PlayableMediaItem => {
    const title = ep.name || `Episode ${ep.episodeNumber}`
    const subtitle = `S${seasonNumber}:E${ep.episodeNumber} · ${title}`
    const seriesTitle = showTitle || 'Show'
    const duration = ep.runtime ? ep.runtime * 60 : undefined

    return {
      id: `${source}:${showId}-s${seasonNumber}-e${ep.episodeNumber}`,
      source,
      mediaType: 'video',
      subtype: 'episode',
      title: seriesTitle,
      subtitle,
      albumOrShowTitle: seriesTitle,
      artworkUrl: ep.stillUrl || sessionTemplate?.posterUrl || null,
      backdropUrl: sessionTemplate?.backdropUrl || null,
      duration,
      episodeContext: {
        seriesTitle,
        seasonNumber,
        episodeNumber: ep.episodeNumber,
        episodeTitle: title,
      },
      providerData: {
        ...(sessionTemplate || {}),
        showId,
        showTitle: seriesTitle,
        seasonNumber,
        episodeNumber: ep.episodeNumber,
        episodeTitle: title,
        title: seriesTitle,
        subtitle,
        isQueuedPlaceholder: true,
        episodeContext: {
          seriesTitle,
          seasonNumber,
          episodeNumber: ep.episodeNumber,
          episodeTitle: title,
        },
      },
    }
  }

  // 1. Remaining episodes in current season
  const currentSeason = sortedSeasons.find((s) => s.seasonNumber === currentSeasonNumber)
  if (currentSeason && Array.isArray(currentSeason.episodes)) {
    const remainingInSeason = [...currentSeason.episodes]
      .filter((ep) => ep && ep.episodeNumber > currentEpisodeNumber)
      .sort((a, b) => a.episodeNumber - b.episodeNumber)

    for (const ep of remainingInSeason) {
      queuedItems.push(createQueuedEpisodeItem(currentSeasonNumber, ep))
    }
  }

  // 2. Episodes from next season
  const nextSeason = sortedSeasons.find((s) => s.seasonNumber === currentSeasonNumber + 1)
  if (nextSeason && Array.isArray(nextSeason.episodes)) {
    const nextSeasonEpisodes = [...nextSeason.episodes]
      .filter((ep) => ep && typeof ep.episodeNumber === 'number')
      .sort((a, b) => a.episodeNumber - b.episodeNumber)

    for (const ep of nextSeasonEpisodes) {
      queuedItems.push(createQueuedEpisodeItem(nextSeason.seasonNumber, ep))
    }
  }

  // 3. If fewer than 5 upcoming episodes are queued, continue into subsequent seasons until at least 5
  if (queuedItems.length < 5) {
    const laterSeasons = sortedSeasons.filter((s) => s.seasonNumber > currentSeasonNumber + 1)
    for (const season of laterSeasons) {
      if (queuedItems.length >= 5) break
      if (!Array.isArray(season.episodes)) continue

      const seasonEpisodes = [...season.episodes]
        .filter((ep) => ep && typeof ep.episodeNumber === 'number')
        .sort((a, b) => a.episodeNumber - b.episodeNumber)

      for (const ep of seasonEpisodes) {
        queuedItems.push(createQueuedEpisodeItem(season.seasonNumber, ep))
        if (queuedItems.length >= 5) break
      }
    }
  }

  return queuedItems
}

export const getQueueItemEpisodeTitle = (item: PlayableMediaItem): string => {
  return item.episodeContext?.episodeTitle || item.title || 'Upcoming Media'
}

export const getQueueItemEpisodeSubtitle = (item: PlayableMediaItem): string => {
  if (item.episodeContext) {
    const epMarker = `S${item.episodeContext.seasonNumber}:E${item.episodeContext.episodeNumber}`
    const series = item.episodeContext.seriesTitle || item.albumOrShowTitle
    return series ? `${epMarker} · ${series}` : epMarker
  }
  return item.subtitle || item.albumOrShowTitle || ''
}



import type { StreamQualityOption } from '../types/stream-player'

export const DEFAULT_QUALITY_ID = 'auto'

export interface QualityPreset {
  id: string
  label: string
  description: string
  height: number
  maxVideoBitrate: number
  videoResolution: string
}

export const QUALITY_PRESETS: QualityPreset[] = [
  {
    id: '1080p',
    label: '1080p HD',
    description: '8 Mbps',
    height: 1080,
    maxVideoBitrate: 8000,
    videoResolution: '1920x1080',
  },
  {
    id: '720p',
    label: '720p HD',
    description: '4 Mbps',
    height: 720,
    maxVideoBitrate: 4000,
    videoResolution: '1280x720',
  },
  {
    id: '480p',
    label: '480p SD',
    description: '1.5 Mbps',
    height: 480,
    maxVideoBitrate: 1500,
    videoResolution: '720x480',
  },
  {
    id: '360p',
    label: '360p SD',
    description: '720 Kbps',
    height: 360,
    maxVideoBitrate: 720,
    videoResolution: '640x360',
  },
]

export const formatBitrate = (bitrate: number): string => {
  if (!bitrate || isNaN(bitrate) || bitrate <= 0) return ''
  if (bitrate >= 1_000_000) {
    const mbps = (bitrate / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `${mbps} Mbps`
  }
  const kbps = Math.round(bitrate / 1_000)
  return `${kbps} Kbps`
}

export interface BuildQualityOptionsParams {
  hlsLevels?: Array<{
    height?: number
    width?: number
    bitrate?: number
    name?: string
  }>
  hasDirectPlay?: boolean
  source?: string
}

export const buildQualityOptions = (params?: BuildQualityOptionsParams): StreamQualityOption[] => {
  const options: StreamQualityOption[] = [
    {
      id: 'auto',
      label: 'Auto',
      description: 'Adaptive',
      isAuto: true,
    },
  ]

  if (params?.hasDirectPlay) {
    options.push({
      id: 'original',
      label: 'Original',
      description: 'Direct Play',
      isOriginal: true,
    })
  }

  const hlsLevels = params?.hlsLevels

  if (hlsLevels && hlsLevels.length > 1) {
    const levelOptions: StreamQualityOption[] = hlsLevels.map((level, index) => {
      const height = level.height
      const label = height
        ? `${height}p${height >= 720 ? ' HD' : ''}`
        : level.name || `Level ${index + 1}`
      const description = level.bitrate ? formatBitrate(level.bitrate) : undefined

      return {
        id: `hls-${index}`,
        label,
        description,
        height: level.height,
        width: level.width,
        bitrate: level.bitrate,
        hlsLevelIndex: index,
      }
    })

    // Sort descending by height, then bitrate
    levelOptions.sort((a, b) => {
      const hDiff = (b.height || 0) - (a.height || 0)
      if (hDiff !== 0) return hDiff
      return (b.bitrate || 0) - (a.bitrate || 0)
    })

    options.push(...levelOptions)
  } else {
    // Single-level or server-side transcode presets
    for (const preset of QUALITY_PRESETS) {
      options.push({
        id: preset.id,
        label: preset.label,
        description: preset.description,
        height: preset.height,
        maxVideoBitrate: preset.maxVideoBitrate,
        videoResolution: preset.videoResolution,
      })
    }
  }

  return options
}

export const findQualityOption = (
  qualities: StreamQualityOption[],
  qualityId: string,
): StreamQualityOption | undefined => {
  return qualities.find((q) => q.id === qualityId)
}

export const getQualityBadgeLabel = (
  currentQualityId: string,
  qualities: StreamQualityOption[],
  activeLevelHeight?: number | null,
): string => {
  if (currentQualityId === 'auto') {
    if (activeLevelHeight && activeLevelHeight > 0) {
      return `Auto (${activeLevelHeight}p)`
    }
    return 'Auto'
  }

  if (currentQualityId === 'original') {
    return 'Original'
  }

  const match = findQualityOption(qualities, currentQualityId)
  if (match?.height) {
    return `${match.height}p`
  }

  if (match?.label) {
    return match.label.split(' ')[0]
  }

  return currentQualityId
}

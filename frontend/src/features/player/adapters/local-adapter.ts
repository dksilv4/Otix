import type {
  MediaSourceAdapter,
  PlayableMediaItem,
  ResolvedPlayback,
  ProgressReport,
} from '../types'
import { getSessionFile } from '@/features/music/local/utils/session-file-map'
import { getOrCreateBlobUrl } from '@/features/music/utils/blob-url-cache'
import { getAudioBlobFromDb } from '@/features/music/local/utils/local-music-db'

export class LocalSourceAdapter implements MediaSourceAdapter {
  readonly id = 'local'
  readonly name = 'Local Files'

  supports(item: PlayableMediaItem): boolean {
    return item.source === 'local'
  }

  async resolvePlayback(item: PlayableMediaItem): Promise<ResolvedPlayback> {
    const data = item.providerData || {}
    let url = String(data.url || data.directUrl || '')

    if (!url) {
      const sessionFile = getSessionFile(item.id) || (data.file as File | undefined)
      if (sessionFile) {
        url = getOrCreateBlobUrl(sessionFile) || ''
      }
    }

    if (!url) {
      try {
        const audioBlob = await getAudioBlobFromDb(item.id)
        if (audioBlob) {
          url = getOrCreateBlobUrl(audioBlob) || ''
        }
      } catch {
        // Fall through to desktop / path resolution
      }
    }

    const isDesktop = typeof window !== 'undefined' && Boolean((window as any).desktopAPI)
    const isAbsolutePath = Boolean(data.path && (/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(data.path)))

    if (!url && data.path && isDesktop && isAbsolutePath) {
      url = `local-media://localhost?path=${encodeURIComponent(data.path)}`
    } else if (!url && item.id.startsWith('local-audio-')) {
      const decodedPath = decodeURIComponent(item.id.replace('local-audio-', ''))
      if (isDesktop && (/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(decodedPath))) {
        url = `local-media://localhost?path=${encodeURIComponent(decodedPath)}`
      }
    } else if (!url && data.path && (data.path.startsWith('blob:') || data.path.startsWith('http'))) {
      url = data.path
    }

    if (!url) {
      throw new Error(`Audio file "${item.title || 'Track'}" is not accessible. Please re-import or select folder.`)
    }

    const isVideo = item.mediaType === 'video'

    return {
      engine: isVideo ? 'html5-video' : 'html5-audio',
      playbackMethod: 'direct-play',
      directUrl: url,
      streamUrl: url,
    }
  }

  async reportProgress(_report: ProgressReport): Promise<void> {
    // Local desktop playback does not require remote scrobbling
  }
}

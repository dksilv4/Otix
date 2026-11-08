import type {
  MediaSourceAdapter,
  PlayableMediaItem,
  ResolvedPlayback,
  ProgressReport,
} from '../types'

export class LocalSourceAdapter implements MediaSourceAdapter {
  readonly id = 'local'
  readonly name = 'Local Files'

  supports(item: PlayableMediaItem): boolean {
    return item.source === 'local'
  }

  async resolvePlayback(item: PlayableMediaItem): Promise<ResolvedPlayback> {
    const data = item.providerData || {}
    let url = String(data.url || data.directUrl || '')

    if (!url && data.path) {
      url = `local-media://localhost?path=${encodeURIComponent(data.path)}`
    } else if (!url && item.id.startsWith('local-audio-')) {
      const decodedPath = decodeURIComponent(item.id.replace('local-audio-', ''))
      url = `local-media://localhost?path=${encodeURIComponent(decodedPath)}`
    } else if (!url) {
      url = item.id
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

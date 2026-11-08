import type {
  MediaSourceAdapter,
  PlayableMediaItem,
  ResolvedPlayback,
  ProgressReport,
} from '../types'
import { buildYouTubeEmbedUrl } from '@/features/discover/utils/trailer'
import { extractYoutubeIdFromUrl } from '@/features/discover/utils/hero'

export class YouTubeSourceAdapter implements MediaSourceAdapter {
  readonly id = 'youtube'
  readonly name = 'YouTube'

  supports(item: PlayableMediaItem): boolean {
    return item.source === 'youtube'
  }

  async resolvePlayback(item: PlayableMediaItem): Promise<ResolvedPlayback> {
    const rawId = item.id.replace(/^youtube:/, '').replace(/^yt:/, '')
    const cleanId = extractYoutubeIdFromUrl(rawId) || rawId
    const embedUrl = buildYouTubeEmbedUrl(cleanId)

    return {
      engine: 'youtube',
      embedUrl,
      streamUrl: embedUrl,
      playbackMethod: 'direct-play',
    }
  }

  async reportProgress(_report: ProgressReport): Promise<void> {
    // YouTube iframe handles its own internal watch progress
  }
}

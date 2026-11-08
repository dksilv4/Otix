import type {
  MediaSourceAdapter,
  PlayableMediaItem,
  ResolvedPlayback,
  ProgressReport,
} from '../types'

export class DirectSourceAdapter implements MediaSourceAdapter {
  readonly id = 'direct'
  readonly name = 'Direct Media Stream'

  supports(item: PlayableMediaItem): boolean {
    return (
      item.source === 'direct' ||
      item.id.startsWith('http://') ||
      item.id.startsWith('https://') ||
      item.id.startsWith('blob:')
    )
  }

  async resolvePlayback(item: PlayableMediaItem): Promise<ResolvedPlayback> {
    const url = item.providerData?.url || item.providerData?.directUrl || item.id
    const isHls = url.includes('.m3u8')
    const isVideo = item.mediaType === 'video'

    if (isHls) {
      return {
        engine: 'hls',
        hlsUrl: url,
        streamUrl: url,
        playbackMethod: 'direct-stream',
      }
    }

    return {
      engine: isVideo ? 'html5-video' : 'html5-audio',
      directUrl: url,
      streamUrl: url,
      playbackMethod: 'direct-play',
    }
  }

  async reportProgress(_report: ProgressReport): Promise<void> {
    // Generic direct stream does not have a default reporting endpoint
  }
}

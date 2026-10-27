import { UnifiedMediaPlayerModal } from '@/features/media/components/organisms/unified-media-player-modal'
import {
  type VideoPlayerSettings,
  loadPlayerSettings,
  savePlayerSettings,
  formatTime,
  buildYouTubeEmbedUrl,
} from '@/features/discover/utils/trailer'

export { loadPlayerSettings, savePlayerSettings, formatTime, buildYouTubeEmbedUrl, type VideoPlayerSettings }

export interface TrailerVideoModalProps {
  youtubeId: string
  title: string
  isExiting?: boolean
  onClose: () => void
}

export const TrailerVideoModal = ({ youtubeId, title, isExiting, onClose }: TrailerVideoModalProps) => {
  return (
    <UnifiedMediaPlayerModal
      mode="trailer"
      youtubeId={youtubeId}
      title={title}
      isExiting={isExiting}
      onClose={onClose}
    />
  )
}

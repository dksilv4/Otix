import GoogleIcon from '@/assets/provider-logos/google.svg?react'
import { RefreshCw } from 'lucide-react'
import {
  IntegrationAction,
  IntegrationProfile,
} from '../settings-integration-card'
import { BRAND_COLORS, BRAND_BG } from '../../../utils/integrations'
import type { useIntegrationsPageState } from '../../../hooks/use-integrations-page-state'

export const YouTubeCardContent = ({ state }: { state: ReturnType<typeof useIntegrationsPageState> }) => {
  return (
    <>
          <IntegrationProfile
            avatarUrl={state.googleAvatarUrl}
            avatarAlt={state.googleName ?? 'YouTube avatar'}
            name={state.googleName ?? 'YouTube User'}
            detail={state.googleEmail ? `YouTube account (${state.googleEmail})` : 'Link YouTube account'}
            brandBg={BRAND_BG.youtube}
            icon={GoogleIcon}
            brandColor={BRAND_COLORS.youtube}
          />
          <IntegrationAction label="YouTube Sync" description="YouTube Liked Videos" result={state.youtubeSyncResult ? `${state.youtubeSyncResult.videos} videos, ${state.youtubeSyncResult.channels} channels` : null} buttonLabel={state.youtubeSyncing ? 'Syncing...' : state.youtubeSyncResult ? 'Re-sync' : 'Sync Liked Videos'} buttonIcon={RefreshCw} onPress={state.handleYouTubeSync} loading={state.youtubeSyncing} disabled={state.youtubeSyncing} progress={state.youtubeProgress && <span className="text-xs text-primary">{state.youtubeProgress.phase}{state.youtubeProgress.detail ? ` (${state.youtubeProgress.detail})` : ''}</span>} />
          {state.youtubeMessage && <p className="px-5 py-2 text-xs text-green-400">{state.youtubeMessage}</p>}
          {state.youtubeError && <p className="px-5 py-2 text-xs text-red-400">{state.youtubeError}</p>}
        </>
  )
}

import GoogleIcon from '@/assets/provider-logos/google.svg?react'
import { IntegrationProfile } from '../settings-integration-card'
import { BRAND_COLORS, BRAND_BG } from '../../../utils/integrations'
import type { useIntegrationsPageState } from '../../../hooks/use-integrations-page-state'

export const GoogleCardContent = ({ state }: { state: ReturnType<typeof useIntegrationsPageState> }) => {
  return (
    <>
          <IntegrationProfile
            avatarUrl={state.googleAvatarUrl}
            avatarAlt={state.googleName ?? 'Google avatar'}
            name={state.googleName ?? 'Google User'}
            detail={state.googleEmail ?? 'Google account linked'}
            brandBg={BRAND_BG.google}
            icon={GoogleIcon}
            brandColor={BRAND_COLORS.google}
          />
          {state.googleMessage && <p className="px-5 py-2 text-xs text-green-400">{state.googleMessage}</p>}
          {state.googleError && <p className="px-5 py-2 text-xs text-red-400">{state.googleError}</p>}
        </>
  )
}

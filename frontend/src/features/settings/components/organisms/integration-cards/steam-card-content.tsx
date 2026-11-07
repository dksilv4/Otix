import { Link } from '@tanstack/react-router'
import { FolderOpen } from 'lucide-react'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import {
  IntegrationProfile,
  IntegrationStats,
} from '../settings-integration-card'
import {
  BRAND_COLORS,
  BRAND_BG,
  formatAccountAge,
  personaStateLabel,
} from '../../../utils/integrations'
import type { useIntegrationsPageState } from '../../../hooks/use-integrations-page-state'

export const SteamCardContent = ({ state }: { state: ReturnType<typeof useIntegrationsPageState> }) => {
  return (
    <>
          <IntegrationProfile
            avatarUrl={state.steamProfile?.avatarfull}
            avatarAlt={state.steamProfile?.personaname ?? 'Steam avatar'}
            name={state.steamProfile?.personaname ?? 'Steam User'}
            detail={state.steamProfile?.realname ?? (state.displayedSteamId ? `Steam ID: ${state.displayedSteamId}` : 'Steam account linked')}
            brandBg={BRAND_BG.steam}
            icon={SteamIcon}
            brandColor={BRAND_COLORS.steam}
            meta={state.steamProfile?.profileurl && (
              <a href={state.steamProfile.profileurl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors duration-150 shrink-0">
                View Profile &rarr;
              </a>
            )}
          />
          {state.steamProfile && (
            <IntegrationStats items={[
              ...(state.steamProfile.timecreated ? [{ label: 'account age', value: formatAccountAge(state.steamProfile.timecreated) }] : []),
              ...(state.steamProfile.loccountrycode ? [{ label: 'location', value: state.steamProfile.loccountrycode }] : []),
              ...(state.steamProfile.personastate !== null && state.steamProfile.personastate !== undefined ? [{ label: 'status', value: personaStateLabel(state.steamProfile.personastate) }] : []),
            ]} />
          )}
          <div className="mx-5 my-3 p-3.5 rounded-xl bg-[var(--dk-surface-ghost)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <FolderOpen className="h-4 w-4 text-sky-500 shrink-0" />
              <span>
                Game scanning, wishlist syncing, and auto-matching are managed under
                {' '}<strong>Library Settings</strong> as a Provider.
              </span>
            </div>
            <Link
              to="/settings/library"
              className="px-3.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-500 text-xs font-semibold whitespace-nowrap transition-colors self-start sm:self-auto shrink-0"
            >
              Go to Library Settings &rarr;
            </Link>
          </div>
          {state.steamMessage && <p className="px-5 py-2 text-xs text-green-400">{state.steamMessage}</p>}
          {state.steamError && <p className="px-5 py-2 text-xs text-red-400">{state.steamError}</p>}
        </>
  )
}

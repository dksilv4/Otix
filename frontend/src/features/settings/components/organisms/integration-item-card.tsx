import { IntegrationCard } from './settings-integration-card'
import { SteamCardContent } from './integration-cards/steam-card-content'
import { EpicCardContent } from './integration-cards/epic-card-content'
import { GogCardContent } from './integration-cards/gog-card-content'
import { PlexCardContent } from './integration-cards/plex-card-content'
import { GoogleDriveCardContent } from './integration-cards/google-drive-card-content'
import { GoogleCardContent } from './integration-cards/google-card-content'
import { YouTubeCardContent } from './integration-cards/youtube-card-content'
import { TmdbCardContent } from './integration-cards/tmdb-card-content'
import type { IntegrationDef } from '../../types'
import type { useIntegrationsPageState } from '../../hooks/use-integrations-page-state'

interface IntegrationItemCardProps {
  item: IntegrationDef
  state: ReturnType<typeof useIntegrationsPageState>
}

export const IntegrationItemCard = ({ item: i, state }: IntegrationItemCardProps) => {
  return (
    <IntegrationCard
      key={i.id}
      name={i.name}
      description={i.description}
      brandColor={i.brandColor}
      brandBg={i.brandBg}
      icon={i.icon}
      isConnected={i.isConnected}
      expanded={state.expandedId === i.id}
      onToggle={() => state.toggleExpand(i.id)}
      onConnect={i.onConnect}
      connecting={i.connecting}
      connectDisabled={(i as any).connectDisabled}
      onDisconnect={i.onDisconnect}
      disconnecting={i.disconnecting}
      error={i.error}
    >
      {i.id === 'steam' && <SteamCardContent state={state} />}
      {i.id === 'epic' && <EpicCardContent state={state} />}
      {i.id === 'gog' && <GogCardContent state={state} />}
      {i.id === 'plex' && <PlexCardContent state={state} />}
      {i.id === 'google_drive' && <GoogleDriveCardContent state={state} />}
      {i.id === 'google' && <GoogleCardContent state={state} />}
      {i.id === 'youtube' && <YouTubeCardContent state={state} />}
      {i.id === 'tmdb' && <TmdbCardContent state={state} />}
    </IntegrationCard>
  )
}

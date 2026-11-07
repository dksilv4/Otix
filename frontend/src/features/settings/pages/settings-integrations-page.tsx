import { Search, Loader2, Link2, HardDrive } from 'lucide-react'
import { SettingsCard } from '../components/molecules/settings-card'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import { useSettingsNode } from '../context/settings-node-context'
import { PlexStorageOptimizerModal } from '@/features/integrations/plex-storage'
import { useIntegrationsPageState } from '../hooks/use-integrations-page-state'
import { IntegrationItemCard } from '../components/organisms/integration-item-card'
import { ConnectedNodesSettingsCard } from '../components/organisms/connected-nodes-settings-card'

export const SettingsIntegrationsPage = () => {
  useSettingsHashScroll()
  const state = useIntegrationsPageState()
  const { setSelectedNodeId } = useSettingsNode()

  if (!state.isAuthenticated) {
    return (
      <SettingsLockedState
        title="Sign in to manage connections"
        description="Connect Steam, Plex, TMDb, YouTube, and download clients after you sign in."
        icon={Link2}
      />
    )
  }

  return (
    <div id="settings-connections-section" className="space-y-6">
      <SectionHeader variant="page" icon={Link2} title="Connections" />
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={state.searchQuery}
          onChange={(e) => state.setSearchQuery(e.target.value)}
          placeholder="Search integrations..."
          className="w-full h-10 rounded-xl bg-[var(--dk-surface-field)] pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors"
        />
      </div>

      {state.loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading integrations...
        </div>
      ) : state.filteredIntegrations.length === 0 && state.filteredNodes.length === 0 ? (
        <div className="rounded-2xl p-8 text-center bg-[var(--dk-surface-ghost)]">
          <p className="text-sm text-muted-foreground">No integrations match &quot;{state.searchQuery}&quot;</p>
        </div>
      ) : (
        <>
          {state.accountIntegrations.length > 0 && (
            <div id="accounts" className="scroll-mt-28">
              <SettingsCard className="space-y-2">
                <SectionHeader
                  icon={Link2}
                  title="Accounts"
                  description="Sign in with Steam, Plex, TMDb, Google, and more."
                />
                {state.accountIntegrations.map((i) => (
                  <IntegrationItemCard key={i.id} item={i} state={state} />
                ))}
              </SettingsCard>
            </div>
          )}

          {/* Connected Nodes */}
          <ConnectedNodesSettingsCard
            filteredNodes={state.filteredNodes}
            servers={state.servers}
            query={state.query}
            setSelectedNodeId={setSelectedNodeId}
          />

          {/* Services & Storage */}
          {state.serviceIntegrations.length > 0 && (
            <div id="services" className="scroll-mt-28">
              <SettingsCard className="space-y-2">
                <SectionHeader
                  icon={HardDrive}
                  title="Services & Storage"
                  description="Real-Debrid, Google Drive, YouTube, and cloud providers."
                />
                {state.serviceIntegrations.map((i) => (
                  <IntegrationItemCard key={i.id} item={i} state={state} />
                ))}
              </SettingsCard>
            </div>
          )}
        </>
      )}

      {state.plexStorageModalOpen && (
        <PlexStorageOptimizerModal
          open={state.plexStorageModalOpen}
          onOpenChange={state.setPlexStorageModalOpen}
        />
      )}
    </div>
  )
}

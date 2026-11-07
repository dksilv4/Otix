import { Link } from '@tanstack/react-router'
import { Server, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SettingsCard } from '../molecules/settings-card'
import { SectionHeader } from '../molecules/settings-section-header'
import type { GameServer } from '../../types'

interface ConnectedNodesSettingsCardProps {
  filteredNodes: GameServer[]
  servers: GameServer[]
  query: string
  setSelectedNodeId: (id: number) => void
}

export const ConnectedNodesSettingsCard = ({
  filteredNodes,
  servers,
  query,
  setSelectedNodeId,
}: ConnectedNodesSettingsCardProps) => {
  if (filteredNodes.length === 0 && (servers.length > 0 || query)) {
    return null
  }

  return (
    <div id="connected-nodes" className="scroll-mt-28">
      <SettingsCard className="space-y-3">
        <SectionHeader
          icon={Server}
          title="Connected Nodes"
          description="Worker daemons and companion hosts running downloaders, indexers, and services."
        />
        {filteredNodes.length === 0 && servers.length === 0 ? (
          <div className="rounded-2xl p-5 bg-[var(--dk-surface-ghost)] border border-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No Connected Nodes</p>
              <p className="text-xs text-muted-foreground">
                Connect a desktop companion or worker daemon to configure local downloaders and arr services.
              </p>
            </div>
            <Link
              to="/settings/nodes"
              hash="infrastructure"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground shadow-xs shrink-0 self-start sm:self-center cursor-pointer"
            >
              <Server className="h-3.5 w-3.5" />
              <span>Manage Nodes</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {filteredNodes.map((node) => (
              <Link
                key={node.id}
                to="/settings/node-connections"
                onClick={() => setSelectedNodeId(node.id)}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] transition-all cursor-pointer text-left w-full"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Server className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                        {node.name}
                      </span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1',
                          node.isOnline
                            ? 'bg-status-online/15 text-status-online'
                            : 'bg-status-offline/15 text-status-offline',
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                        <span>{node.isOnline ? 'Online' : 'Offline'}</span>
                      </span>
                      {node.isLocalDesktop && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                          Otix App
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {node.primaryUrl || node.localUrl || 'Local endpoint'} &bull; SABnzbd, Prowlarr, Radarr, Sonarr
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    <span>Open Connections</span>
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  )
}

import { AlertTriangle, Server, Settings } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import type { GameServer } from '@/features/downloads/use-server-downloads'

export interface NodeConnectionsHeaderProps {
  server: GameServer
  connectedCount: number
  totalCount: number
  nodeOpen: boolean
  onToggleOpen: () => void
  onOpenSettings?: (server: GameServer) => void
}

export const NodeConnectionsHeader = ({
  server,
  connectedCount,
  totalCount,
  nodeOpen,
  onToggleOpen,
  onOpenSettings,
}: NodeConnectionsHeaderProps) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggleOpen()
        }
      }}
      className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          backgroundColor: 'var(--dk-surface-glass)',
          boxShadow: 'var(--dk-shadow-sm)',
        }}
      >
        <Server className="w-5 h-5 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">{server.name}</span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--dk-surface-field)] border border-white/[0.04] text-muted-foreground">
            {connectedCount} of {totalCount} connected
          </span>
          {server.isOnline ? (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-status-online/15 text-status-online">
              Online
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-status-offline/15 text-status-offline border border-white/[0.04]">
              <AlertTriangle size={10} />
              Offline
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {server.primaryUrl || server.localUrl || 'Remote worker node'} &bull; SABnzbd, Prowlarr, Radarr, Sonarr
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onOpenSettings && (
          <DkButton
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              onOpenSettings(server)
            }}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Node Settings</span>
          </DkButton>
        )}
        <DkButton
          size="sm"
          variant="ghost"
          className="text-xs text-muted-foreground cursor-pointer"
        >
          {nodeOpen ? 'Collapse' : 'Expand'}
        </DkButton>
      </div>
    </div>
  )
}

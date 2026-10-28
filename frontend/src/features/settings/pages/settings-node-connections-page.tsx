import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Network, Server, Search, ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { useSettingsNode } from '../context/settings-node-context'
import { SettingsNodeSwitcherBar } from '../components/molecules/settings-node-switcher-bar'
import { NodeConnectionsGroup } from '../components/organisms/node-connections-group'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { GLOBAL_PROFILE_NODE_ID } from '../utils/node-switcher'

export const SettingsNodeConnectionsPage = () => {
  const { isAuthenticated } = useAuth()
  const { servers, selectedNode, selectedNodeId, setSelectedNodeId, isLoading } = useSettingsNode()
  const { config: dlConfig } = useDownloadConfig()
  const [searchQuery, setSearchQuery] = useState('')

  const activeNodeId =
    selectedNodeId !== null && selectedNodeId !== undefined
      ? selectedNodeId
      : (selectedNode?.id ?? (servers[0]?.id ?? GLOBAL_PROFILE_NODE_ID))

  const activeServer =
    servers.find((s) => s.id === activeNodeId) ||
    selectedNode ||
    servers[0] ||
    null

  if (!isAuthenticated) {
    return (
      <SettingsLockedState
        title="Sign in required"
        description="Sign in to view and configure service connections for your Otix nodes."
        icon={Network}
        action={<span />}
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shrink-0 shadow-xs">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Node Connections</h1>
              {activeServer && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-foreground">
                  {activeServer.name}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure SABnzbd, Prowlarr, Radarr, and Sonarr service integrations for this node.
            </p>
          </div>
        </div>

        {activeServer && (
          <div className="flex items-center gap-2 self-start sm:self-center">
            <Link
              to="/settings/nodes/$nodeId"
              params={{ nodeId: String(activeServer.id) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] transition-all cursor-pointer"
              title="Inspect node infrastructure details"
            >
              <Server className="h-3.5 w-3.5 text-primary" />
              <span>Node Details</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Link>
          </div>
        )}
      </div>

      {/* Node Selector Tabs */}
      {servers.length > 0 && (
        <SettingsNodeSwitcherBar
          activeNodeId={activeNodeId}
          onSelectNodeId={(id) => setSelectedNodeId(id)}
          servers={servers}
          dlConfig={dlConfig}
        />
      )}

      {/* Search Input */}
      {activeServer && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search connections (SABnzbd, Prowlarr, Radarr, Sonarr, usenet, indexers)..."
            className="w-full h-10 rounded-2xl bg-[var(--dk-surface-field)] pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors border border-white/[0.04]"
          />
        </div>
      )}

      {/* Content Area */}
      {isLoading && servers.length === 0 ? (
        <div className="p-8 rounded-3xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center space-y-2">
          <p className="text-sm text-muted-foreground">Loading connected nodes...</p>
        </div>
      ) : !activeServer ? (
        <div className="p-8 rounded-3xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center space-y-3">
          <Server className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">No Connected Nodes</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Connect an Otix companion daemon or worker node to configure local downloaders and arr service integrations.
            </p>
          </div>
          <Link
            to="/settings/nodes"
            hash="infrastructure"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground shadow-xs hover:opacity-95 transition-opacity"
          >
            <Server className="h-3.5 w-3.5" />
            <span>Connect Node in Infrastructure</span>
          </Link>
        </div>
      ) : (
        <NodeConnectionsGroup
          server={activeServer}
          searchQuery={searchQuery}
          defaultExpanded
          hideNodeHeader
        />
      )}
    </div>
  )
}

export default SettingsNodeConnectionsPage

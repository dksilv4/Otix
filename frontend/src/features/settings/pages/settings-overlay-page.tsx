import { Sparkles, Server } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { useSettingsNode } from '../context/settings-node-context'
import { NodeOverlaySettings } from '../components/organisms/node-overlay-settings'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { GLOBAL_PROFILE_NODE_ID } from '../utils/node-switcher'

export const SettingsOverlayPage = () => {
  const { isAuthenticated } = useAuth()
  const { servers, selectedNode, selectedNodeId } = useSettingsNode()

  const activeNodeId =
    selectedNodeId !== null && selectedNodeId !== undefined
      ? selectedNodeId
      : (selectedNode?.id ?? (servers[0]?.id ?? GLOBAL_PROFILE_NODE_ID))

  const activeServer =
    servers.find((s) => s.id === activeNodeId) ||
    selectedNode ||
    servers[0] ||
    null

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shrink-0 shadow-xs">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-foreground">In-Game Overlay & HUD</h1>
              {activeServer && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-foreground">
                  {activeServer.name}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live FPS, 1% low framerate timings, session playtime HUD, monitor targeting, and process auto-detection.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {activeServer ? (
        <NodeOverlaySettings key={activeServer.id} server={activeServer} />
      ) : (
        <div className="p-8 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center space-y-3">
          <Server className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <h3 className="text-sm font-semibold text-foreground">No Node Selected</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Select a worker node from the secondary menu dropdown to configure its in-game HUD overlay.
          </p>
        </div>
      )}
    </div>
  )
}

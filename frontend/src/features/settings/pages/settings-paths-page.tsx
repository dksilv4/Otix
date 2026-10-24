import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/lib/providers/auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { useSettingsNode } from '../context/settings-node-context'
import { SettingsNodeSwitcherBar } from '../components/molecules/settings-node-switcher-bar'
import { SettingsPathsSection } from '../components/organisms/settings-paths-section'
import { GLOBAL_PROFILE_NODE_ID } from '../utils/node-switcher'
import { FolderOpen } from 'lucide-react'

export const SettingsPathsPage = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { servers, selectedNode, selectedNodeId, setSelectedNodeId } = useSettingsNode()
  const { config: dlConfig } = useDownloadConfig(user?.id)

  const activeNodeId =
    selectedNodeId !== null && selectedNodeId !== undefined
      ? selectedNodeId
      : (selectedNode?.id ?? GLOBAL_PROFILE_NODE_ID)

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col gap-1 pb-1">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Paths</h1>
            <p className="text-xs text-muted-foreground">
              Manage library scan locations, games install paths, and storage directories per node.
            </p>
          </div>
        </div>
      </div>

      {/* Node Selector Tabs */}
      <SettingsNodeSwitcherBar
        activeNodeId={activeNodeId}
        onSelectNodeId={(id) => setSelectedNodeId(id)}
        servers={servers}
        dlConfig={dlConfig}
      />

      {/* Paths Section */}
      <SettingsPathsSection
        nodeId={activeNodeId}
        onNavigateToOrganize={() => navigate({ to: '/settings/organize' })}
      />
    </div>
  )
}

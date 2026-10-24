import { useAuth } from '@/lib/providers/auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { useSettingsNode } from '../context/settings-node-context'
import { SettingsNodeSwitcherBar } from '../components/molecules/settings-node-switcher-bar'
import { SettingsOrganizeSection } from '../components/organisms/settings-organize-section'
import { GLOBAL_PROFILE_NODE_ID } from '../utils/node-switcher'

export const SettingsOrganizePage = () => {
  const { user } = useAuth()
  const { servers, selectedNode, selectedNodeId, setSelectedNodeId } = useSettingsNode()
  const { config: dlConfig } = useDownloadConfig(user?.id)

  const activeNodeId =
    selectedNodeId !== null && selectedNodeId !== undefined
      ? selectedNodeId
      : (selectedNode?.id ?? GLOBAL_PROFILE_NODE_ID)

  return (
    <div className="space-y-4">
      {/* Node Selector Tabs */}
      <SettingsNodeSwitcherBar
        activeNodeId={activeNodeId}
        onSelectNodeId={(id) => setSelectedNodeId(id)}
        servers={servers}
        dlConfig={dlConfig}
      />

      {/* Organize Section */}
      <SettingsOrganizeSection nodeId={activeNodeId} />
    </div>
  )
}

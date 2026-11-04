import { useSettingsNode } from '../context/settings-node-context'
import { SettingsOrganizeSection } from '../components/organisms/settings-organize-section'
import { GLOBAL_PROFILE_NODE_ID } from '../utils/node-switcher'

export const SettingsOrganizePage = () => {
  const { selectedNode, selectedNodeId } = useSettingsNode()

  const activeNodeId =
    selectedNodeId !== null && selectedNodeId !== undefined
      ? selectedNodeId
      : (selectedNode?.id ?? GLOBAL_PROFILE_NODE_ID)

  return (
    <div className="space-y-4">
      {/* Organize Section */}
      <SettingsOrganizeSection nodeId={activeNodeId} />
    </div>
  )
}

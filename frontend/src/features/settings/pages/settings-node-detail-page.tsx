import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useParams } from '@tanstack/react-router'
import { isLocalDesktopNodeId, getLocalDesktopNodeFallback } from '../local-desktop-node'
import { useSettingsNode } from '../context/settings-node-context'
import {
  parseNodeIdParam,
  resolveNodeSettingsTab,
  type NodeSettingsTab,
} from '../node-settings'
import { NodeSettingsModal } from '../components/organisms/node-settings-modal'

export function SettingsNodeDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams({ strict: false }) as { nodeId?: string }
  const nodeId = parseNodeIdParam(params.nodeId)
  const { servers, isLoading, setSelectedNodeId } = useSettingsNode()
  const server =
    servers.find((item) => item.id === nodeId) ??
    (isLocalDesktopNodeId(nodeId) ? getLocalDesktopNodeFallback() : null)

  useEffect(() => {
    if (server) setSelectedNodeId(server.id)
  }, [server, setSelectedNodeId])

  const activeTab = resolveNodeSettingsTab(
    location?.hash || (typeof window !== 'undefined' ? window.location.hash : ''),
  )

  const handleTabChange = useCallback(
    (tab: NodeSettingsTab) => {
      if (nodeId == null) return
      const hash = tab === 'paths' ? undefined : tab
      void navigate({
        to: '/settings/nodes/$nodeId',
        params: { nodeId: String(nodeId) },
        hash,
        replace: true,
      })
    },
    [navigate, nodeId],
  )

  const handleClose = useCallback(() => {
    void navigate({ to: '/settings/nodes' })
  }, [navigate])

  return (
    <NodeSettingsModal
      server={server}
      isLoading={isLoading}
      open={true}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      initialTab={activeTab}
      onTabChange={handleTabChange}
      onDisconnectSuccess={handleClose}
    />
  )
}

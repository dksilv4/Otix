import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Server, Trash2 } from 'lucide-react'
import { useLocation, useNavigate, useParams } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { DkTabs, DkTabList, DkTab, DkTabPanel } from '@ui/molecules/tabs'
import { NodeDownloaderCard } from '@/features/downloads/molecules/node-downloader-card'
import { ImportNodeInstancesButton } from '@/features/downloads/molecules/import-node-instances-modal'
import { useDeleteGameServer } from '@/features/downloads/use-server-downloads'
import { isLocalDesktopNode, isLocalDesktopNodeId, getLocalDesktopNodeFallback } from '../local-desktop-node'
import { useSettingsNode } from '../context/settings-node-context'
import {
  NODE_SETTINGS_TABS,
  parseNodeIdParam,
  resolveNodeSettingsTab,
  type NodeSettingsTab,
} from '../node-settings'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsPathsSection } from '../components/organisms/settings-paths-section'
import { SettingsOrganizeSection } from '../components/organisms/settings-organize-section'
import { SettingsNodeSharingSection } from '../components/organisms/settings-node-sharing-section'
import { SettingsNodeEpicSection } from '../components/organisms/settings-node-epic-section'
import { NodeMachineSettings } from '../components/organisms/node-machine-settings'
import { QueryErrorBoundary } from '@/components/query-error-boundary'

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

  const [activeTab, setActiveTab] = useState<NodeSettingsTab>(() =>
    resolveNodeSettingsTab(location?.hash || (typeof window !== 'undefined' ? window.location.hash : '')),
  )

  useEffect(() => {
    setActiveTab(resolveNodeSettingsTab(location?.hash || (typeof window !== 'undefined' ? window.location.hash : '')))
  }, [location?.hash])

  const handleTabChange = useCallback(
    (tab: NodeSettingsTab) => {
      setActiveTab(tab)
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

  const { toast } = useToast()
  const deleteServerMutation = useDeleteGameServer()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const handleDisconnectNode = async () => {
    if (!server) return
    try {
      await deleteServerMutation.mutateAsync(server.id)
      toast({
        title: 'Node disconnected',
        description: `Removed ${server.name} from your nodes.`,
        variant: 'default',
      })
      setConfirmDisconnect(false)
      goBack()
    } catch (err: any) {
      toast({
        title: 'Error disconnecting node',
        description: err.message,
        variant: 'error',
      })
    }
  }

  const goBack = () => {
    void navigate({ to: '/settings/nodes' })
  }

  if (isLoading && !server) {
    return (
      <div className="flex items-center justify-center py-20 text-white/50 gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>Loading node...</span>
      </div>
    )
  }

  if (!server) {
    return (
      <div className="space-y-4">
        <SectionHeader
          variant="page"
          icon={Server}
          title="Node not found"
          description="This Otix node is not connected to your account."
        />
        <DkButton size="sm" variant="ghost" onClick={goBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to nodes
        </DkButton>
      </div>
    )
  }

  const local = isLocalDesktopNode(server)
  const description = local
    ? 'Folders, organize, downloaders, and app behavior on this computer.'
    : `Folders, organize, downloaders, and machine settings on ${server.name}.`

  return (
    <div className="space-y-6">
      <SectionHeader
        variant="page"
        icon={Server}
        title={server.name}
        description={description}
        action={
          <div className="flex items-center gap-2">
            {!local && (
              <DkButton
                size="sm"
                variant="ghost"
                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                onClick={() => setConfirmDisconnect(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Disconnect Node
              </DkButton>
            )}
            <DkButton size="sm" variant="ghost" onClick={goBack}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Nodes
            </DkButton>
          </div>
        }
      />

      {confirmDisconnect && (
        <DkDialog
          open={confirmDisconnect}
          onOpenChange={(open) => {
            if (!open) setConfirmDisconnect(false)
          }}
          title="Disconnect Node"
          description={`Are you sure you want to disconnect ${server.name}?`}
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-white/70 leading-relaxed">
              This node will be removed from your account. Any active downloads will be stopped and you will need to re-claim or add the node again to reconnect.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleteServerMutation.isPending}
                onClick={() => setConfirmDisconnect(false)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                loading={deleteServerMutation.isPending}
                onClick={handleDisconnectNode}
              >
                Disconnect Node
              </DkButton>
            </div>
          </div>
        </DkDialog>
      )}

      <DkTabs
        defaultValue={activeTab}
        value={activeTab}
        onValueChange={(next) => handleTabChange(next as NodeSettingsTab)}
        className="space-y-4"
      >
        <DkTabList className="w-full sm:w-auto flex flex-wrap">
          {NODE_SETTINGS_TABS.map((tab) => (
            <DkTab key={tab.id} value={tab.id} className="flex-1 sm:flex-none">
              {tab.label}
            </DkTab>
          ))}
        </DkTabList>
        {NODE_SETTINGS_TABS.map((tab) => (
          <DkTabPanel key={tab.id} value={tab.id} className="pt-2">
            <QueryErrorBoundary label={`${tab.label.toLowerCase()} settings`}>
              {tab.id === 'paths' && <SettingsPathsSection nodeId={server.id} />}
              {tab.id === 'organize' && <SettingsOrganizeSection nodeId={server.id} />}
              {tab.id === 'downloaders' && (
                <div className="space-y-4">
                  <SectionHeader
                    title="Instances"
                    description="SABnzbd on this node. Import also copies Prowlarr, Radarr, and Sonarr from another node."
                    action={<ImportNodeInstancesButton dest={server} />}
                  />
                  <NodeDownloaderCard server={server} />
                </div>
              )}
              {tab.id === 'sharing' && <SettingsNodeSharingSection server={server} />}
              {tab.id === 'epic' && <SettingsNodeEpicSection server={server} />}
              {tab.id === 'machine' && <NodeMachineSettings server={server} />}
            </QueryErrorBoundary>
          </DkTabPanel>
        ))}
      </DkTabs>
    </div>
  )
}

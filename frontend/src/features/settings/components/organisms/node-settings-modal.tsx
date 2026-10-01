import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { DkTabs, DkTabList, DkTab, DkTabPanel } from '@ui/molecules/tabs'
import { useDeleteGameServer } from '@/features/downloads/use-server-downloads'
import type { GameServer } from '@/features/downloads/types'
import { isLocalDesktopNode } from '../../local-desktop-node'
import { useSettingsNode } from '../../context/settings-node-context'
import {
  NODE_SETTINGS_TABS,
  type NodeSettingsTab,
} from '../../node-settings'
import { SettingsPathsSection } from './settings-paths-section'
import { SettingsOrganizeSection } from './settings-organize-section'
import { SettingsNodeSharingSection } from './settings-node-sharing-section'
import { NodeMachineSettings } from './node-machine-settings'
import { QueryErrorBoundary } from '@/components/query-error-boundary'

export interface NodeSettingsModalProps {
  server: GameServer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: NodeSettingsTab
  isLoading?: boolean
  onTabChange?: (tab: NodeSettingsTab) => void
  onDisconnectSuccess?: () => void
}

export function NodeSettingsModal({
  server,
  open,
  onOpenChange,
  initialTab = 'paths',
  isLoading = false,
  onTabChange,
  onDisconnectSuccess,
}: NodeSettingsModalProps) {
  const { setSelectedNodeId } = useSettingsNode()

  useEffect(() => {
    if (server) setSelectedNodeId(server.id)
  }, [server, setSelectedNodeId])

  const [activeTab, setActiveTab] = useState<NodeSettingsTab>(initialTab)

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  const handleTabChange = (tab: NodeSettingsTab) => {
    setActiveTab(tab)
    onTabChange?.(tab)
  }

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
      onOpenChange(false)
      onDisconnectSuccess?.()
    } catch (err: unknown) {
      toast({
        title: 'Error disconnecting node',
        description: (err as { message?: string })?.message || 'Failed to disconnect node',
        variant: 'error',
      })
    }
  }

  if (!open) return null

  if (isLoading && !server) {
    return (
      <DkDialog
        open={open}
        onOpenChange={onOpenChange}
        className="max-w-md p-8"
      >
        <div className="flex items-center justify-center py-10 text-white/50 gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Loading node...</span>
        </div>
      </DkDialog>
    )
  }

  if (!server) {
    return (
      <DkDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Node not found"
        description="This Otix node is not connected to your account."
        className="max-w-md"
      >
        <div className="pt-4 flex justify-end">
          <DkButton size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to nodes
          </DkButton>
        </div>
      </DkDialog>
    )
  }

  const local = isLocalDesktopNode(server)
  const description = local
    ? 'Folders, organize, and app behavior on this computer.'
    : `Folders, organize, and machine settings on ${server.name}.`

  return (
    <>
      <DkDialog
        open={open}
        onOpenChange={onOpenChange}
        title={server.name}
        description={description}
        className="max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
      >
        <DkTabs
          defaultValue={activeTab}
          value={activeTab}
          onValueChange={(next) => handleTabChange(next as NodeSettingsTab)}
          className="flex flex-col flex-1 min-h-0 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
            <DkTabList className="w-full sm:w-auto flex flex-wrap">
              {NODE_SETTINGS_TABS.map((tab) => (
                <DkTab key={tab.id} value={tab.id} className="flex-1 sm:flex-none">
                  {tab.label}
                </DkTab>
              ))}
            </DkTabList>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              {!local && (
                <DkButton
                  size="sm"
                  variant="ghost"
                  className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer text-xs"
                  onClick={() => setConfirmDisconnect(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Disconnect Node
                </DkButton>
              )}
              <DkButton
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-xs text-white/60 hover:text-white cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Nodes
              </DkButton>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[calc(90vh-190px)] pr-2">
            {NODE_SETTINGS_TABS.map((tab) => (
              <DkTabPanel key={tab.id} value={tab.id} className="pt-2">
                <QueryErrorBoundary label={`${tab.label.toLowerCase()} settings`}>
                  {tab.id === 'paths' && <SettingsPathsSection nodeId={server.id} />}
                  {tab.id === 'organize' && <SettingsOrganizeSection nodeId={server.id} />}
                  {tab.id === 'sharing' && <SettingsNodeSharingSection server={server} />}
                  {tab.id === 'machine' && <NodeMachineSettings server={server} />}
                </QueryErrorBoundary>
              </DkTabPanel>
            ))}
          </div>
        </DkTabs>
      </DkDialog>

      {confirmDisconnect && (
        <DkDialog
          open={confirmDisconnect}
          onOpenChange={(openConfirm) => {
            if (!openConfirm) setConfirmDisconnect(false)
          }}
          title="Disconnect Node"
          description={`Are you sure you want to disconnect ${server.name}?`}
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-white/70 leading-relaxed">
              This node will be removed from your account. Any active downloads
              will be stopped and you will need to re-claim or add the node again to reconnect.
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
    </>
  )
}

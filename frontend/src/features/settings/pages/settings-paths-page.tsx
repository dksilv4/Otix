import { useState } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useDeleteGameServer } from '@/features/downloads/use-server-downloads'
import { useSettingsNode } from '../context/settings-node-context'
import { SettingsPathsSection } from '../components/organisms/settings-paths-section'
import { GLOBAL_PROFILE_NODE_ID } from '../utils/node-switcher'
import { FolderOpen, Server, Trash2, ExternalLink, AlertTriangle, HardDrive } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'

export interface SettingsPathsPageProps {
  onNavigateToOrganize?: () => void
  onNavigateToInfrastructure?: () => void
}

export const SettingsPathsPage = ({
  onNavigateToOrganize,
  onNavigateToInfrastructure,
}: SettingsPathsPageProps = {}) => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { servers, selectedNode, selectedNodeId, setSelectedNodeId } = useSettingsNode()
  const deleteServerMutation = useDeleteGameServer()
  const [nodeToDelete, setNodeToDelete] = useState<{ id: number; name: string } | null>(null)

  const activeNodeId =
    selectedNodeId !== null && selectedNodeId !== undefined
      ? selectedNodeId
      : (selectedNode?.id ?? GLOBAL_PROFILE_NODE_ID)

  const handleDeleteConfirm = async () => {
    if (!nodeToDelete) return
    try {
      await deleteServerMutation.mutateAsync(nodeToDelete.id)
      toast({
        title: 'Node Disconnected',
        description: `Successfully removed ${nodeToDelete.name} from your account.`,
        variant: 'default',
      })
      setNodeToDelete(null)
      setSelectedNodeId(null)
    } catch (err: any) {
      toast({
        title: 'Delete Failed',
        description: err?.message || 'Could not disconnect node.',
        variant: 'error',
      })
    }
  }

  const handleGoToOrganize = () => {
    if (onNavigateToOrganize) {
      onNavigateToOrganize()
    } else {
      void navigate({ to: '/settings/nodes', hash: 'organize' })
    }
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 shadow-xs">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Drive Locations</h1>
              {selectedNode && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-muted-foreground">
                  {selectedNode.name}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Manage monitored folders and drive storage locations across your devices.
            </p>
          </div>
        </div>

        {/* Node Actions */}
        {selectedNode && (
          <div className="flex items-center gap-2 self-start sm:self-center">
            {onNavigateToInfrastructure ? (
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={onNavigateToInfrastructure}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-xs h-8"
              >
                <Server className="h-3.5 w-3.5 text-primary" />
                <span>Manage Nodes</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
              </DkButton>
            ) : (
              <Link
                to="/settings/nodes"
                hash="infrastructure"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-xs"
              >
                <Server className="h-3.5 w-3.5 text-primary" />
                <span>Manage Nodes</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground/60" />
              </Link>
            )}

            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setNodeToDelete({ id: selectedNode.id, name: selectedNode.name })}
              className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 cursor-pointer gap-1.5"
              title="Disconnect this node from account"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Disconnect</span>
            </DkButton>
          </div>
        )}
      </div>

      {/* Device Switcher (This PC, Remote Machines) */}
      {servers.length > 0 && (
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] w-fit">
          <button
            type="button"
            onClick={() => setSelectedNodeId(0)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              activeNodeId === 0 || activeNodeId === GLOBAL_PROFILE_NODE_ID
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
            )}
          >
            <HardDrive className="h-3.5 w-3.5" />
            <span>This PC</span>
          </button>
          {servers.map((server) => (
            <button
              key={server.id}
              type="button"
              onClick={() => setSelectedNodeId(server.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                activeNodeId === server.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
              )}
            >
              <Server className="h-3.5 w-3.5" />
              <span>{server.name}</span>
              <span className={cn('h-1.5 w-1.5 rounded-full', (server.isOnline || (server as any).status === 'online') ? 'bg-primary' : 'bg-muted-foreground/40')} />
            </button>
          ))}
        </div>
      )}

      {/* Paths Section */}
      <SettingsPathsSection
        nodeId={activeNodeId}
        onNavigateToOrganize={handleGoToOrganize}
      />

      {/* Disconnect Confirmation Dialog */}
      {nodeToDelete && (
        <DkDialog
          open={Boolean(nodeToDelete)}
          onOpenChange={(open) => !open && setNodeToDelete(null)}
          title="Disconnect Node"
          description={`Are you sure you want to disconnect ${nodeToDelete.name}?`}
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-xl bg-destructive/10 text-xs text-foreground/90 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
              <span>
                Disconnecting <strong>{nodeToDelete.name}</strong> unclaims the node daemon, clears its cached files, and removes it from your account.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setNodeToDelete(null)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteConfirm}
                loading={deleteServerMutation.isPending}
                disabled={deleteServerMutation.isPending}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Disconnect</span>
              </DkButton>
            </div>
          </div>
        </DkDialog>
      )}
    </div>
  )
}

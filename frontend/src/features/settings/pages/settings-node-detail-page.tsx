import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from '@tanstack/react-router'
import {
  Server,
  FolderOpen,
  Sparkles,
  Gamepad2,
  Trash2,
  ArrowLeft,
  HardDrive,
  Globe,
  Radio,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { useAuth } from '@/lib/providers/auth'
import { useDeleteGameServer } from '@/features/downloads/use-server-downloads'
import { useSettingsNode } from '../context/settings-node-context'
import { parseNodeIdParam } from '../node-settings'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { ViewScannedGamesModal } from '../components/organisms/view-scanned-games-modal'
import { formatBytes } from '../utils/scanned-summary'
import { cn } from '@/lib/utils'

export const SettingsNodeDetailPage = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { isAuthenticated } = useAuth()
  const params = useParams({ strict: false }) as { nodeId?: string }
  const nodeId = parseNodeIdParam(params.nodeId)
  const { servers, setSelectedNodeId } = useSettingsNode()
  const deleteServerMutation = useDeleteGameServer()

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [viewGamesModalOpen, setViewGamesModalOpen] = useState(false)

  const node = servers.find((s) => s.id === nodeId)

  useEffect(() => {
    if (nodeId != null) {
      setSelectedNodeId(nodeId)
    }
  }, [nodeId, setSelectedNodeId])

  if (!isAuthenticated) {
    return (
      <SettingsLockedState
        title="Sign in required"
        description="Sign in to inspect and configure individual node details."
        icon={ShieldAlert}
        action={<span />}
      />
    )
  }

  if (!node) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link
            to="/settings/nodes"
            className="p-1.5 rounded-xl hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Node Not Found</h1>
        </div>
        <div className="p-8 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center space-y-3">
          <Server className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">The requested node is no longer connected or has been removed.</p>
          <Link
            to="/settings/nodes"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground shadow-xs"
          >
            Back to Nodes
          </Link>
        </div>
      </div>
    )
  }

  const handleDelete = async () => {
    try {
      await deleteServerMutation.mutateAsync(node.id)
      toast({
        title: 'Node Disconnected',
        description: `Successfully removed ${node.name} from your account.`,
        variant: 'default',
      })
      setSelectedNodeId(null)
      void navigate({ to: '/settings/nodes' })
    } catch (err: any) {
      toast({
        title: 'Delete Failed',
        description: err?.message || 'Could not disconnect node.',
        variant: 'error',
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <Link
            to="/settings/nodes"
            className="p-2 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground transition-all shrink-0"
            title="Back to Nodes"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-foreground">{node.name}</h1>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1.5',
                  node.isOnline
                    ? 'bg-status-online/15 text-status-online'
                    : 'bg-status-offline/15 text-status-offline',
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                <span>{node.isOnline ? 'Online' : 'Offline'}</span>
              </span>
              {node.isLocalDesktop && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                  Companion Node
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {node.primaryUrl || node.localUrl || 'Local endpoint'}
            </p>
          </div>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDeleteModalOpen(true)}
            className="text-xs text-destructive hover:bg-destructive/10 cursor-pointer gap-1.5 h-8 px-2.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Disconnect Node</span>
          </DkButton>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Radio className="h-4 w-4 text-primary" />
            <span>Connectivity</span>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-foreground font-medium truncate" title={node.localUrl || ''}>
              LAN: {node.localUrl || '—'}
            </div>
            {node.remoteUrl && (
              <div className="text-xs text-muted-foreground truncate" title={node.remoteUrl}>
                WAN: {node.remoteUrl}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <HardDrive className="h-4 w-4 text-primary" />
            <span>Storage & Capacity</span>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-foreground font-medium">
              Free: {formatBytes(node.storageFreeBytes)}
            </div>
            <div className="text-xs text-muted-foreground">
              Total: {formatBytes(node.storageTotalBytes)}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Gamepad2 className="h-4 w-4 text-primary" />
            <span>Library Summary</span>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-foreground font-medium">
              {node.totalFiles ?? 0} {node.totalFiles === 1 ? 'game file' : 'game files'} indexed
            </div>
            <button
              type="button"
              onClick={() => setViewGamesModalOpen(true)}
              className="text-xs text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <span>View scanned titles</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Shortcuts for Node */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Link
          to="/settings/paths"
          onClick={() => setSelectedNodeId(node.id)}
          className="flex items-center justify-between p-4 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-105 transition-transform shadow-xs">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                Configure Paths
              </h3>
              <p className="text-xs text-muted-foreground">
                Add and scan game libraries and ISO storage folders on this node.
              </p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
        </Link>

        <Link
          to="/settings/organize"
          onClick={() => setSelectedNodeId(node.id)}
          className="flex items-center justify-between p-4 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-105 transition-transform shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                Organize Rules
              </h3>
              <p className="text-xs text-muted-foreground">
                Set directory structuring and automated repack renaming presets.
              </p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
        </Link>
      </div>

      {/* View Scanned Games Modal */}
      {viewGamesModalOpen && (
        <ViewScannedGamesModal
          open={viewGamesModalOpen}
          onOpenChange={setViewGamesModalOpen}
          nodeId={node.id}
          nodeName={node.name}
        />
      )}

      {/* Disconnect Confirmation Dialog */}
      {deleteModalOpen && (
        <DkDialog
          open={deleteModalOpen}
          onOpenChange={setDeleteModalOpen}
          title="Disconnect Node"
          description={`Are you sure you want to disconnect ${node.name}?`}
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-xl bg-destructive/10 text-xs text-foreground/90 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
              <span>
                Disconnecting <strong>{node.name}</strong> will unclaim the daemon, remove it from your account, and stop any active downloads.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
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

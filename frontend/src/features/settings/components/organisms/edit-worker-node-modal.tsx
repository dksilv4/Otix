import { useState, useEffect } from 'react'
import {
  Trash2,
  RefreshCw,
  SlidersHorizontal,
  Loader2,
  Server as ServerIcon,
  Home as HomeIcon,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSelect } from '@ui/atoms/select'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import type { GameServer } from '@/features/downloads/types'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import {
  useUpdateGameServer,
  useDeleteGameServer,
  useProbeGameServer,
  type ServerProbeResult,
} from '@/features/downloads/use-server-downloads'
import {
  useAssignNodeHome,
  useUpdateServerMachine,
} from '../../hooks/use-server-machines'
import { isLocalDesktopNode } from '../../local-desktop-node'

export interface EditWorkerNodeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: GameServer | null
  node?: GameServer | null
  homes?: UserHome[]
  serverMachines?: UserServerMachine[]
  onSuccess?: () => void
  onOpenFullSettings?: (server: GameServer) => void
  onDisconnectSuccess?: () => void
}

export const EditWorkerNodeModal = ({
  open,
  onOpenChange,
  server,
  node,
  homes = [],
  serverMachines = [],
  onSuccess,
  onOpenFullSettings,
  onDisconnectSuccess,
}: EditWorkerNodeModalProps) => {
  const activeServer = server ?? node ?? null
  const { toast } = useToast()
  const updateServerMutation = useUpdateGameServer()
  const deleteServerMutation = useDeleteGameServer()
  const probeServerMutation = useProbeGameServer()
  const assignHomeMutation = useAssignNodeHome()
  const updateMachineMutation = useUpdateServerMachine()

  const [name, setName] = useState('')
  const [selectedHomeId, setSelectedHomeId] = useState<string>('none')
  const [selectedMachineId, setSelectedMachineId] = useState<string>('none')
  const [localUrl, setLocalUrl] = useState('')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [isProbing, setIsProbing] = useState(false)
  const [probeResult, setProbeResult] = useState<ServerProbeResult | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (activeServer) {
      setName(activeServer.name)
      setSelectedHomeId(activeServer.homeId != null ? String(activeServer.homeId) : 'none')
      const hostedMachine = serverMachines.find((m) => m.hostedNodeId === activeServer.id)
      setSelectedMachineId(hostedMachine ? String(hostedMachine.id) : 'none')
      setLocalUrl(activeServer.localUrl || '')
      setRemoteUrl(activeServer.remoteUrl || '')
      setProbeResult(null)
    }
  }, [activeServer, serverMachines, open])

  if (!activeServer) return null

  const isLocal = isLocalDesktopNode(activeServer)

  const handleProbe = async () => {
    setIsProbing(true)
    try {
      const res = await probeServerMutation.mutateAsync(activeServer.id)
      setProbeResult(res)
      toast({
        title: res.remote_accessible ? 'Node Reachable' : 'Probe Complete',
        description: res.remote_accessible
          ? `Connected in ${res.latency_ms ?? 0}ms.`
          : 'Node is offline or unreachable.',
        variant: res.remote_accessible ? 'default' : 'destructive',
      })
    } catch {
      toast({
        title: 'Probe Failed',
        description: 'Could not contact the node probe endpoint.',
        variant: 'destructive',
      })
    } finally {
      setIsProbing(false)
    }
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({
        title: 'Name Required',
        description: 'Please specify a name for this node.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      // 1. Update name and URLs on server
      await updateServerMutation.mutateAsync({
        id: activeServer.id,
        name: trimmedName,
        local_url: localUrl.trim() || undefined,
        remote_url: remoteUrl.trim() || undefined,
      })

      // 2. Update home assignment if changed
      const currentHomeId = activeServer.homeId != null ? String(activeServer.homeId) : 'none'
      if (selectedHomeId !== currentHomeId) {
        await assignHomeMutation.mutateAsync({
          nodeId: activeServer.id,
          homeId: selectedHomeId === 'none' ? null : Number(selectedHomeId),
        })
      }

      // 3. Update machine host link
      const currentlyHostedMachine = serverMachines.find((m) => m.hostedNodeId === activeServer.id)
      const newMachineId = selectedMachineId !== 'none' ? Number(selectedMachineId) : null
      if (currentlyHostedMachine && currentlyHostedMachine.id !== newMachineId) {
        await updateMachineMutation.mutateAsync({
          id: currentlyHostedMachine.id,
          hostedNodeId: null,
        })
      }
      if (newMachineId && (!currentlyHostedMachine || currentlyHostedMachine.id !== newMachineId)) {
        await updateMachineMutation.mutateAsync({
          id: newMachineId,
          hostedNodeId: activeServer.id,
        })
      }

      toast({
        title: 'Node Updated',
        description: `Saved changes to ${trimmedName}.`,
        variant: 'default',
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err: unknown) {
      toast({
        title: 'Save Failed',
        description: (err as { message?: string })?.message || 'Failed to update node.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await deleteServerMutation.mutateAsync(activeServer.id)
      toast({
        title: 'Node Disconnected',
        description: `Removed ${activeServer.name} from your homelab.`,
        variant: 'default',
      })
      setConfirmDisconnect(false)
      onOpenChange(false)
      onDisconnectSuccess?.()
    } catch (err: unknown) {
      toast({
        title: 'Error Disconnecting Node',
        description: (err as { message?: string })?.message || 'Failed to disconnect node.',
        variant: 'destructive',
      })
    }
  }

  const homeOptions = [
    { value: 'none', label: 'None (Unassigned)' },
    ...homes.map((h) => ({
      value: String(h.id),
      label: `${h.name}${h.isDefault ? ' (Default)' : ''}`,
    })),
  ]

  const machineOptions = [
    { value: 'none', label: 'None (Standalone / Unassigned)' },
    ...serverMachines.map((m) => ({
      value: String(m.id),
      label: `${m.name} (${m.host || 'No IP'})`,
    })),
  ]

  return (
    <>
      <DkDialog
        open={open}
        onOpenChange={onOpenChange}
        className="max-w-md"
        title={`Edit ${activeServer.name}`}
        description="Configure node name, assigned home environment, hosted machine, and connectivity."
      >
        <div className="space-y-4 pt-3">
          {/* Status & Probe Bar with Status Light */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full shrink-0',
                  activeServer.isOnline ? 'bg-primary animate-pulse' : 'bg-amber-400',
                )}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {activeServer.isOnline ? 'Node Online' : 'Node Offline'}
                  {isLocal && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                      Local Desktop
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {probeResult ? `${probeResult.latency_ms ?? 0}ms response` : activeServer.primaryUrl || 'No URL'}
                </p>
              </div>
            </div>

            <DkButton
              type="button"
              size="sm"
              variant="outline"
              onClick={handleProbe}
              disabled={isProbing}
              className="h-7 text-xs gap-1.5 shrink-0"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isProbing && 'animate-spin')} />
              <span>Probe</span>
            </DkButton>
          </div>

          {!activeServer.isOnline && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[11px] leading-relaxed">
              Node is currently offline. You can configure and save all node settings now — updates are queued and will automatically sync once this node connects.
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Node Display Name *
            </label>
            <DkInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Living Room PC, Unraid Worker"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <HomeIcon size={12} className="text-primary" />
                <span>Home Environment</span>
              </label>
              <DkSelect
                value={selectedHomeId}
                onValueChange={setSelectedHomeId}
                options={homeOptions}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <ServerIcon size={12} className="text-primary" />
                <span>Hosted on Machine</span>
              </label>
              <DkSelect
                value={selectedMachineId}
                onValueChange={setSelectedMachineId}
                options={machineOptions}
              />
            </div>
          </div>

          <div className="space-y-3 pt-1 border-t border-white/[0.04]">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Local Daemon URL
              </label>
              <DkInput
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="http://127.0.0.1:8090"
                className="font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Remote / WAN URL (Optional)
              </label>
              <DkInput
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="https://node.mydomain.com"
                className="font-mono text-xs"
              />
            </div>
          </div>

          {/* Quick link to full library/organizer settings */}
          {onOpenFullSettings && (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-foreground">Library Paths &amp; Organizer</p>
                <p className="text-[10px] text-muted-foreground">Manage game folders, auto-organize, and sharing rules.</p>
              </div>
              <DkButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onOpenFullSettings(activeServer)
                }}
                className="h-7 text-xs gap-1.5 shrink-0"
              >
                <SlidersHorizontal size={12} />
                <span>Configure</span>
              </DkButton>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2">
            {!isLocal ? (
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDisconnect(true)}
                disabled={isSaving}
                className="text-destructive hover:bg-destructive/10 text-xs gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Disconnect
              </DkButton>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              <DkButton
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </DkButton>
            </div>
          </div>
        </div>
      </DkDialog>

      {/* Disconnect Confirmation Dialog */}
      {confirmDisconnect && (
        <DkDialog
          open={confirmDisconnect}
          onOpenChange={setConfirmDisconnect}
          title="Disconnect Node"
          description={`Are you sure you want to disconnect "${activeServer.name}"?`}
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This node will be removed from your account. Any active download tasks or
              indexed folders will need to be re-paired if you want to use this daemon again.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDisconnect(false)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDisconnect}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Disconnect Node
              </DkButton>
            </div>
          </div>
        </DkDialog>
      )}
    </>
  )
}

export { EditWorkerNodeModal as EditNodeModal }

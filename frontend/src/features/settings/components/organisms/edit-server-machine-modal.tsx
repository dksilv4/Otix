import { useState, useEffect } from 'react'
import {
  HardDrive,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSelect } from '@ui/atoms/select'
import { DkSwitch } from '@ui/atoms/switch'
import { DkCheckbox } from '@ui/atoms/checkbox'
import { useToast } from '@ui/molecules/toast'
import { formatBytes, cn } from '@/lib/utils'
import type { GameServer } from '@/features/downloads/types'
import type {
  ServerDriveConfig,
  ServerMachineInput,
  UserHome,
  UserServerMachine,
} from '../../types/server-machines'
import {
  SERVER_OS_OPTIONS,
  DRIVE_TYPE_OPTIONS,
  calculateTotalCapacity,
  serverMachineToInput,
  createDefaultServerInput,
  createDefaultDriveConfig,
  getOSLabel,
} from '../../utils/server-machines'
import {
  useUpdateServerMachine,
  useDetectServerDrives,
  useDeleteServerMachine,
  useAssignNodeHome,
} from '../../hooks/use-server-machines'

export interface EditServerMachineModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server: UserServerMachine | null
  homes: UserHome[]
  nodes: GameServer[]
  onSuccess?: () => void
  onDelete?: (server: UserServerMachine) => void
}

export const EditServerMachineModal = ({
  open,
  onOpenChange,
  server,
  homes,
  nodes,
  onSuccess,
  onDelete,
}: EditServerMachineModalProps) => {
  const { toast } = useToast()
  const updateMutation = useUpdateServerMachine()
  const detectMutation = useDetectServerDrives()
  const deleteMutation = useDeleteServerMachine()
  const assignHomeMutation = useAssignNodeHome()

  const [formData, setFormData] = useState<ServerMachineInput>(() =>
    server ? serverMachineToInput(server) : createDefaultServerInput(null),
  )
  const [isDetecting, setIsDetecting] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'storage' | 'smb'>('general')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (server) {
      setFormData(serverMachineToInput(server))
    }
  }, [server, open])

  if (!server) return null

  const handleFieldChange = <K extends keyof ServerMachineInput>(key: K, value: ServerMachineInput[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleAddDrive = () => {
    const nextIndex = (formData.drivesConfig?.length || 0) + 1
    const newDrive = createDefaultDriveConfig(nextIndex)
    setFormData((prev) => ({
      ...prev,
      drivesConfig: [...prev.drivesConfig, newDrive],
    }))
  }

  const handleUpdateDrive = (index: number, patch: Partial<ServerDriveConfig>) => {
    setFormData((prev) => {
      const updated = [...prev.drivesConfig]
      const existing = updated[index]
      if (!existing) return prev
      const merged = { ...existing, ...patch }
      if (patch.totalBytes != null || patch.freeBytes != null) {
        merged.usedBytes = Math.max(0, merged.totalBytes - merged.freeBytes)
      }
      updated[index] = merged
      return { ...prev, drivesConfig: updated }
    })
  }

  const handleRemoveDrive = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      drivesConfig: prev.drivesConfig.filter((_, i) => i !== index),
    }))
  }

  const handleDetectDrives = async () => {
    const targetNodeId = formData.hostedNodeId || nodes[0]?.id
    if (!targetNodeId) {
      toast({
        title: 'No Node Available',
        description: 'Select a hosted node or connect an Otix node first to auto-detect hard drives.',
        variant: 'error',
      })
      return
    }

    setIsDetecting(true)
    try {
      const result = await detectMutation.mutateAsync({
        serverId: server.id,
        nodeId: targetNodeId,
      })

      if (result.detectedDrives && result.detectedDrives.length > 0) {
        setFormData((prev) => ({
          ...prev,
          drivesConfig: result.detectedDrives,
          os: result.detectedOsCode && result.detectedOsCode !== 'other' ? result.detectedOsCode : prev.os,
          osVersion: result.detectedOs?.name || prev.osVersion,
        }))
        toast({
          title: 'Hard Drives Detected',
          description: `Discovered ${result.detectedDrives.length} disk volume(s) from node.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Detection Completed',
          description: 'No disk volumes reported by the node hardware probe.',
          variant: 'info',
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Detection Failed',
        description: (err as { message?: string })?.message || 'Could not probe node hardware.',
        variant: 'error',
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleToggleSmbNode = (nodeId: number) => {
    setFormData((prev) => {
      const current = prev.smbNodeIds || []
      const next = current.includes(nodeId)
        ? current.filter((id) => id !== nodeId)
        : [...current, nodeId]
      return { ...prev, smbNodeIds: next }
    })
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please specify a name for this server machine.',
        variant: 'error',
      })
      return
    }

    try {
      await updateMutation.mutateAsync({ id: server.id, ...formData })
      if (formData.hostedNodeId && formData.homeId) {
        try {
          await assignHomeMutation.mutateAsync({
            nodeId: formData.hostedNodeId,
            homeId: formData.homeId,
          })
        } catch {
          // backend update will also have persisted this
        }
      }
      toast({
        title: 'Server Updated',
        description: `Saved changes to ${formData.name}.`,
        variant: 'success',
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err: unknown) {
      toast({
        title: 'Save Failed',
        description: (err as { message?: string })?.message || 'Could not save server machine.',
        variant: 'error',
      })
    }
  }

  const handleDelete = async () => {
    try {
      if (onDelete) {
        onDelete(server)
      } else {
        await deleteMutation.mutateAsync(server.id)
        toast({
          title: 'Server Machine Removed',
          description: `Removed ${server.name} from your homelab.`,
          variant: 'success',
        })
      }
      setConfirmDelete(false)
      onOpenChange(false)
      onSuccess?.()
    } catch (err: unknown) {
      toast({
        title: 'Delete Failed',
        description: (err as { message?: string })?.message || 'Could not remove server machine.',
        variant: 'error',
      })
    }
  }

  const { totalBytes, freeBytes, usedBytes } = calculateTotalCapacity(formData.drivesConfig)
  const usedPercent = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0
  const isSaving = updateMutation.isPending || deleteMutation.isPending

  return (
    <>
      <DkDialog
        open={open}
        onOpenChange={onOpenChange}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        title={`Configure ${server.name}`}
        description="Configure homelab computer, OS, node hosting, hard drives, and SMB access."
      >
        <div className="space-y-4 pt-3">
          {/* Status Light Bar */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full shrink-0',
                  server.isOnline ? 'bg-status-online animate-pulse' : 'bg-status-offline',
                )}
              />
              <p className="text-xs font-semibold text-foreground truncate">
                {server.isOnline ? 'Machine Online' : 'Machine Offline'}
                <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                  {(server as any).ipAddress || server.host || 'No IP Configured'}
                </span>
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {getOSLabel(server.os)}
            </span>
          </div>

          {/* Navigation tabs */}
          <div className="flex items-center gap-1 border-b border-white/[0.06] pb-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={cn(
                'px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer',
                activeTab === 'general'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
              )}
            >
              General &amp; OS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('storage')}
              className={cn(
                'px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5',
                activeTab === 'storage'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
              )}
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>Hard Drives ({formData.drivesConfig?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('smb')}
              className={cn(
                'px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer',
                activeTab === 'smb'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
              )}
            >
              SMB &amp; Nodes
            </button>
          </div>

          {/* TAB 1: General & OS */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Server Name *
                  </label>
                  <DkInput
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder="e.g. Tower NAS, Homelab Box, TrueNAS Vault"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Home Environment
                  </label>
                  <DkSelect
                    value={formData.homeId ? String(formData.homeId) : 'none'}
                    onValueChange={(val) => handleFieldChange('homeId', val === 'none' ? null : Number(val))}
                    options={[
                      { value: 'none', label: 'None (Unassigned)' },
                      ...homes.map((h) => ({
                        value: String(h.id),
                        label: `${h.name}${h.isDefault ? ' (Default)' : ''}`,
                      })),
                    ]}
                  />
                </div>
              </div>

              {/* Operating System Picker */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Operating System
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SERVER_OS_OPTIONS.map((opt) => {
                    const selected = formData.os.toLowerCase() === opt.value.toLowerCase()
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleFieldChange('os', opt.value)}
                        className={cn(
                          'p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between',
                          selected
                            ? 'bg-primary/10 border-primary/40 shadow-sm'
                            : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08]',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn('text-xs font-semibold', selected ? 'text-foreground' : 'text-foreground/90')}>
                            {opt.label}
                          </span>
                          {opt.isPopular && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-medium">
                              Popular
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-1 mt-1">
                          {opt.description}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Host / IP Address
                  </label>
                  <DkInput
                    value={formData.host}
                    onChange={(e) => handleFieldChange('host', e.target.value)}
                    placeholder="e.g. 192.168.1.150 or nas.local"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    OS Version / Kernel (Optional)
                  </label>
                  <DkInput
                    value={formData.osVersion}
                    onChange={(e) => handleFieldChange('osVersion', e.target.value)}
                    placeholder="e.g. 6.12.8, 24.04 LTS, 8.1-1"
                  />
                </div>
              </div>

              {/* Hosted Otix Node link */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Hosted Otix Node Daemon
                </label>
                <DkSelect
                  value={formData.hostedNodeId ? String(formData.hostedNodeId) : 'none'}
                  onValueChange={(val) => handleFieldChange('hostedNodeId', val === 'none' ? null : Number(val))}
                  options={[
                    { value: 'none', label: 'None (No Otix node on this machine)' },
                    ...nodes.map((n) => ({
                      value: String(n.id),
                      label: `${n.name} (${n.primaryUrl || 'offline'})`,
                    })),
                  ]}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Linking an Otix node lets this server auto-detect disk drives, monitor temperature, and organize games.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: Hard Drives & Storage */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div>
                  <p className="text-xs font-semibold text-foreground">Storage Capacity</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formData.drivesConfig?.length || 0} disk volume(s) configured · {formatBytes(freeBytes)} free of {formatBytes(totalBytes)} ({usedPercent}% used)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <DkButton
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleDetectDrives}
                    disabled={isDetecting}
                    className="gap-1.5 text-xs"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', isDetecting && 'animate-spin')} />
                    Auto-Detect from Node
                  </DkButton>
                  <DkButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleAddDrive}
                    className="gap-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Drive
                  </DkButton>
                </div>
              </div>

              {/* Drives List */}
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {(formData.drivesConfig || []).length === 0 ? (
                  <div className="rounded-xl p-6 text-center bg-white/[0.02] border border-white/[0.04]">
                    <HardDrive className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs font-medium text-foreground">No hard drives configured</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Click &ldquo;Auto-Detect from Node&rdquo; to scan volumes via Otix agent, or add them manually.
                    </p>
                  </div>
                ) : (
                  formData.drivesConfig.map((drive, idx) => (
                    <div
                      key={drive.id || idx}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <DkInput
                            value={drive.drive}
                            onChange={(e) => handleUpdateDrive(idx, { drive: e.target.value })}
                            placeholder="/mnt/disk1 or C:"
                            className="text-xs font-mono max-w-[140px]"
                          />
                          <DkInput
                            value={drive.label || ''}
                            onChange={(e) => handleUpdateDrive(idx, { label: e.target.value })}
                            placeholder="Label (e.g. Games Pool)"
                            className="text-xs flex-1"
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={drive.type || 'hdd'}
                            onChange={(e) => handleUpdateDrive(idx, { type: e.target.value as ServerDriveConfig['type'] })}
                            className="rounded-lg bg-white/[0.05] px-2 py-1.5 text-xs text-foreground outline-none border border-white/[0.08]"
                          >
                            {DRIVE_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value} className="bg-popover text-popover-foreground">
                                {opt.label}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => handleRemoveDrive(idx)}
                            aria-label="Remove drive"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Total Size (GB)</label>
                          <DkInput
                            type="number"
                            value={Math.round((drive.totalBytes || 0) / (1024 * 1024 * 1024))}
                            onChange={(e) =>
                              handleUpdateDrive(idx, {
                                totalBytes: Number(e.target.value) * 1024 * 1024 * 1024,
                              })
                            }
                            className="text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Free Space (GB)</label>
                          <DkInput
                            type="number"
                            value={Math.round((drive.freeBytes || 0) / (1024 * 1024 * 1024))}
                            onChange={(e) =>
                              handleUpdateDrive(idx, {
                                freeBytes: Number(e.target.value) * 1024 * 1024 * 1024,
                              })
                            }
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SMB & Nodes */}
          {activeTab === 'smb' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Samba (SMB) Server</p>
                    <p className="text-[11px] text-muted-foreground">
                      Expose folders on this server to other Otix nodes over your local network.
                    </p>
                  </div>
                  <DkSwitch
                    checked={formData.smbEnabled}
                    onCheckedChange={(checked) => handleFieldChange('smbEnabled', checked)}
                  />
                </div>

                {formData.smbEnabled && (
                  <div className="space-y-3 pt-2 border-t border-white/[0.04]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Share Name
                        </label>
                        <DkInput
                          value={formData.smbShareName}
                          onChange={(e) => handleFieldChange('smbShareName', e.target.value)}
                          placeholder="e.g. games or roms"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          SMB Host / IP Override (Optional)
                        </label>
                        <DkInput
                          value={formData.smbHost}
                          onChange={(e) => handleFieldChange('smbHost', e.target.value)}
                          placeholder={formData.host || 'Default server IP'}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          SMB Username
                        </label>
                        <DkInput
                          value={formData.smbUsername}
                          onChange={(e) => handleFieldChange('smbUsername', e.target.value)}
                          placeholder="guest or otix"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          SMB Password
                        </label>
                        <DkInput
                          type="password"
                          value={formData.smbPassword}
                          onChange={(e) => handleFieldChange('smbPassword', e.target.value)}
                          placeholder="••••••••"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Workgroup
                        </label>
                        <DkInput
                          value={formData.smbWorkgroup}
                          onChange={(e) => handleFieldChange('smbWorkgroup', e.target.value)}
                          placeholder="WORKGROUP"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Local Mount Path
                      </label>
                      <DkInput
                        value={formData.smbMountPath}
                        onChange={(e) => handleFieldChange('smbMountPath', e.target.value)}
                        placeholder="/mnt/user/games or /storage/emulation"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Nodes that connect to this server via SMB */}
              {formData.smbEnabled && (
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-2">
                  <p className="text-xs font-semibold text-foreground">
                    Grant Access to Otix Worker Nodes
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Selected nodes will display an active SMB network storage connection to this machine on your topology map.
                  </p>

                  <div className="space-y-1.5 pt-1">
                    {nodes.map((node) => {
                      const checked = (formData.smbNodeIds || []).includes(node.id)
                      return (
                        <label
                          key={node.id}
                          className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer text-xs"
                        >
                          <DkCheckbox
                            checked={checked}
                            onCheckedChange={() => handleToggleSmbNode(node.id)}
                          />
                          <span className="font-medium text-foreground">{node.name}</span>
                          <span className="text-[10px] text-muted-foreground">({node.primaryUrl || 'offline'})</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3">
            <DkButton
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={isSaving}
              className="text-destructive hover:bg-destructive/10 text-xs gap-1.5 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Machine
            </DkButton>

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

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <DkDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete Server Machine"
          description={`Are you sure you want to remove "${server.name}"?`}
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will remove the server machine and its storage mappings from your homelab topology.
              Any linked worker nodes will remain registered.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete Machine
              </DkButton>
            </div>
          </div>
        </DkDialog>
      )}
    </>
  )
}

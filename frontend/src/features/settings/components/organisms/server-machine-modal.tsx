import { useState, useEffect } from 'react'
import {
  Server,
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
  createDefaultServerInput,
  serverMachineToInput,
} from '../../utils/server-machines'
import {
  useCreateServerMachine,
  useDetectServerDrives,
  useUpdateServerMachine,
} from '../../hooks/use-server-machines'

interface ServerMachineModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: UserServerMachine | null
  homes: UserHome[]
  nodes: GameServer[]
  defaultHomeId?: number | null
  onSuccess?: () => void
}

export const ServerMachineModal = ({
  open,
  onOpenChange,
  server,
  homes,
  nodes,
  defaultHomeId,
  onSuccess,
}: ServerMachineModalProps) => {
  const { toast } = useToast()
  const createMutation = useCreateServerMachine()
  const updateMutation = useUpdateServerMachine()
  const detectMutation = useDetectServerDrives()

  const [formData, setFormData] = useState<ServerMachineInput>(() =>
    server ? serverMachineToInput(server) : createDefaultServerInput(defaultHomeId),
  )

  const [isDetecting, setIsDetecting] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'storage' | 'smb'>('general')

  useEffect(() => {
    if (server) {
      setFormData(serverMachineToInput(server))
    } else {
      setFormData(createDefaultServerInput(defaultHomeId))
    }
  }, [server, defaultHomeId, open])

  const handleFieldChange = <K extends keyof ServerMachineInput>(key: K, value: ServerMachineInput[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleAddDrive = () => {
    const nextId = `drive-${(formData.drivesConfig?.length || 0) + 1}`
    const newDrive: ServerDriveConfig = {
      id: nextId,
      drive: `/mnt/disk${(formData.drivesConfig?.length || 0) + 1}`,
      label: `Disk ${(formData.drivesConfig?.length || 0) + 1}`,
      fileSystem: 'xfs',
      totalBytes: 1024 * 1024 * 1024 * 1000,
      freeBytes: 1024 * 1024 * 1024 * 500,
      usedBytes: 1024 * 1024 * 1024 * 500,
      type: 'hdd',
      mountPoint: '',
    }
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
        serverId: server?.id,
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
      if (server) {
        await updateMutation.mutateAsync({ id: server.id, ...formData })
        toast({
          title: 'Server Updated',
          description: `Saved changes to ${formData.name}.`,
          variant: 'success',
        })
      } else {
        await createMutation.mutateAsync(formData)
        toast({
          title: 'Server Machine Added',
          description: `Added ${formData.name} to your homelab.`,
          variant: 'success',
        })
      }
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

  const { totalBytes, freeBytes, usedBytes } = calculateTotalCapacity(formData.drivesConfig)
  const usedPercent = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0
  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight text-white">
              {server ? `Edit ${server.name}` : 'Add Server Machine'}
            </h2>
            <p className="text-xs text-white/50">
              Configure homelab computer, OS, node hosting, hard drives, and SMB access.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-6 pt-3">
        {/* Navigation Tabs */}
        <div className="flex gap-2 rounded-xl bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
              activeTab === 'general'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/60 hover:text-white',
            )}
          >
            General &amp; OS
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
              activeTab === 'storage'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/60 hover:text-white',
            )}
          >
            Hard Drives ({formData.drivesConfig.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('smb')}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
              activeTab === 'smb'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/60 hover:text-white',
            )}
          >
            SMB &amp; Nodes
          </button>
        </div>

        {/* Tab 1: General & OS */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Server Name *
              </label>
              <DkInput
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder="e.g. Tower NAS, Homelab Box, TrueNAS Vault"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Home / Environment
                </label>
                <DkSelect
                  value={formData.homeId ? String(formData.homeId) : ''}
                  onChange={(val) => handleFieldChange('homeId', val ? Number(val) : null)}
                  options={[
                    { value: '', label: 'No assigned home' },
                    ...homes.map((h) => ({
                      value: String(h.id),
                      label: `${h.name}${h.isDefault ? ' (Default)' : ''}`,
                    })),
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Host / IP Address
                </label>
                <DkInput
                  value={formData.host}
                  onChange={(e) => handleFieldChange('host', e.target.value)}
                  placeholder="e.g. 192.168.1.150 or unraid.local"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Operating System (OS)
              </label>
              <p className="text-[11px] text-white/40 mb-2">
                Specify host operating system to enable OS-specific features and community tooling.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SERVER_OS_OPTIONS.map((opt) => {
                  const isSelected = formData.os === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleFieldChange('os', opt.value)}
                      className={cn(
                        'flex flex-col items-start p-2.5 rounded-xl text-left transition-all',
                        isSelected
                          ? 'bg-primary/15 text-white ring-1 ring-primary/40'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] text-white/70',
                      )}
                    >
                      <span className="text-xs font-semibold leading-tight">{opt.label}</span>
                      <span className="text-[10px] text-white/40 line-clamp-1 mt-0.5">
                        {opt.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                OS Version (Optional)
              </label>
              <DkInput
                value={formData.osVersion}
                onChange={(e) => handleFieldChange('osVersion', e.target.value)}
                placeholder="e.g. 6.12.8, TrueNAS SCALE 24.04, Ubuntu 24.04 LTS"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Node Running on This Server Machine
              </label>
              <p className="text-[11px] text-white/40 mb-2">
                Specify if an Otix Node daemon is directly installed on this server machine.
              </p>
              <DkSelect
                value={formData.hostedNodeId ? String(formData.hostedNodeId) : ''}
                onChange={(val) => handleFieldChange('hostedNodeId', val ? Number(val) : null)}
                options={[
                  { value: '', label: 'None (Standalone server / NAS)' },
                  ...nodes.map((n) => ({
                    value: String(n.id),
                    label: `${n.name} (${n.isOnline ? 'Online' : 'Offline'})`,
                  })),
                ]}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Hard Drives */}
        {activeTab === 'storage' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/[0.03]">
              <div>
                <p className="text-xs font-semibold text-white/80">Storage Capacity</p>
                <p className="text-sm font-bold tabular-nums text-white mt-0.5">
                  {formatBytes(usedBytes)} used of {formatBytes(totalBytes)} ({usedPercent}%)
                </p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {formatBytes(freeBytes)} free across {formData.drivesConfig.length} drive(s)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <DkButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDetectDrives}
                  disabled={isDetecting || (!formData.hostedNodeId && nodes.length === 0)}
                  className="gap-1.5"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isDetecting && 'animate-spin')} />
                  {isDetecting ? 'Detecting...' : 'Auto-Detect from Node'}
                </DkButton>
                <DkButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddDrive}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Drive
                </DkButton>
              </div>
            </div>

            {/* Drives List */}
            {formData.drivesConfig.length === 0 ? (
              <div className="rounded-2xl p-6 text-center bg-white/[0.02]">
                <HardDrive className="h-8 w-8 text-white/20 mx-auto mb-2" />
                <p className="text-sm font-medium text-white/70">No hard drives configured</p>
                <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
                  Click &ldquo;Auto-Detect from Node&rdquo; to probe disks directly or &ldquo;Add Drive&rdquo; to specify disks manually.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {formData.drivesConfig.map((drive, idx) => (
                  <div
                    key={drive.id || idx}
                    className="p-3.5 rounded-2xl bg-white/[0.03] space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold text-white/90">
                          {drive.label || drive.drive || `Drive #${idx + 1}`}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 uppercase">
                          {drive.type || 'HDD'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDrive(idx)}
                        className="text-white/40 hover:text-red-400 p-1 transition-colors"
                        title="Remove Drive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[10px] text-white/50 mb-1">
                          Drive Path / Letter
                        </label>
                        <DkInput
                          value={drive.drive}
                          onChange={(e) => handleUpdateDrive(idx, { drive: e.target.value })}
                          placeholder="/mnt/disk1 or C:"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/50 mb-1">
                          Label
                        </label>
                        <DkInput
                          value={drive.label || ''}
                          onChange={(e) => handleUpdateDrive(idx, { label: e.target.value })}
                          placeholder="e.g. Array Disk 1"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/50 mb-1">
                          Type
                        </label>
                        <DkSelect
                          value={drive.type || 'hdd'}
                          onChange={(val) => handleUpdateDrive(idx, { type: val })}
                          options={DRIVE_TYPE_OPTIONS}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[10px] text-white/50 mb-1">
                          File System
                        </label>
                        <DkInput
                          value={drive.fileSystem || ''}
                          onChange={(e) => handleUpdateDrive(idx, { fileSystem: e.target.value })}
                          placeholder="xfs, zfs, btrfs, ext4, ntfs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/50 mb-1">
                          Total GB
                        </label>
                        <DkInput
                          type="number"
                          value={Math.round((drive.totalBytes || 0) / (1024 * 1024 * 1024))}
                          onChange={(e) =>
                            handleUpdateDrive(idx, {
                              totalBytes: Number(e.target.value) * 1024 * 1024 * 1024,
                            })
                          }
                          placeholder="1000"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/50 mb-1">
                          Free GB
                        </label>
                        <DkInput
                          type="number"
                          value={Math.round((drive.freeBytes || 0) / (1024 * 1024 * 1024))}
                          onChange={(e) =>
                            handleUpdateDrive(idx, {
                              freeBytes: Number(e.target.value) * 1024 * 1024 * 1024,
                            })
                          }
                          placeholder="500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: SMB & Node Communication */}
        {activeTab === 'smb' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03]">
              <div>
                <p className="text-xs font-semibold text-white/90">Allow SMB Communication</p>
                <p className="text-[11px] text-white/50 mt-0.5">
                  Allows worker nodes to mount and communicate with storage on this server machine via SMB.
                </p>
              </div>
              <DkSwitch
                checked={formData.smbEnabled}
                onCheckedChange={(checked) => handleFieldChange('smbEnabled', checked)}
              />
            </div>

            {formData.smbEnabled && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      SMB Share Name
                    </label>
                    <DkInput
                      value={formData.smbShareName}
                      onChange={(e) => handleFieldChange('smbShareName', e.target.value)}
                      placeholder="e.g. games or storage"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      SMB Port
                    </label>
                    <DkInput
                      type="number"
                      value={formData.smbPort}
                      onChange={(e) => handleFieldChange('smbPort', Number(e.target.value))}
                      placeholder="445"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      Username (Optional)
                    </label>
                    <DkInput
                      value={formData.smbUsername}
                      onChange={(e) => handleFieldChange('smbUsername', e.target.value)}
                      placeholder="e.g. nobody or otix"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      Password (Optional)
                    </label>
                    <DkInput
                      type="password"
                      value={formData.smbPassword}
                      onChange={(e) => handleFieldChange('smbPassword', e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">
                    Mount Path (Optional)
                  </label>
                  <DkInput
                    value={formData.smbMountPath}
                    onChange={(e) => handleFieldChange('smbMountPath', e.target.value)}
                    placeholder="e.g. \\192.168.1.150\games or /mnt/smb/games"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">
                    Nodes Allowed to Communicate with this Server through SMB
                  </label>
                  <p className="text-[11px] text-white/40 mb-2.5">
                    Select the Otix nodes that access or mount files from this server machine over SMB.
                  </p>
                  {nodes.length === 0 ? (
                    <p className="text-xs text-white/40 italic p-3 rounded-xl bg-white/[0.02]">
                      No Otix nodes claimed yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {nodes.map((node) => {
                        const isChecked = formData.smbNodeIds.includes(node.id)
                        return (
                          <div
                            key={node.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <DkCheckbox
                                checked={isChecked}
                                onCheckedChange={() => handleToggleSmbNode(node.id)}
                              />
                              <div>
                                <p className="text-xs font-medium text-white/90">{node.name}</p>
                                <p className="text-[10px] text-white/40">{node.primaryUrl || 'No URL'}</p>
                              </div>
                            </div>
                            <span
                              className={cn(
                                'text-[10px] px-2 py-0.5 rounded-full font-medium',
                                node.isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/10 text-white/40',
                              )}
                            >
                              {node.isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3">
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
            {server ? 'Save Changes' : 'Add Server Machine'}
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
};

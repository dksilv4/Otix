import { useState, useEffect } from 'react'
import { FolderTree, Server, KeyRound, Loader2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { DkSelect } from '@ui/atoms/select'
import { useToast } from '@ui/molecules/toast'
import type { UserServerMachine } from '../../types/server-machines'
import type { SambaShareConfig } from '../../types/node-map'
import { useUpdateServerMachine } from '../../hooks/use-server-machines'

export interface CreateSambaShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverMachines: UserServerMachine[]
  onSaveCustom?: (config: SambaShareConfig) => void
  initialServerId?: number | null
  preset?: Partial<SambaShareConfig> | null
}

export const CreateSambaShareModal = ({
  open,
  onOpenChange,
  serverMachines,
  onSaveCustom,
  initialServerId,
  preset,
}: CreateSambaShareModalProps) => {
  const { toast } = useToast()
  const updateServerMutation = useUpdateServerMachine()

  const [shareName, setShareName] = useState('games')
  const [selectedServerId, setSelectedServerId] = useState<string>('none')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(445)
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [workgroup, setWorkgroup] = useState('WORKGROUP')
  const [mountPath, setMountPath] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setShareName(preset?.shareName || 'games')
      const targetId = preset?.serverId != null
        ? String(preset.serverId)
        : initialServerId != null
          ? String(initialServerId)
          : (serverMachines[0] ? String(serverMachines[0].id) : 'none')
      setSelectedServerId(targetId)
      if (preset?.host) {
        setHost(preset.host)
      } else if (targetId !== 'none') {
        const found = serverMachines.find((m) => String(m.id) === targetId)
        setHost(found?.host || '')
      } else {
        setHost('')
      }
      setPort(preset?.port || 445)
      setIsAnonymous(true)
      setUsername('')
      setPassword('')
      setWorkgroup('WORKGROUP')
      setMountPath('')
    }
  }, [open, initialServerId, preset, serverMachines])

  const handleServerChange = (val: string) => {
    setSelectedServerId(val)
    if (val !== 'none') {
      const s = serverMachines.find((m) => String(m.id) === val)
      if (s?.host && !host) {
        setHost(s.host)
      }
    }
  }

  const handleSave = async () => {
    const cleanName = shareName.trim().replace(/^\/+/, '')
    if (!cleanName) {
      toast({
        title: 'Share Name Required',
        description: 'Please specify a name for this Samba share (e.g. "games" or "storage").',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      const targetServerId = selectedServerId !== 'none' ? Number(selectedServerId) : null
      const targetServer = targetServerId ? serverMachines.find((m) => m.id === targetServerId) : null

      const nextConfig: SambaShareConfig = {
        id: `samba-custom-${Date.now()}`,
        serverId: targetServerId,
        serverName: targetServer?.name || null,
        shareName: cleanName,
        host: host.trim() || targetServer?.host || '',
        port: Number(port) || 445,
        username: isAnonymous ? '' : username.trim(),
        password: isAnonymous ? '' : password.trim(),
        workgroup: workgroup.trim() || 'WORKGROUP',
        mountPath: mountPath.trim(),
        isOnline: targetServer?.isOnline ?? true,
        nodeIds: [],
      }

      if (targetServerId && targetServer) {
        const existingShares = Array.isArray(targetServer.smbShares) ? [...targetServer.smbShares] : []
        if (
          targetServer.smbShareName &&
          !existingShares.some(
            (s) => s.shareName?.toLowerCase() === targetServer.smbShareName?.toLowerCase(),
          )
        ) {
          existingShares.unshift({
            id: `samba-server-${targetServer.id}`,
            serverId: targetServer.id,
            serverName: targetServer.name,
            shareName: targetServer.smbShareName,
            host: targetServer.smbHost || targetServer.host || '',
            port: targetServer.smbPort || 445,
            username: targetServer.smbUsername || '',
            password: targetServer.smbPassword || '',
            workgroup: targetServer.smbWorkgroup || 'WORKGROUP',
            mountPath: targetServer.smbMountPath || '',
            isOnline: targetServer.isOnline,
            nodeIds: targetServer.smbNodeIds || [],
          })
        }
        const nextShares = [...existingShares, nextConfig]

        await updateServerMutation.mutateAsync({
          id: targetServerId,
          smbEnabled: true,
          smbShareName: targetServer.smbShareName || cleanName,
          smbHost: targetServer.smbHost || nextConfig.host,
          smbPort: targetServer.smbPort || nextConfig.port,
          smbUsername: targetServer.smbUsername || nextConfig.username,
          smbPassword: targetServer.smbPassword || nextConfig.password,
          smbWorkgroup: targetServer.smbWorkgroup || nextConfig.workgroup,
          smbMountPath: targetServer.smbMountPath || nextConfig.mountPath,
          smbShares: nextShares,
        })
        onSaveCustom?.(nextConfig)
        toast({
          title: 'Samba Share Configured',
          description: `Share "/${cleanName}" added to server "${targetServer.name}".`,
          variant: 'default',
        })
      } else {
        onSaveCustom?.(nextConfig)
        toast({
          title: 'Samba Share Saved',
          description: `Standalone share "/${cleanName}" saved. Connect it to a server machine on the map.`,
          variant: 'default',
        })
      }

      onOpenChange(false)
    } catch {
      toast({
        title: 'Save Failed',
        description: 'Could not save Samba share settings.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const serverOptions = [
    { value: 'none', label: 'None (Standalone / Unassigned)' },
    ...serverMachines.map((m) => ({
      value: String(m.id),
      label: `${m.name} (${m.host || 'No IP'})`,
    })),
  ]

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Samba Share"
      description="Configure SMB network storage share parameters for game libraries and remote storage."
      className="max-w-md"
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FolderTree size={14} className="text-primary" />
            <span>Share Name *</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-xs font-mono text-muted-foreground select-none">/</span>
            <DkInput
              value={shareName}
              onChange={(e) => setShareName(e.target.value.replace(/^\/+/, ''))}
              placeholder="games"
              className="pl-6 font-mono text-xs"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">The SMB export directory name without leading slash.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Server size={14} className="text-primary" />
            <span>Host Server Machine</span>
          </label>
          <DkSelect
            value={selectedServerId}
            onValueChange={handleServerChange}
            options={serverOptions}
          />
          <p className="text-[10px] text-muted-foreground">
            Connect to an existing physical/virtual server, or keep standalone.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-semibold text-foreground">Host / IP</label>
            <DkInput
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.150 or nas.local"
              className="text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Port</label>
            <DkInput
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              placeholder="445"
              className="text-xs font-mono"
            />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound size={14} className="text-primary" />
              <span className="text-xs font-semibold text-foreground">Anonymous Guest Access</span>
            </div>
            <DkSwitch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
          </div>

          {!isAnonymous && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.04]">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Username</label>
                <DkInput
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="smbuser"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground">Password</label>
                <DkInput
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="text-xs"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Workgroup</label>
          <DkInput
            value={workgroup}
            onChange={(e) => setWorkgroup(e.target.value)}
            placeholder="WORKGROUP"
            className="text-xs font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Local Mount Path (Optional)</label>
          <DkInput
            value={mountPath}
            onChange={(e) => setMountPath(e.target.value)}
            placeholder="/mnt/user/games or /Volumes/Games"
            className="text-xs font-mono"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-1.5 font-semibold"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Connect Share</span>
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}

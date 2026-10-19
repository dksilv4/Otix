import { useState, useEffect } from 'react'
import { FolderTree, Server, Trash2, KeyRound } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { DkSelect } from '@ui/atoms/select'
import { useToast } from '@ui/molecules/toast'
import type { UserServerMachine } from '../../types/server-machines'
import type { SambaShareConfig } from '../../types/node-map'
import { useUpdateServerMachine } from '../../hooks/use-server-machines'

interface SambaShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  samba?: SambaShareConfig | null
  serverMachines: UserServerMachine[]
  onSaveCustom?: (config: SambaShareConfig) => void
  onDeleteCustom?: (id: string) => void
}

export const SambaShareModal = ({
  open,
  onOpenChange,
  samba,
  serverMachines,
  onSaveCustom,
  onDeleteCustom,
}: SambaShareModalProps) => {
  const { toast } = useToast()
  const updateServerMutation = useUpdateServerMachine()

  const [shareName, setShareName] = useState('games')
  const [selectedServerId, setSelectedServerId] = useState<string>('none')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(445)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [workgroup, setWorkgroup] = useState('WORKGROUP')
  const [mountPath, setMountPath] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (samba) {
      setShareName(samba.shareName || 'games')
      setSelectedServerId(samba.serverId ? String(samba.serverId) : 'none')
      setHost(samba.host || '')
      setPort(samba.port || 445)
      setIsAnonymous(!samba.username)
      setUsername(samba.username || '')
      setPassword(samba.password || '')
      setWorkgroup(samba.workgroup || 'WORKGROUP')
      setMountPath(samba.mountPath || '')
    } else {
      setShareName('games')
      setSelectedServerId(serverMachines[0] ? String(serverMachines[0].id) : 'none')
      setHost('')
      setPort(445)
      setIsAnonymous(true)
      setUsername('')
      setPassword('')
      setWorkgroup('WORKGROUP')
      setMountPath('')
    }
  }, [samba, open, serverMachines])

  // If a server is chosen and host is empty, auto-populate with server host
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
        id: samba?.id || `samba-custom-${Date.now()}`,
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
        nodeIds: samba?.nodeIds || [],
      }

      // If attached to a server, update the server machine's SMB settings in database
      if (targetServerId) {
        await updateServerMutation.mutateAsync({
          id: targetServerId,
          smbEnabled: true,
          smbShareName: cleanName,
          smbHost: nextConfig.host,
          smbPort: nextConfig.port,
          smbUsername: nextConfig.username,
          smbPassword: nextConfig.password,
          smbWorkgroup: nextConfig.workgroup,
          smbMountPath: nextConfig.mountPath,
        })
        toast({
          title: 'Samba Share Configured',
          description: `Share "/${cleanName}" updated on server "${targetServer?.name}".`,
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

  const handleDisconnect = async () => {
    if (!samba?.serverId) {
      if (samba?.id && onDeleteCustom) {
        onDeleteCustom(samba.id)
      }
      onOpenChange(false)
      return
    }

    setIsSaving(true)
    try {
      await updateServerMutation.mutateAsync({
        id: samba.serverId,
        smbEnabled: false,
      })
      toast({
        title: 'Samba Share Unlinked',
        description: 'Disabled SMB share on this server machine.',
        variant: 'default',
      })
      onOpenChange(false)
    } catch {
      toast({
        title: 'Action Failed',
        description: 'Failed to disconnect Samba share from server.',
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
      title={samba ? 'Samba Share Settings' : 'Add Samba Share'}
      description="Configure SMB network storage share parameters for game libraries and remote storage."
      className="max-w-md"
    >
      <div className="space-y-4 pt-2">
        {/* Share Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FolderTree size={13} className="text-primary" />
            <span>Share Name</span>
          </label>
          <DkInput
            value={shareName}
            onChange={(e) => setShareName(e.target.value)}
            placeholder="e.g. games, roms, or shared"
            className="h-9 text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            The exported SMB share name. Will be accessible as <code className="font-mono text-primary">/{shareName || 'share'}</code>.
          </p>
        </div>

        {/* Server Association */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Server size={13} className="text-primary" />
            <span>Server Machine</span>
          </label>
          <DkSelect
            value={selectedServerId}
            onChange={(e) => handleServerChange(e.target.value)}
            className="w-full h-9 text-xs"
          >
            {serverOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </DkSelect>
          <p className="text-[10px] text-muted-foreground">
            Connect this Samba share to a physical or virtual homelab server machine.
          </p>
        </div>

        {/* Host and Port Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Host / IP</label>
            <DkInput
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="e.g. 192.168.1.100"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Port</label>
            <DkInput
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              placeholder="445"
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Workgroup */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Workgroup</label>
          <DkInput
            value={workgroup}
            onChange={(e) => setWorkgroup(e.target.value)}
            placeholder="WORKGROUP"
            className="h-9 text-xs font-mono"
          />
        </div>

        {/* Credentials / Guest access toggle */}
        <div className="p-3 rounded-2xl bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">Anonymous / Guest Access</p>
              <p className="text-[10px] text-muted-foreground">Allow connection without username or password</p>
            </div>
            <DkSwitch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
          </div>

          {!isAnonymous && (
            <div className="space-y-2.5 pt-2 border-t border-[var(--dk-separator)]">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground flex items-center gap-1">
                  <KeyRound size={11} className="text-primary" />
                  <span>SMB Username</span>
                </label>
                <DkInput
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. smbuser or nobody"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">SMB Password</label>
                <DkInput
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* Mount Path */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Local/Remote Mount Path (Optional)</label>
          <DkInput
            value={mountPath}
            onChange={(e) => setMountPath(e.target.value)}
            placeholder="e.g. /mnt/user/games or D:\Shares\Games"
            className="h-9 text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
            Underlying storage directory path on the host machine.
          </p>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--dk-separator)]">
          {samba ? (
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={isSaving}
              className="text-muted-foreground hover:text-destructive h-8 px-2 text-xs gap-1"
            >
              <Trash2 size={12} />
              <span>{samba.serverId ? 'Disconnect' : 'Remove'}</span>
            </DkButton>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="h-8 text-xs"
            >
              Cancel
            </DkButton>
            <DkButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={isSaving}
              disabled={isSaving}
              className="h-8 text-xs font-semibold"
            >
              Save Share
            </DkButton>
          </div>
        </div>
      </div>
    </DkDialog>
  )
}

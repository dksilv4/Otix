import { useState, useEffect } from 'react'
import { FolderTree, Server, Trash2, KeyRound, Loader2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { DkSelect } from '@ui/atoms/select'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import type { UserServerMachine } from '../../types/server-machines'
import type { SambaShareConfig } from '../../types/node-map'
import { useUpdateServerMachine } from '../../hooks/use-server-machines'

export interface EditSambaShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  samba?: SambaShareConfig | null
  share?: SambaShareConfig | null
  serverMachines: UserServerMachine[]
  onSaveCustom?: (config: SambaShareConfig) => void
  onDeleteCustom?: (id: string) => void
}

export const EditSambaShareModal = ({
  open,
  onOpenChange,
  samba,
  share,
  serverMachines,
  onSaveCustom,
  onDeleteCustom,
}: EditSambaShareModalProps) => {
  const activeSamba = samba ?? share ?? null
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
    if (activeSamba) {
      setShareName(activeSamba.shareName || 'games')
      setSelectedServerId(activeSamba.serverId ? String(activeSamba.serverId) : 'none')
      setHost(activeSamba.host || '')
      setPort(activeSamba.port || 445)
      setIsAnonymous(!activeSamba.username)
      setUsername(activeSamba.username || '')
      setPassword(activeSamba.password || '')
      setWorkgroup(activeSamba.workgroup || 'WORKGROUP')
      setMountPath(activeSamba.mountPath || '')
    }
  }, [activeSamba, open])

  if (!activeSamba) return null

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
        id: activeSamba.id,
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
        nodeIds: activeSamba.nodeIds || [],
      }

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
    if (!activeSamba.serverId) {
      if (activeSamba.id && onDeleteCustom) {
        onDeleteCustom(activeSamba.id)
      }
      onOpenChange(false)
      return
    }

    setIsSaving(true)
    try {
      await updateServerMutation.mutateAsync({
        id: activeSamba.serverId,
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
      title="Configure Samba Share"
      description={`Configure SMB credentials, server host, and mount directory for /${activeSamba.shareName}.`}
      className="max-w-md"
    >
      <div className="space-y-4 pt-2">
        {/* Status Light Bar */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full shrink-0',
                activeSamba.isOnline !== false ? 'bg-primary animate-pulse' : 'bg-amber-400',
              )}
            />
            <p className="text-xs font-semibold text-foreground truncate">
              {activeSamba.isOnline !== false ? 'SMB Share Available' : 'SMB Share Offline'}
              <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                Port {port || 445}
              </span>
            </p>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            /{shareName}
          </span>
        </div>

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

        <div className="flex items-center justify-between pt-2">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            disabled={isSaving}
            className="text-destructive hover:bg-destructive/10 text-xs gap-1 cursor-pointer"
          >
            <Trash2 size={12} />
            <span>{activeSamba.serverId ? 'Unlink from Server' : 'Delete Share'}</span>
          </DkButton>

          <div className="flex items-center gap-2">
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
              <span>Save Changes</span>
            </DkButton>
          </div>
        </div>
      </div>
    </DkDialog>
  )
}

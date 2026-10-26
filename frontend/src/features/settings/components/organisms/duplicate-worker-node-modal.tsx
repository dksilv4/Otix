import { useState, useEffect } from 'react'
import { Copy, Server, Sparkles, Loader2, Home as HomeIcon, FolderTree } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { DkSelect } from '@ui/atoms/select'
import { useToast } from '@ui/molecules/toast'
import {
  useCreateGameServer,
  useGameServers,
} from '@/features/downloads/use-server-downloads'
import { useAssignNodeHome } from '../../hooks/use-server-machines'
import { replicateNodeSettings } from '../../utils/replicate-node-settings'
import {
  suggestDuplicateNodeName,
  suggestDuplicateNodeUrl,
  generateDuplicateNodeToken,
} from '../../utils/node-machine'
import type { GameServer } from '@/features/downloads/types'
import type { UserHome } from '../../types/server-machines'

export interface DuplicateWorkerNodeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceNode: GameServer | null
  homes?: UserHome[]
  onSuccess?: (newNode: GameServer) => void
}

export const DuplicateWorkerNodeModal = ({
  open,
  onOpenChange,
  sourceNode,
  homes = [],
  onSuccess,
}: DuplicateWorkerNodeModalProps) => {
  const { toast } = useToast()
  const createServerMutation = useCreateGameServer()
  const assignHomeMutation = useAssignNodeHome()
  const { data: allServers = [] } = useGameServers()

  const [name, setName] = useState('')
  const [localUrl, setLocalUrl] = useState('')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [isLocal, setIsLocal] = useState(true)
  const [selectedHomeId, setSelectedHomeId] = useState<string>('none')
  const [copyOrganize, setCopyOrganize] = useState(true)
  const [copyPaths, setCopyPaths] = useState(true)
  const [isDuplicating, setIsDuplicating] = useState(false)

  useEffect(() => {
    if (open && sourceNode) {
      const existingNames = (allServers || []).map((s) => s.name)
      setName(suggestDuplicateNodeName(sourceNode.name, existingNames))
      setLocalUrl(suggestDuplicateNodeUrl(sourceNode.localUrl || sourceNode.primaryUrl))
      setRemoteUrl(sourceNode.remoteUrl || '')
      setAuthToken(generateDuplicateNodeToken())
      setIsLocal(sourceNode.isLocal ?? true)
      setSelectedHomeId(sourceNode.homeId != null ? String(sourceNode.homeId) : 'none')
      setCopyOrganize(true)
      setCopyPaths(true)
    }
  }, [open, sourceNode])

  if (!sourceNode) return null

  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedLocalUrl = localUrl.trim()
    if (!trimmedName) {
      toast({
        title: 'Node Name Required',
        description: 'Please specify a name for the duplicated node.',
        variant: 'destructive',
      })
      return
    }

    setIsDuplicating(true)
    try {
      const newNode = await createServerMutation.mutateAsync({
        name: trimmedName,
        local_url: trimmedLocalUrl || undefined,
        remote_url: remoteUrl.trim() || undefined,
        auth_token: authToken.trim() || undefined,
        is_local: isLocal,
      })

      if (selectedHomeId !== 'none' && newNode?.id) {
        try {
          await assignHomeMutation.mutateAsync({
            nodeId: newNode.id,
            homeId: Number(selectedHomeId),
          })
        } catch {
          // ignore optional home assignment failure
        }
      }

      if (newNode?.id && (copyOrganize || copyPaths)) {
        try {
          await replicateNodeSettings({
            sourceNodeId: sourceNode.id,
            targetNodeIds: [newNode.id],
            copyOrganize,
            copyPaths,
          })
        } catch {
          // replication errors will still keep the created node
        }
      }

      toast({
        title: 'Node Duplicated',
        description: `Successfully duplicated "${sourceNode.name}" as "${trimmedName}".`,
        variant: 'default',
      })

      onOpenChange(false)
      onSuccess?.(newNode as GameServer)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast({
        title: 'Duplication Failed',
        description:
          error.response?.data?.error ||
          error.message ||
          'Could not duplicate node. Verify node address and settings.',
        variant: 'destructive',
      })
    } finally {
      setIsDuplicating(false)
    }
  }

  const homeOptions = [
    { value: 'none', label: 'None (Standalone / Unassigned)' },
    ...homes.map((h) => ({
      value: String(h.id),
      label: `${h.name}${h.isDefault ? ' (Default)' : ''}${h.subnetCidr ? ` · ${h.subnetCidr}` : ''}`,
    })),
  ]

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Duplicate Worker Node"
      description={`Create a clone of "${sourceNode.name}" with its organize rules and library configurations.`}
      className="max-w-lg"
    >
      <form onSubmit={handleDuplicate} className="space-y-4 pt-2">
        {/* Source info pill */}
        <div className="p-3 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Copy size={14} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">
                Source: {sourceNode.name}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {sourceNode.primaryUrl || sourceNode.localUrl || 'Companion Daemon'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--dk-surface-base)] text-muted-foreground shrink-0">
            Node #{sourceNode.id}
          </span>
        </div>

        {/* Duplicated Node Name */}
        <div className="space-y-1.5">
          <label htmlFor="dup-node-name" className="text-xs font-semibold text-muted-foreground">
            Duplicated Node Name
          </label>
          <DkInput
            id="dup-node-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. DK_GAMING_PC OTIX NODE (Copy)"
            autoFocus
            required
            disabled={isDuplicating}
          />
        </div>

        {/* Node Network Addresses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="dup-node-url" className="text-xs font-semibold text-muted-foreground">
              Local Endpoint / Port
            </label>
            <DkInput
              id="dup-node-url"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder="http://127.0.0.1:8091"
              disabled={isDuplicating}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="dup-node-remote-url" className="text-xs font-semibold text-muted-foreground">
              Remote / Tailscale URL (Optional)
            </label>
            <DkInput
              id="dup-node-remote-url"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://node.tailscale.net"
              disabled={isDuplicating}
            />
          </div>
        </div>

        {/* Home Assignment & Auth Token */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="dup-node-home" className="text-xs font-semibold text-muted-foreground">
              Home Environment
            </label>
            <DkSelect
              id="dup-node-home"
              value={selectedHomeId}
              onValueChange={setSelectedHomeId}
              options={homeOptions}
              disabled={isDuplicating}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="dup-node-token" className="text-xs font-semibold text-muted-foreground">
              Authentication Token
            </label>
            <DkInput
              id="dup-node-token"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Distinct auth token"
              disabled={isDuplicating}
            />
          </div>
        </div>

        {/* Replication Options Pod */}
        <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] space-y-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles size={13} className="text-primary" />
            <span>Settings Replication</span>
          </p>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Copy Organize Rules</p>
                <p className="text-[11px] text-muted-foreground">
                  Replicate folder structure templates, naming formats, and tags.
                </p>
              </div>
              <DkSwitch
                checked={copyOrganize}
                onCheckedChange={setCopyOrganize}
                disabled={isDuplicating}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/[0.04]">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Copy Library Paths</p>
                <p className="text-[11px] text-muted-foreground">
                  Replicate scan directories and default download destinations.
                </p>
              </div>
              <DkSwitch
                checked={copyPaths}
                onCheckedChange={setCopyPaths}
                disabled={isDuplicating}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/[0.04]">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Local Companion Node</p>
                <p className="text-[11px] text-muted-foreground">
                  Mark as running on LAN or local desktop machine.
                </p>
              </div>
              <DkSwitch
                checked={isLocal}
                onCheckedChange={setIsLocal}
                disabled={isDuplicating}
              />
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <DkButton
            type="button"
            variant="secondary"
            size="sm"
            disabled={isDuplicating}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </DkButton>
          <DkButton
            type="submit"
            variant="primary"
            size="sm"
            loading={isDuplicating}
            disabled={isDuplicating || !name.trim()}
            className="gap-1.5"
          >
            <Copy size={13} />
            <span>{isDuplicating ? 'Duplicating...' : 'Duplicate Node'}</span>
          </DkButton>
        </div>
      </form>
    </DkDialog>
  )
}

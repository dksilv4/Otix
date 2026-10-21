import { useState, useEffect } from 'react'
import { KeyRound, Server, RotateCcw, Sparkles, Loader2, Home as HomeIcon } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSelect } from '@ui/atoms/select'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import {
  useClaimGameServer,
  useCreateGameServer,
  useGameServers,
  usePendingGameServers,
  useUnclaimLocalNode,
} from '@/features/downloads/use-server-downloads'
import { useAssignNodeHome } from '../../hooks/use-server-machines'
import { isNodeOrphaned, type PendingNode } from '@/features/downloads/pending-nodes'
import { NodesFeatureTags } from '../nodes-feature-tags'
import type { GameServer } from '@/features/downloads/types'
import type { UserHome } from '../../types/server-machines'

export interface CreateWorkerNodeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName?: string
  initialNodeUrl?: string
  initialTab?: 'claim' | 'manual'
  homes?: UserHome[]
  defaultHomeId?: number | null
  onSuccess?: (server: GameServer) => void
}

export const CreateWorkerNodeModal = ({
  open,
  onOpenChange,
  defaultName = 'Worker Node',
  initialNodeUrl = '',
  initialTab = 'claim',
  homes = [],
  defaultHomeId = null,
  onSuccess,
}: CreateWorkerNodeModalProps) => {
  const { toast } = useToast()
  const claimServerMutation = useClaimGameServer()
  const createServerMutation = useCreateGameServer()
  const assignHomeMutation = useAssignNodeHome()
  const { data: servers = [] } = useGameServers()
  const { data: pendingNodes = [] } = usePendingGameServers({ enabled: open })
  const unclaimMutation = useUnclaimLocalNode()

  const [connectTab, setConnectTab] = useState<'claim' | 'manual'>(initialTab)
  const [claimPin, setClaimPin] = useState('')
  const [claimNodeUrl, setClaimNodeUrl] = useState(initialNodeUrl)
  const [claimServerName, setClaimServerName] = useState('')
  const [claimIsLocal, setClaimIsLocal] = useState(true)
  const [claimingPin, setClaimingPin] = useState(false)
  const [selectedHomeId, setSelectedHomeId] = useState<string>(
    defaultHomeId != null ? String(defaultHomeId) : 'none',
  )

  const [serverName, setServerName] = useState('')
  const [serverUrl, setServerUrl] = useState(initialNodeUrl || 'http://127.0.0.1:8090')
  const [serverRemoteUrl, setServerRemoteUrl] = useState('')
  const [serverToken, setServerToken] = useState('')
  const [manualIsLocal, setManualIsLocal] = useState(true)
  const [serverSubmitting, setServerSubmitting] = useState(false)

  const unclaimedNodes = pendingNodes.filter(
    (p) =>
      !p.claimed &&
      Boolean(p.claimCode || p.localUrl) &&
      !servers.some((s) => s.localUrl === p.localUrl || s.primaryUrl === p.localUrl),
  )
  const orphanedNodes = pendingNodes.filter((p) => isNodeOrphaned(p, servers))

  useEffect(() => {
    if (open) {
      setConnectTab(initialTab)
      setClaimPin('')
      setClaimNodeUrl(initialNodeUrl)
      setClaimServerName('')
      setServerName('')
      setServerUrl(initialNodeUrl || 'http://127.0.0.1:8090')
      setServerRemoteUrl('')
      setServerToken('')
      setSelectedHomeId(defaultHomeId != null ? String(defaultHomeId) : 'none')
    }
  }, [open, initialTab, initialNodeUrl, defaultHomeId])

  const handleUseDetectedPin = (node: PendingNode) => {
    if (node.claimCode) setClaimPin(node.claimCode)
    if (node.localUrl) setClaimNodeUrl(node.localUrl)
    if (node.serverName) setClaimServerName(node.serverName)
  }

  const handleUnclaim = async (node: PendingNode) => {
    try {
      await unclaimMutation.mutateAsync(node.authToken)
      toast({
        title: 'Node Reset',
        description: `Reset ${node.serverName || 'local node'}. Generating fresh PIN...`,
        variant: 'default',
      })
    } catch {
      toast({
        title: 'Reset Failed',
        description: 'Could not reset the node daemon. Check that it is running.',
        variant: 'destructive',
      })
    }
  }

  const resetAndClose = () => {
    setClaimPin('')
    setClaimNodeUrl('')
    setClaimServerName('')
    setServerName('')
    setServerUrl('http://127.0.0.1:8090')
    setServerRemoteUrl('')
    setServerToken('')
    setConnectTab('claim')
    onOpenChange(false)
  }

  const handleClaimByPin = async (e: React.FormEvent) => {
    e.preventDefault()
    const pin = claimPin.trim().toUpperCase()
    if (!pin) return

    const matchedPending = pendingNodes.find(
      (p) =>
        (pin && p.claimCode === pin) ||
        (claimNodeUrl && (p.localUrl === claimNodeUrl.trim() || p.localUrl === `${claimNodeUrl.trim()}/`)),
    )
    const fallbackDetectedName =
      matchedPending?.serverName &&
      matchedPending.serverName !== 'Otix Game Server' &&
      matchedPending.serverName !== 'Otix Node'
        ? matchedPending.serverName
        : undefined
    const effectiveName = claimServerName.trim() || fallbackDetectedName || defaultName
    const targetUrl = claimNodeUrl.trim() || (claimIsLocal ? 'http://127.0.0.1:8090' : undefined)

    setClaimingPin(true)
    try {
      const server = await claimServerMutation.mutateAsync({
        claim_code: pin,
        node_url: targetUrl,
        server_name: effectiveName,
        is_local: claimIsLocal,
      })

      if (selectedHomeId !== 'none') {
        try {
          await assignHomeMutation.mutateAsync({
            nodeId: server.id,
            homeId: Number(selectedHomeId),
          })
        } catch {
          // ignore optional home assignment error
        }
      }

      toast({
        title: 'Node claimed successfully',
        description: `Connected ${server.name || effectiveName} to your Otix account.`,
        variant: 'default',
      })
      resetAndClose()
      onSuccess?.(server)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast({
        title: 'Claim Failed',
        description:
          error.response?.data?.error ||
          error.message ||
          'Invalid or expired claim PIN. Check your node dashboard.',
        variant: 'destructive',
      })
    } finally {
      setClaimingPin(false)
    }
  }

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetUrl = serverUrl.trim() || (manualIsLocal ? 'http://127.0.0.1:8090' : '')
    if (!targetUrl || !serverToken.trim()) return
    const effectiveName = serverName.trim() || defaultName

    setServerSubmitting(true)
    try {
      const server = await createServerMutation.mutateAsync({
        name: effectiveName,
        local_url: targetUrl,
        remote_url: serverRemoteUrl.trim() || undefined,
        auth_token: serverToken.trim() || undefined,
        is_local: manualIsLocal,
      })

      if (selectedHomeId !== 'none') {
        try {
          await assignHomeMutation.mutateAsync({
            nodeId: server.id,
            homeId: Number(selectedHomeId),
          })
        } catch {
          // ignore
        }
      }

      if (server.isOnline) {
        toast({
          title: 'Node connected',
          description: `Successfully linked ${server.name || effectiveName}.`,
          variant: 'default',
        })
      } else {
        toast({
          title: 'Saved, but marked offline',
          description:
            server.connectError ||
            'Otix could not reach this URL from the API. Check that the node is running and ping again.',
          variant: 'destructive',
        })
      }
      resetAndClose()
      onSuccess?.(server)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast({
        title: 'Failed to connect node',
        description:
          error.response?.data?.error ||
          error.message ||
          'Check URL, token, and network connection.',
        variant: 'destructive',
      })
    } finally {
      setServerSubmitting(false)
    }
  }

  const homeOptions = [
    { value: 'none', label: 'None (Unassigned)' },
    ...homes.map((h) => ({
      value: String(h.id),
      label: `${h.name}${h.isDefault ? ' (Default)' : ''}`,
    })),
  ]

  return (
    <DkDialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && resetAndClose()}
      title="Connect Otix Node"
      description="Claim a running node with its PIN, or link one manually with a URL and access token."
      className="max-w-lg"
    >
      <div className="space-y-4 pt-1">
        <NodesFeatureTags />

        <div className="flex items-center gap-1 border-b border-white/[0.06] pb-3">
          <button
            type="button"
            onClick={() => setConnectTab('claim')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer',
              connectTab === 'claim'
                ? 'bg-primary text-primary-foreground font-bold shadow-sm shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
            )}
          >
            <KeyRound size={13} />
            Claim with PIN (Recommended)
          </button>
          <button
            type="button"
            onClick={() => setConnectTab('manual')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer',
              connectTab === 'manual'
                ? 'bg-primary text-primary-foreground font-bold shadow-sm shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
            )}
          >
            <Server size={13} />
            Manual URL &amp; Token
          </button>
        </div>

        {connectTab === 'claim' ? (
          <form onSubmit={handleClaimByPin} className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                Node Location
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setClaimIsLocal(true)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer',
                    claimIsLocal
                      ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                      : 'border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:border-white/[0.12]',
                  )}
                >
                  <span className="font-semibold block text-foreground">Local Computer</span>
                  <span className="text-[10px] text-muted-foreground">Running on this machine</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClaimIsLocal(false)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer',
                    !claimIsLocal
                      ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                      : 'border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:border-white/[0.12]',
                  )}
                >
                  <span className="font-semibold block text-foreground">Remote Host / NAS</span>
                  <span className="text-[10px] text-muted-foreground">TrueNAS, Unraid, Linux</span>
                </button>
              </div>
            </div>

            {unclaimedNodes.length > 0 && (
              <div className="p-3 rounded-xl bg-primary/[0.08] border border-primary/20 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Sparkles size={13} className="text-primary" />
                  <span>Detected Nodes on Local Network</span>
                </div>
                <div className="space-y-1.5">
                  {unclaimedNodes.map((pending, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg bg-white/[0.04] text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-foreground block truncate">
                          {pending.serverName || 'Otix Node'}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate block">
                          {pending.localUrl}
                        </span>
                      </div>
                      <DkButton
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => handleUseDetectedPin(pending)}
                        className="h-6 px-2 text-[11px] font-bold shrink-0"
                      >
                        Use PIN {pending.claimCode}
                      </DkButton>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                6-Digit Claim PIN *
              </label>
              <DkInput
                value={claimPin}
                onChange={(e) => setClaimPin(e.target.value.toUpperCase())}
                placeholder="OTX-XXXX"
                className="font-mono uppercase text-base tracking-widest text-center"
                maxLength={8}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Printed in your terminal when you start the Otix companion daemon.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Custom Node Name (Optional)
                </label>
                <DkInput
                  value={claimServerName}
                  onChange={(e) => setClaimServerName(e.target.value)}
                  placeholder="e.g. Living Room PC"
                />
              </div>

              {homes.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1 flex items-center gap-1">
                    <HomeIcon size={12} className="text-primary" />
                    <span>Home Environment</span>
                  </label>
                  <DkSelect
                    value={selectedHomeId}
                    onValueChange={setSelectedHomeId}
                    options={homeOptions}
                  />
                </div>
              )}
            </div>

            {!claimIsLocal && (
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Node URL (Optional override)
                </label>
                <DkInput
                  value={claimNodeUrl}
                  onChange={(e) => setClaimNodeUrl(e.target.value)}
                  placeholder="http://192.168.1.150:8090"
                />
              </div>
            )}

            {orphanedNodes.length > 0 && (
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Daemon thinks it is already paired?</span>
                <DkButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnclaim(orphanedNodes[0]!)}
                  disabled={unclaimMutation.isPending}
                  className="h-6 text-[11px] gap-1 text-primary shrink-0"
                >
                  <RotateCcw size={11} />
                  Reset PIN
                </DkButton>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <DkButton type="button" variant="ghost" size="sm" onClick={resetAndClose}>
                Cancel
              </DkButton>
              <DkButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={!claimPin.trim() || claimingPin}
                className="gap-1.5"
              >
                {claimingPin && <Loader2 size={13} className="animate-spin" />}
                <span>{claimingPin ? 'Connecting...' : 'Claim & Link Node'}</span>
              </DkButton>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAddServer} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Node Name
              </label>
              <DkInput
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="e.g. Living Room PC, Unraid NAS"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Server URL *
                </label>
                <DkInput
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8090"
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Remote / WAN URL (Optional)
                </label>
                <DkInput
                  value={serverRemoteUrl}
                  onChange={(e) => setServerRemoteUrl(e.target.value)}
                  placeholder="https://node.mydomain.com"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Auth Token *
              </label>
              <DkInput
                type="password"
                value={serverToken}
                onChange={(e) => setServerToken(e.target.value)}
                placeholder="Paste token from node's config.yaml"
                className="font-mono text-xs"
              />
            </div>

            {homes.length > 0 && (
              <div>
                <label className="text-xs font-medium text-foreground block mb-1 flex items-center gap-1">
                  <HomeIcon size={12} className="text-primary" />
                  <span>Home Environment</span>
                </label>
                <DkSelect
                  value={selectedHomeId}
                  onValueChange={setSelectedHomeId}
                  options={homeOptions}
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="manual-local-node-check"
                checked={manualIsLocal}
                onChange={(e) => setManualIsLocal(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-primary"
              />
              <label htmlFor="manual-local-node-check" className="text-xs text-muted-foreground cursor-pointer">
                Running locally on this computer
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <DkButton type="button" variant="ghost" size="sm" onClick={resetAndClose}>
                Cancel
              </DkButton>
              <DkButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={!serverUrl.trim() || !serverToken.trim() || serverSubmitting}
                className="gap-1.5"
              >
                {serverSubmitting && <Loader2 size={13} className="animate-spin" />}
                Connect Node
              </DkButton>
            </div>
          </form>
        )}
      </div>
    </DkDialog>
  )
}

export { CreateWorkerNodeModal as CreateNodeModal }

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  Copy,
  Check,
  DownloadCloud,
  ExternalLink,
  Globe,
  HardDrive,
  KeyRound,
  Plus,
  Radio,
  Search,
  Server,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { useModal } from '@/lib/modals'
import { cn, formatBytes } from '@/lib/utils'
import {
  useClaimGameServer,
  useDeleteGameServer,
  usePingGameServer,
  usePendingGameServers,
  useProbeGameServer,
  useUpdateGameServer,
  type ServerProbeResult,
} from '@/features/downloads/use-server-downloads'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import { ConnectNodeModal } from '@/features/downloads/molecules/connect-node-modal'
import { DownloadNodeModal } from '@/features/downloads/molecules/download-node-modal'
import { NodeFileExplorerModal } from '@/features/downloads/molecules/node-file-explorer-modal'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { NodesFeatureTags } from '../components/nodes-feature-tags'
import { useSettingsNode } from '../context/settings-node-context'
import { isLocalDesktopNode } from '../local-desktop-node'
import { nodeSettingsNavigateOptions } from '../node-settings'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'

export function SettingsNodesPage() {
  useSettingsHashScroll()
  const { toast } = useToast()
  const { openModal } = useModal()
  const navigate = useNavigate()

  const { servers: gameServers, isLoading } = useSettingsNode()
  const deleteServerMutation = useDeleteGameServer()
  const pingServerMutation = usePingGameServer()
  const updateServerMutation = useUpdateGameServer()
  const claimServerMutation = useClaimGameServer()
  const probeServerMutation = useProbeGameServer()
  const { data: pendingNodes = [] } = usePendingGameServers()

  const [search, setSearch] = useState('')
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [connectInitialUrl, setConnectInitialUrl] = useState('')
  const [nodeToDelete, setNodeToDelete] = useState<GameServer | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [probeResults, setProbeResults] = useState<Record<number, ServerProbeResult>>({})
  const [probingServerId, setProbingServerId] = useState<number | null>(null)

  const defaultAutoName = `Node ID:${(gameServers?.length || 0) + 1}`

  const unclaimedNodes = pendingNodes.filter(
    (p) =>
      !p.claimed &&
      Boolean(p.claimCode || p.localUrl) &&
      !gameServers.some((s) => s.localUrl === p.localUrl || s.primaryUrl === p.localUrl),
  )

  const filteredServers = useMemo(() => {
    if (!search.trim()) return gameServers
    const q = search.toLowerCase().trim()
    return gameServers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.primaryUrl || '').toLowerCase().includes(q) ||
        (s.localUrl || '').toLowerCase().includes(q),
    )
  }, [gameServers, search])

  const openDownloadNodeModal = () => {
    const close = openModal(<DownloadNodeModal onClose={() => close()} />)
  }

  const openConnectModal = (initialUrl = '') => {
    setConnectInitialUrl(initialUrl)
    setConnectModalOpen(true)
  }

  const openServerExplorer = (server: { id: number; name: string }) => {
    const close = openModal(
      <NodeFileExplorerModal
        initialNodeId={server.id}
        nodeName={server.name}
        onClose={() => close()}
      />,
    )
  }

  const handleCopyAddress = (server: GameServer, e: React.MouseEvent) => {
    e.stopPropagation()
    const address = server.primaryUrl || server.localUrl || ''
    if (!address) return
    void navigator.clipboard.writeText(address)
    setCopiedId(server.id)
    toast({
      title: 'Address Copied',
      description: `${address} copied to clipboard.`,
      variant: 'success',
    })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDeleteConfirm = async () => {
    if (!nodeToDelete) return
    try {
      await deleteServerMutation.mutateAsync(nodeToDelete.id)
      toast({
        title: 'Node disconnected',
        description: `Removed ${nodeToDelete.name} from your nodes.`,
        variant: 'default',
      })
      setNodeToDelete(null)
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: (err as { message?: string }).message || 'Could not disconnect node.',
        variant: 'error',
      })
    }
  }

  const handlePingServer = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = (await pingServerMutation.mutateAsync(id)) as {
        online?: boolean
        latency_ms?: number
        latencyMs?: number
        server?: { total_files?: number; totalFiles?: number }
        error?: string
      }
      if (res?.online) {
        toast({
          title: 'Node Online',
          description: `Ping: ${res.latency_ms ?? res.latencyMs}ms · ${res.server?.total_files ?? res.server?.totalFiles ?? 0} games indexed.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Node Offline',
          description: res?.error || 'Could not reach node.',
          variant: 'error',
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Ping Failed',
        description: (err as { message?: string }).message || 'Ping failed.',
        variant: 'error',
      })
    }
  }

  const handleSetPrimary = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await Promise.all(
        gameServers
          .filter((server) => !isLocalDesktopNode(server))
          .map((server) =>
            updateServerMutation.mutateAsync({
              id: server.id,
              is_active: server.id === id,
            }),
          ),
      )
      toast({
        title: 'Primary node updated',
        description: 'Downloads and browse actions will prefer this node.',
        variant: 'success',
      })
    } catch (err: unknown) {
      toast({
        title: 'Could not set primary',
        description: (err as { message?: string }).message || 'Try again.',
        variant: 'error',
      })
    }
  }

  const handleProbeServer = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setProbingServerId(id)
    try {
      const result = await probeServerMutation.mutateAsync(id)
      setProbeResults((prev) => ({ ...prev, [id]: result }))
      const isReachable = Boolean(
        result.remote_accessible ||
        result.remoteAccessible ||
        result.reachable ||
        result.status === 'online',
      )
      if (isReachable) {
        toast({
          title: 'Remote Access Verified',
          description: `${name} is accessible from the internet (${result.latency_ms ?? result.latencyMs}ms).`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Remote Access Not Reachable',
          description:
            result.message ||
            result.error ||
            result.suggestion ||
            'Could not reach node via WAN IP. Check router port forwarding (8090).',
          variant: 'error',
        })
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast({
        title: 'Probe Failed',
        description: error.response?.data?.error || error.message || 'Failed to probe node reachability.',
        variant: 'error',
      })
    } finally {
      setProbingServerId(null)
    }
  }

  const handleClaimQuickNode = async (node: PendingNode) => {
    if (!node.claimCode) return
    try {
      const server = await claimServerMutation.mutateAsync({
        claim_code: node.claimCode,
        node_url: node.localUrl || undefined,
        server_name: node.serverName || defaultAutoName,
        is_local: true,
      })
      toast({
        title: 'Node claimed',
        description: `Successfully claimed ${server.name}.`,
        variant: 'success',
      })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast({
        title: 'Claim Failed',
        description: error.response?.data?.error || error.message || 'Failed to claim node.',
        variant: 'error',
      })
    }
  }

  return (
    <div id="settings-nodes-section" className="space-y-6">
      <SectionHeader
        variant="page"
        icon={Server}
        title="Nodes"
        badges={<NodesFeatureTags />}
        description="Manage, monitor, and connect Otix worker nodes that host folders, downloads, and your library."
        action={
          gameServers.length > 0 ? (
            <div className="flex items-center gap-2">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={openDownloadNodeModal}
                className="gap-1.5"
              >
                <DownloadCloud size={14} />
                <span>Download</span>
              </DkButton>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => openConnectModal()}
                className="gap-1.5"
              >
                <Plus size={14} />
                <span>Connect Node</span>
              </DkButton>
            </div>
          ) : undefined
        }
      />

      {unclaimedNodes.length > 0 && (
        <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-bold text-foreground">
                  Unclaimed Otix Node Detected:{' '}
                  <span className="text-primary">{unclaimedNodes[0].serverName}</span>
                </p>
                {unclaimedNodes[0].claimCode && (
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white/10 text-foreground/90">
                    PIN: {unclaimedNodes[0].claimCode}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Available at {unclaimedNodes[0].localUrl}. Claim this node to link it to your account.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {unclaimedNodes[0].claimCode ? (
              <DkButton
                size="sm"
                variant="primary"
                onClick={() => handleClaimQuickNode(unclaimedNodes[0])}
                className="text-xs font-bold"
              >
                <KeyRound className="w-3.5 h-3.5 mr-1" />
                Claim Node
              </DkButton>
            ) : (
              <DkButton
                size="sm"
                variant="primary"
                onClick={() => openConnectModal(unclaimedNodes[0].localUrl)}
                className="text-xs font-bold"
              >
                Claim with PIN
              </DkButton>
            )}
          </div>
        </div>
      )}

      {gameServers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by node name or address..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="text-xs text-muted-foreground self-end sm:self-center font-medium">
            {filteredServers.length} {filteredServers.length === 1 ? 'node' : 'nodes'}
          </div>
        </div>
      )}

      {isLoading ? (
        <SettingsCard className="p-12 text-center text-xs text-muted-foreground">
          Loading nodes...
        </SettingsCard>
      ) : gameServers.length === 0 ? (
        <SettingsCard className="p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Server size={28} />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-base font-bold text-foreground tracking-tight">No Otix nodes connected</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Download Otix Node to run on your Mac, Windows PC, or home server. It runs quietly in the
              background — double-click to start and link it with your claim PIN.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap mt-2">
            <DkButton
              type="button"
              variant="primary"
              size="sm"
              onClick={openDownloadNodeModal}
              className="gap-1.5"
            >
              <DownloadCloud size={14} />
              <span>Download Otix Node</span>
            </DkButton>
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openConnectModal()}
              className="gap-1.5"
            >
              <Plus size={14} />
              <span>Connect existing node</span>
            </DkButton>
          </div>
        </SettingsCard>
      ) : filteredServers.length === 0 ? (
        <SettingsCard className="p-8 text-center text-xs text-muted-foreground">
          No nodes matched &quot;{search}&quot;.
        </SettingsCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredServers.map((server) => {
            const local = isLocalDesktopNode(server)
            const reserved = local
            const isOnline = server.isOnline
            const isCopied = copiedId === server.id
            const address = local ? null : server.primaryUrl || server.localUrl

            return (
              <SettingsCard
                key={server.id}
                className="p-5 flex flex-col justify-between gap-4 border border-white/[0.08] hover:border-white/15 transition-all group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          'w-2.5 h-2.5 rounded-full shrink-0',
                          isOnline
                            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                            : 'bg-red-500/80',
                        )}
                        title={isOnline ? 'Online' : 'Offline'}
                      />
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-foreground truncate" title={server.name}>
                          {server.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {local && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold uppercase tracking-wider">
                              Otix app
                            </span>
                          )}
                          {server.isActive && !local && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-primary/15 text-primary font-semibold uppercase tracking-wider">
                              <Star size={9} />
                              Primary
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-muted-foreground">
                            {local ? 'This computer' : server.isLocal ? 'Local' : 'Remote'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!reserved && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handlePingServer(server.id, e)}
                            title="Test connection"
                            disabled={pingServerMutation.isPending}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <Radio
                              size={13}
                              className={
                                pingServerMutation.isPending && pingServerMutation.variables === server.id
                                  ? 'animate-pulse text-primary'
                                  : ''
                              }
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleProbeServer(server.id, server.name, e)}
                            title="Test remote access"
                            disabled={probingServerId === server.id}
                            className={cn(
                              'p-1.5 rounded-lg transition-colors cursor-pointer',
                              probeResults[server.id]?.remote_accessible
                                ? 'text-emerald-400 hover:bg-emerald-500/10'
                                : probeResults[server.id]?.remote_accessible === false
                                  ? 'text-amber-400 hover:bg-amber-500/10'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-white/10',
                            )}
                          >
                            <Globe size={13} className={probingServerId === server.id ? 'animate-spin' : ''} />
                          </button>
                          {server.localUrl && (
                            <a
                              href={server.localUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Open node WebUI"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openServerExplorer(server)
                            }}
                            title="Explore node storage"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <HardDrive size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setNodeToDelete(server)
                            }}
                            title="Disconnect node"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {address ? (
                      <button
                        type="button"
                        onClick={(e) => handleCopyAddress(server, e)}
                        title="Click to copy address"
                        className="flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-foreground/80 transition-colors cursor-pointer"
                      >
                        <Globe size={11} className="text-primary" />
                        <span className="truncate max-w-[180px]">{address}</span>
                        {isCopied ? (
                          <Check size={11} className="text-emerald-400 ml-1" />
                        ) : (
                          <Copy size={11} className="text-muted-foreground ml-1" />
                        )}
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Otix app on this computer</span>
                    )}

                    {server.totalFiles > 0 && (
                      <span className="font-semibold text-foreground/80">{server.totalFiles} games</span>
                    )}

                    {server.storageFreeBytes > 0 && (
                      <span>{formatBytes(server.storageFreeBytes)} free</span>
                    )}

                    {(probeResults[server.id]?.remote_accessible || probeResults[server.id]?.remoteAccessible || probeResults[server.id]?.reachable) && (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                        <Globe size={11} />
                        Remote OK ({probeResults[server.id].latency_ms ?? probeResults[server.id].latencyMs}ms)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <Link
                      {...nodeSettingsNavigateOptions(server.id)}
                      aria-label={`Open ${server.name}`}
                      className="sr-only"
                    >
                      Open {server.name}
                    </Link>
                    {!reserved && !server.isActive && (
                      <button
                        type="button"
                        onClick={(e) => handleSetPrimary(server.id, e)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <Star size={11} />
                        Set primary
                      </button>
                    )}
                    {(reserved || server.isActive) && (
                      <span className="text-[11px] text-muted-foreground">
                        {local ? 'Desktop app' : server.isActive ? 'Primary node' : 'Worker node'}
                      </span>
                    )}
                  </div>

                  <DkButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      navigate(nodeSettingsNavigateOptions(server.id))
                    }
                    className="gap-1.5 h-8 px-3 text-xs"
                  >
                    <span>Open</span>
                    <ChevronRight size={12} />
                  </DkButton>
                </div>
              </SettingsCard>
            )
          })}
        </div>
      )}

      {nodeToDelete && (
        <DkDialog
          open={Boolean(nodeToDelete)}
          onOpenChange={(open) => !open && setNodeToDelete(null)}
          title="Disconnect Node"
          description="Are you sure you want to disconnect this Otix node?"
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-200 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <span>
                Disconnecting <strong>{nodeToDelete.name}</strong> removes it from your account. Active
                downloads on this node will stop.
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
                disabled={deleteServerMutation.isPending}
                className="gap-1.5"
              >
                <Trash2 size={13} />
                <span>{deleteServerMutation.isPending ? 'Disconnecting...' : 'Disconnect Node'}</span>
              </DkButton>
            </div>
          </div>
        </DkDialog>
      )}

      {connectModalOpen && (
        <ConnectNodeModal
          isOpen={connectModalOpen}
          onClose={() => {
            setConnectModalOpen(false)
            setConnectInitialUrl('')
          }}
          defaultName={defaultAutoName}
          initialNodeUrl={connectInitialUrl}
        />
      )}
    </div>
  )
}

export { SettingsNodesPage as SettingsDesktopPage }

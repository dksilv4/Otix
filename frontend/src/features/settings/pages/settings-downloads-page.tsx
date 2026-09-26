import React, { useState } from 'react'
import { DkButton } from '@ui/atoms/button'
import {
  Plus,
  Trash2,
  DownloadCloud,
  Server,
  Radio,
  ExternalLink,
  HardDrive,
  Star,
  ChevronRight,
  ArrowRight,
  Globe,
  KeyRound,
  Sparkles,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { useModal } from '@/lib/modals'
import {
  useGameServers,
  useCreateGameServer,
  useDeleteGameServer,
  usePingGameServer,
  useUpdateGameServer,
  useClaimGameServer,
  useProbeGameServer,
  usePendingGameServers,
  type ServerProbeResult,
} from '@/features/downloads/use-server-downloads'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import { ServerFileExplorerModal } from '@/features/downloads/molecules/server-file-explorer-modal'
import { DownloadNodeModal } from '@/features/downloads/molecules/download-node-modal'
import { useToast } from '@ui/molecules/toast'
import { Link } from '@tanstack/react-router'
import { ManageDownloadersModal } from '@/features/downloads/molecules/manage-downloaders-modal'
import { useSettingsNode } from '../context/settings-node-context'
import { isBackendNode } from '../backend-node'
import { isLocalDesktopNode } from '../local-desktop-node'
import { nodeSettingsNavigateOptions } from '../node-settings'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'

export interface SettingsDownloadsPageProps {
  embedded?: boolean
  variant?: 'all' | 'nodes' | 'clients'
}

export function SettingsDownloadsPage({
  embedded = false,
  variant = 'all',
}: SettingsDownloadsPageProps = {}) {
  const { openModal } = useModal()
  const { toast } = useToast()
  const showClients = variant !== 'nodes'
  const showNodes = variant !== 'clients'
  const { data: remoteServers = [] } = useGameServers()
  const { servers: settingsServers } = useSettingsNode()
  const gameServers = showNodes ? settingsServers : remoteServers
  const createServerMutation = useCreateGameServer()
  const deleteServerMutation = useDeleteGameServer()
  const pingServerMutation = usePingGameServer()
  const updateServerMutation = useUpdateGameServer()
  const claimServerMutation = useClaimGameServer()
  const probeServerMutation = useProbeGameServer()
  const { data: pendingNodes = [] } = usePendingGameServers({ enabled: showNodes })

  const [showAddServer, setShowAddServer] = useState(false)
  const [connectTab, setConnectTab] = useState<'claim' | 'manual'>('claim')
  const [claimPin, setClaimPin] = useState('')
  const [claimNodeUrl, setClaimNodeUrl] = useState('')
  const [claimServerName, setClaimServerName] = useState('')
  const [claimingPin, setClaimingPin] = useState(false)

  const [probeResults, setProbeResults] = useState<Record<number, ServerProbeResult>>({})
  const [probingServerId, setProbingServerId] = useState<number | null>(null)

  const [serverName, setServerName] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [serverRemoteUrl, setServerRemoteUrl] = useState('')
  const [serverToken, setServerToken] = useState('')
  const [serverSubmitting, setServerSubmitting] = useState(false)

  const unclaimedNodes = pendingNodes.filter(
    (p) =>
      !p.claimed &&
      Boolean(p.claimCode || p.localUrl) &&
      !gameServers.some((s) => s.localUrl === p.localUrl || s.primaryUrl === p.localUrl),
  )

  const openServerExplorer = (server: { id: number; name: string }) => {
    const close = openModal(
      <ServerFileExplorerModal
        initialServerId={server.id}
        serverName={server.name}
        onClose={() => close()}
      />,
    )
  }

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serverName.trim() || !serverUrl.trim() || !serverToken.trim()) return
    setServerSubmitting(true)
    try {
      const server = await createServerMutation.mutateAsync({
        name: serverName.trim(),
        local_url: serverUrl.trim(),
        remote_url: serverRemoteUrl.trim() || undefined,
        auth_token: serverToken.trim() || undefined,
      })
      if (server.isOnline) {
        toast({
          title: 'Node connected',
          description: `Successfully linked ${serverName}.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Saved, but marked offline',
          description:
            server.connectError ||
            'Otix could not reach this URL from the API. Open the node in a browser, copy its access token, and ping again.',
          variant: 'error',
        })
      }
      setServerName('')
      setServerUrl('')
      setServerRemoteUrl('')
      setServerToken('')
      setShowAddServer(false)
    } catch (err: any) {
      toast({
        title: 'Failed to connect node',
        description: err.message || 'Check URL and network connection.',
        variant: 'error',
      })
    } finally {
      setServerSubmitting(false)
    }
  }

  const handleDeleteServer = async (id: number, name: string) => {
    try {
      await deleteServerMutation.mutateAsync(id)
      toast({
        title: 'Node disconnected',
        description: `Removed ${name} from your nodes.`,
        variant: 'default',
      })
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'error',
      })
    }
  }

  const handlePingServer = async (id: number) => {
    try {
      const res: any = await pingServerMutation.mutateAsync(id)
      if (res?.online) {
        toast({
          title: 'Server Online',
          description: `Ping: ${res.latency_ms ?? res.latencyMs}ms · ${res.server?.total_files ?? res.server?.totalFiles ?? 0} games indexed.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Server Offline',
          description: res?.error || 'Could not reach server node.',
          variant: 'error',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Ping Failed',
        description: err.message,
        variant: 'error',
      })
    }
  }

  const handleSetPrimary = async (id: number) => {
    try {
      await Promise.all(
        gameServers
          .filter((server) => !isLocalDesktopNode(server) && !isBackendNode(server))
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
    } catch (err: any) {
      toast({
        title: 'Could not set primary',
        description: err.message || 'Try again.',
        variant: 'error',
      })
    }
  }

  const handleClaimByPin = async (e: React.FormEvent) => {
    e.preventDefault()
    const pin = claimPin.trim().toUpperCase()
    if (!pin) return
    setClaimingPin(true)
    try {
      const server = await claimServerMutation.mutateAsync({
        claim_code: pin,
        node_url: claimNodeUrl.trim() || undefined,
        server_name: claimServerName.trim() || undefined,
      })
      toast({
        title: 'Node claimed successfully',
        description: `Connected ${server.name} to your Otix account.`,
        variant: 'success',
      })
      setClaimPin('')
      setClaimNodeUrl('')
      setClaimServerName('')
      setShowAddServer(false)
    } catch (err: any) {
      toast({
        title: 'Claim Failed',
        description:
          err.response?.data?.error ||
          err.message ||
          'Invalid or expired claim PIN. Check your node dashboard.',
        variant: 'error',
      })
    } finally {
      setClaimingPin(false)
    }
  }

  const handleClaimQuickNode = async (node: PendingNode) => {
    if (!node.claimCode) return
    try {
      const server = await claimServerMutation.mutateAsync({
        claim_code: node.claimCode,
        node_url: node.localUrl || undefined,
        server_name: node.serverName || undefined,
      })
      toast({
        title: 'Node claimed',
        description: `Successfully claimed ${server.name}.`,
        variant: 'success',
      })
    } catch (err: any) {
      toast({
        title: 'Claim Failed',
        description: err.response?.data?.error || err.message || 'Failed to claim node.',
        variant: 'error',
      })
    }
  }

  const handleProbeServer = async (id: number, name: string) => {
    setProbingServerId(id)
    try {
      const result = await probeServerMutation.mutateAsync(id)
      setProbeResults((prev) => ({ ...prev, [id]: result }))
      if (result.remote_accessible) {
        toast({
          title: 'Remote Access Verified',
          description: `${name} is accessible from the internet (${result.latency_ms}ms).`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Remote Access Not Reachable',
          description: result.message || 'Could not reach node via WAN IP. Check router port forwarding (8090).',
          variant: 'error',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Probe Failed',
        description: err.response?.data?.error || err.message || 'Failed to probe node reachability.',
        variant: 'error',
      })
    } finally {
      setProbingServerId(null)
    }
  }

  const openManageDownloadersModal = () => {
    const close = openModal(<ManageDownloadersModal onClose={() => close()} />)
  }

  const openDownloadNodeModal = () => {
    const close = openModal(<DownloadNodeModal onClose={() => close()} />)
  }

  return (
    <div id="downloads" className="space-y-6 scroll-mt-28">
      {!embedded && (
        <SettingsCard>
          <SectionHeader
            variant="page"
            icon={DownloadCloud}
            title="Downloads"
            description="Otix nodes and download clients."
          />
        </SettingsCard>
      )}

      {showClients && (
      <SettingsCard>
        <SectionHeader
          title="Download clients"
          description="SABnzbd, Prowlarr, Radarr, and Sonarr each have an instance per Otix node."
          action={
            <div className="flex items-center gap-2">
              <DkButton size="sm" variant="ghost" onClick={openManageDownloadersModal}>
                <DownloadCloud className="h-3.5 w-3.5" />
                Manage Downloaders
              </DkButton>
              <DkButton size="sm" variant="ghost" asChild>
                <Link to="/settings/connections">
                  Open Connections
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </DkButton>
            </div>
          }
        />
      </SettingsCard>
      )}

      {showNodes && (
      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Otix nodes"
          description="Select a node to open its page. Connect workers to host folders, downloads, and your library on other machines."
          action={
            <div className="flex items-center gap-2">
              <DkButton size="sm" variant="ghost" onClick={openDownloadNodeModal}>
                <DownloadCloud size={14} />
                Download node
              </DkButton>
              <DkButton size="sm" variant="ghost" onClick={() => setShowAddServer(!showAddServer)}>
                <Plus size={14} />
                {showAddServer ? 'Cancel' : 'Connect node'}
              </DkButton>
            </div>
          }
        />

        {showAddServer && (
          <div className="p-4 rounded-xl bg-white/[0.04] space-y-4">
            <div className="flex items-center gap-1 border-b border-white/10 pb-3">
              <button
                type="button"
                onClick={() => setConnectTab('claim')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5',
                  connectTab === 'claim'
                    ? 'bg-primary text-black font-bold'
                    : 'text-white/60 hover:text-white hover:bg-white/5',
                )}
              >
                <KeyRound size={13} />
                Claim with PIN (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setConnectTab('manual')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5',
                  connectTab === 'manual'
                    ? 'bg-primary text-black font-bold'
                    : 'text-white/60 hover:text-white hover:bg-white/5',
                )}
              >
                <Server size={13} />
                Manual URL &amp; Token
              </button>
            </div>

            {connectTab === 'claim' ? (
              <form onSubmit={handleClaimByPin} className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                    6-Character Claim PIN
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <input
                      type="text"
                      required
                      maxLength={8}
                      placeholder="OTX-XXXX"
                      value={claimPin}
                      onChange={(e) => setClaimPin(e.target.value.toUpperCase())}
                      className="w-full sm:w-44 px-3 py-2 rounded-lg bg-black/40 text-base font-mono tracking-widest font-bold text-primary placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/40 uppercase"
                    />
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      Run <span className="font-mono text-white/80">otix-node</span> on Unraid, Docker, Linux, or Windows and open its web dashboard at{' '}
                      <span className="font-mono text-white/80">http://&lt;node-ip&gt;:8090</span> to view your claim PIN.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                      Node URL <span className="normal-case font-normal text-white/30">(optional if on same LAN)</span>
                    </label>
                    <input
                      type="url"
                      placeholder="e.g. http://192.168.1.50:8090"
                      value={claimNodeUrl}
                      onChange={(e) => setClaimNodeUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                      Server Name <span className="normal-case font-normal text-white/30">(optional override)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Home Server"
                      value={claimServerName}
                      onChange={(e) => setClaimServerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddServer(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={claimingPin || !claimPin.trim()}
                    className="px-4 py-1.5 rounded-lg bg-primary text-black text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <KeyRound size={13} />
                    {claimingPin ? 'Verifying PIN & Claiming...' : 'Claim & Link Node'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddServer} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                      Node name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Home NAS"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                      LAN URL
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="e.g. http://192.168.1.50:8090"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                    Remote URL <span className="normal-case font-normal text-white/30">(optional)</span>
                  </label>
                  <input
                    type="url"
                    placeholder="e.g. https://nas.example.com"
                    value={serverRemoteUrl}
                    onChange={(e) => setServerRemoteUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <p className="mt-1.5 text-[11px] text-white/40 leading-relaxed">
                    Used when you or someone you share with opens Otix away from home.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                    Access Token
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Paste the token from the node's homepage"
                    value={serverToken}
                    onChange={(e) => setServerToken(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <p className="mt-1.5 text-[11px] text-white/40 leading-relaxed">
                    Open the node in a browser, copy its access token, then paste it here.
                    {serverUrl.trim() ? (
                      <>
                        {' '}
                        <a
                          href={serverUrl.trim()}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Open node <ExternalLink size={11} />
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddServer(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={serverSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-primary text-black text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {serverSubmitting ? 'Testing & Saving...' : 'Save & Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {unclaimedNodes.length > 0 && (
          <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-white">
                    Unclaimed Otix Node Detected: <span className="text-primary">{unclaimedNodes[0].serverName}</span>
                  </p>
                  {unclaimedNodes[0].claimCode && (
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white/10 text-white/90">
                      PIN: {unclaimedNodes[0].claimCode}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 truncate">
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
                  onClick={() => {
                    setShowAddServer(true)
                    setConnectTab('claim')
                    setClaimNodeUrl(unclaimedNodes[0].localUrl)
                  }}
                  className="text-xs font-bold"
                >
                  Claim with PIN
                </DkButton>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {gameServers.length > 0 ? (
            gameServers.map((server) => {
              const local = isLocalDesktopNode(server)
              const backend = isBackendNode(server)
              const reserved = local || backend
              return (
              <div
                key={server.id}
                className="relative group p-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
              >
                <Link
                  {...nodeSettingsNavigateOptions(server.id)}
                  className="absolute inset-0 z-[1] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={`Open ${server.name}`}
                >
                  <span className="sr-only">Open {server.name}</span>
                </Link>
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                      <Server size={18} className="text-white/80" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{server.name}</span>
                        {local && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400">
                            Otix app
                          </span>
                        )}
                        {backend && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400">
                            Backend
                          </span>
                        )}
                        {server.isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary">
                            <Star size={10} />
                            Primary
                          </span>
                        )}
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            server.isOnline
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400',
                          )}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              server.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400',
                            )}
                          />
                          {server.isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-white/40 mt-0.5 flex-wrap">
                        <span className={cn('truncate inline-flex items-center gap-1', reserved ? 'text-white/50' : 'font-mono text-white/60')}>
                          {local
                            ? 'Otix app on this computer'
                            : backend
                              ? 'Account settings live on the Otix backend'
                              : server.primaryUrl}
                          {probeResults[server.id]?.remote_accessible && (
                            <span className="inline-flex items-center text-emerald-400" title="Accessible from the Internet">
                              <Globe size={11} />
                            </span>
                          )}
                        </span>
                        {server.totalFiles > 0 && <span>· {server.totalFiles} games</span>}
                        {server.storageFreeBytes > 0 && (
                          <span>· {formatBytes(server.storageFreeBytes)} free</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="relative z-[2] flex items-center gap-2 self-end sm:self-center flex-wrap pointer-events-none">
                  {!reserved && (
                  <>
                    {!server.isActive && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(server.id)}
                        className="pointer-events-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors"
                        title="Set as primary"
                      >
                        <Star size={12} />
                        <span>Set primary</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleProbeServer(server.id, server.name)}
                      disabled={probingServerId === server.id}
                      className={cn(
                        'pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                        probeResults[server.id]?.remote_accessible
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : probeResults[server.id]?.remote_accessible === false
                            ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                            : 'bg-white/5 hover:bg-white/10 text-white/80 hover:text-white',
                      )}
                      title="Test Remote Access (Internet Reachability)"
                    >
                      <Globe size={12} className={probingServerId === server.id ? 'animate-spin' : ''} />
                      <span>
                        {probingServerId === server.id
                          ? 'Probing WAN...'
                          : probeResults[server.id]?.remote_accessible
                            ? `Remote OK (${probeResults[server.id].latency_ms}ms)`
                            : probeResults[server.id]?.remote_accessible === false
                              ? 'Port 8090 Closed'
                              : 'Remote Access'}
                      </span>
                    </button>
                    {server.localUrl && (
                      <a
                        href={server.localUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-medium transition-colors"
                        title="Open Node WebUI"
                      >
                        <ExternalLink size={12} />
                        <span>WebUI</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openServerExplorer(server)}
                      className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-medium transition-colors"
                      title="Explore Server Storage"
                    >
                      <HardDrive size={12} />
                      <span>Explore</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePingServer(server.id)}
                      className="pointer-events-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors"
                      title="Test Connection"
                    >
                      <Radio size={12} />
                      <span>Ping</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteServer(server.id, server.name)}
                      className="pointer-events-auto p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 transition-colors"
                      title="Disconnect Server"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                  )}
                    <span
                      aria-hidden
                      className="flex items-center gap-0.5 text-xs font-medium text-white/40 group-hover:text-white transition-colors"
                    >
                      Open
                      <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
              </div>
              )
            })
          ) : (
            <div className="p-6 rounded-xl bg-white/[0.03] text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary">
                <DownloadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-white font-semibold">No Otix nodes connected yet</p>
                <p className="text-xs text-white/50 max-w-md mx-auto leading-relaxed">
                  Download Otix Node to run on your Mac, Windows PC, or home server. It runs quietly in the background with zero setup — double-click to start and link it with your claim PIN.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                <DkButton size="sm" variant="primary" onClick={openDownloadNodeModal} className="text-xs font-bold">
                  <DownloadCloud size={14} className="mr-1.5" />
                  Download Otix Node
                </DkButton>
                <DkButton size="sm" variant="ghost" onClick={() => setShowAddServer(true)} className="text-xs font-medium">
                  <Plus size={14} className="mr-1.5" />
                  Connect existing node
                </DkButton>
              </div>
            </div>
          )}
        </div>
      </SettingsCard>
      )}
    </div>
  )
}

export { SettingsDownloadsPage as SettingsDownloadsSection }

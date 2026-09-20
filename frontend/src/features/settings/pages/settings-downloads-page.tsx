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
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { useModal } from '@/lib/modals'
import {
  useGameServers,
  useCreateGameServer,
  useDeleteGameServer,
  usePingGameServer,
  useUpdateGameServer,
} from '@/features/downloads/use-server-downloads'
import { ServerFileExplorerModal } from '@/features/downloads/molecules/server-file-explorer-modal'
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

  const [showAddServer, setShowAddServer] = useState(false)
  const [serverName, setServerName] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [serverRemoteUrl, setServerRemoteUrl] = useState('')
  const [serverToken, setServerToken] = useState('')
  const [serverSubmitting, setServerSubmitting] = useState(false)

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

  const openManageDownloadersModal = () => {
    const close = openModal(<ManageDownloadersModal onClose={() => close()} />)
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
            <DkButton size="sm" variant="ghost" onClick={() => setShowAddServer(!showAddServer)}>
              <Plus size={14} />
              {showAddServer ? 'Cancel' : 'Connect node'}
            </DkButton>
          }
        />

        {showAddServer && (
          <form onSubmit={handleAddServer} className="p-4 rounded-xl bg-white/[0.04] space-y-3">
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
                        <span className={cn('truncate', reserved ? 'text-white/50' : 'font-mono text-white/60')}>
                          {local
                            ? 'Otix app on this computer'
                            : backend
                              ? 'Account settings live on the Otix backend'
                              : server.primaryUrl}
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
            <div className="p-4 rounded-xl bg-white/[0.03] text-center space-y-1">
              <p className="text-xs text-white/50 font-medium">No Otix nodes connected</p>
              <p className="text-[11px] text-white/30 max-w-sm mx-auto">
                Run <span className="font-mono text-white/50">otix-server</span> on your NAS,
                Unraid, or another PC — or open the Otix app on this computer, which is a node too.
                Signed-in users auto-claim a live worker, or connect one
                manually above to manage that machine from anywhere.
              </p>
            </div>
          )}
        </div>
      </SettingsCard>
      )}
    </div>
  )
}

export { SettingsDownloadsPage as SettingsDownloadsSection }

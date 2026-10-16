import { useState, useRef, useMemo, useEffect } from 'react'
import {
  AlertTriangle,
  FolderTree,
  HardDrive,
  Home as HomeIcon,
  KeyRound,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { useModal } from '@/lib/modals'
import { useAuth } from '@/lib/providers/auth'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { cn } from '@/lib/utils'
import {
  useClaimGameServer,
  useDeleteGameServer,
  usePingGameServer,
  usePendingGameServers,
  useUpdateGameServer,
} from '@/features/downloads/use-server-downloads'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import { ConnectNodeModal } from '@/features/downloads/molecules/connect-node-modal'
import { DownloadNodeModal } from '@/features/downloads/molecules/download-node-modal'
import { NodesFeatureTags } from '../components/nodes-feature-tags'
import { NodeSettingsModal } from '../components/organisms/node-settings-modal'
import { useSettingsNode } from '../context/settings-node-context'
import { isDesktop } from '@/lib/desktop/api'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import {
  useUserHomes,
  useServerMachines,
  useDeleteServerMachine,
  useDetectServerDrives,
  useDeleteHome,
} from '../hooks/use-server-machines'
import { ServerMachineModal } from '../components/organisms/server-machine-modal'
import { HomeManageModal } from '../components/organisms/home-manage-modal'
import { SambaShareModal } from '../components/organisms/samba-share-modal'
import { AddNodeModal } from '../components/organisms/add-node-modal'
import { NodesTopologyCanvas } from '../components/organisms/nodes-topology-canvas'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type { SambaShareConfig } from '../types/node-map'
import {
  computeTopologyStats,
  loadStoredSambaShares,
  saveStoredSambaShares,
} from '../utils/node-map'

export const SettingsNodesPage = () => {
  useSettingsHashScroll()
  const { user, isAuthenticated } = useAuth()
  const { toast } = useToast()
  const { openModal } = useModal()

  const { servers: gameServers } = useSettingsNode()
  const deleteServerMutation = useDeleteGameServer()
  const pingServerMutation = usePingGameServer()
  const updateServerMutation = useUpdateGameServer()
  const claimServerMutation = useClaimGameServer()
  const { data: pendingNodes = [] } = usePendingGameServers()

  const { data: homes = [] } = useUserHomes()
  const { data: serverMachines = [] } = useServerMachines()
  const deleteMachineMutation = useDeleteServerMachine()
  const detectDrivesMutation = useDetectServerDrives()
  const deleteHomeMutation = useDeleteHome()

  const [serverMachineModalOpen, setServerMachineModalOpen] = useState(false)
  const [editingServerMachine, setEditingServerMachine] = useState<UserServerMachine | null>(null)
  const [homeModalOpen, setHomeModalOpen] = useState(false)
  const [editingHome, setEditingHome] = useState<UserHome | null>(null)
  const [sambaModalOpen, setSambaModalOpen] = useState(false)
  const [selectedSambaForModal, setSelectedSambaForModal] = useState<SambaShareConfig | null>(null)
  const [customSambaShares, setCustomSambaShares] = useState<SambaShareConfig[]>(loadStoredSambaShares)

  const [addNodeModalOpen, setAddNodeModalOpen] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [connectInitialUrl, setConnectInitialUrl] = useState('')
  const [nodeToDelete, setNodeToDelete] = useState<GameServer | null>(null)
  const [nodeToRename, setNodeToRename] = useState<GameServer | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [isSavingRename, setIsSavingRename] = useState(false)
  const [selectedNodeForModal, setSelectedNodeForModal] = useState<GameServer | null>(null)

  const handleSelectNodeType = (type: 'worker' | 'server' | 'home' | 'samba') => {
    if (type === 'worker') {
      openConnectModal()
    } else if (type === 'server') {
      setEditingServerMachine(null)
      setServerMachineModalOpen(true)
    } else if (type === 'home') {
      setEditingHome(null)
      setHomeModalOpen(true)
    } else if (type === 'samba') {
      setSelectedSambaForModal(null)
      setSambaModalOpen(true)
    }
  }

  const desktop = isDesktop()
  const sectionContainerRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | undefined>(undefined)

  const defaultAutoName = `Node ID:${(gameServers?.length || 0) + 1}`

  const unclaimedNodes = pendingNodes.filter(
    (p) =>
      !p.claimed &&
      Boolean(p.claimCode || p.localUrl) &&
      !gameServers.some((s) => s.localUrl === p.localUrl || s.primaryUrl === p.localUrl),
  )

  const stats = useMemo(
    () => computeTopologyStats(gameServers, serverMachines, homes, pendingNodes),
    [gameServers, serverMachines, homes, pendingNodes],
  )

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase()
      if (hash === 'servers' || hash === 'server-machines') {
        setServerMachineModalOpen(true)
      } else if (hash === 'homes') {
        setHomeModalOpen(true)
      } else if (hash === 'samba') {
        setSambaModalOpen(true)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateAnchor = () => {
      if (sectionContainerRef.current) {
        const rect = sectionContainerRef.current.getBoundingClientRect()
        const headerRect = headerRef.current?.getBoundingClientRect()
        if (rect.left > 0) {
          const topY = headerRect ? headerRect.bottom + 24 : rect.top + 160
          setAnchorPos({
            x: Math.round(rect.left),
            y: Math.round(topY),
          })
        }
      }
    }
    updateAnchor()
    window.addEventListener('resize', updateAnchor)
    return () => window.removeEventListener('resize', updateAnchor)
  }, [desktop, unclaimedNodes.length])

  const openDownloadNodeModal = () => {
    const close = openModal(<DownloadNodeModal onClose={() => close()} />)
  }

  const openConnectModal = (initialUrl = '') => {
    setConnectInitialUrl(initialUrl)
    setConnectModalOpen(true)
  }

  const handleSaveCustomSamba = (config: SambaShareConfig) => {
    setCustomSambaShares((prev) => {
      const existing = prev.findIndex((s) => s.id === config.id)
      const next = existing >= 0 ? prev.map((s, idx) => (idx === existing ? config : s)) : [...prev, config]
      saveStoredSambaShares(next)
      return next
    })
  }

  const handleDeleteCustomSamba = (id: string) => {
    setCustomSambaShares((prev) => {
      const next = prev.filter((s) => s.id !== id)
      saveStoredSambaShares(next)
      return next
    })
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

  const handleRenameConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nodeToRename) return
    const trimmed = renameInput.trim()
    if (!trimmed || trimmed === nodeToRename.name) {
      setNodeToRename(null)
      return
    }
    setIsSavingRename(true)
    try {
      await updateServerMutation.mutateAsync({
        id: nodeToRename.id,
        name: trimmed,
      })
      toast({
        title: 'Node renamed',
        description: `Renamed to “${trimmed}”.`,
        variant: 'success',
      })
      setNodeToRename(null)
    } catch (err: unknown) {
      toast({
        title: 'Error renaming node',
        description: (err as { message?: string })?.message || 'Could not rename node.',
        variant: 'error',
      })
    } finally {
      setIsSavingRename(false)
    }
  }

  const handlePingServer = async (id: number) => {
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

  const handlePingServerInstance = (server: GameServer) => {
    handlePingServer(server.id)
  }

  const handleClaimQuickNode = async (node: PendingNode) => {
    if (!node.claimCode) return
    const effectiveQuickName =
      node.serverName && node.serverName !== 'Otix Game Server' && node.serverName !== 'Otix Node'
        ? node.serverName
        : defaultAutoName
    try {
      const server = await claimServerMutation.mutateAsync({
        claim_code: node.claimCode,
        node_url: node.localUrl || undefined,
        server_name: effectiveQuickName,
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

  const openRenameModal = (server: GameServer) => {
    setNodeToRename(server)
    setRenameInput(server.name)
  }

  const handleDetectDrivesForMachine = async (machine: UserServerMachine) => {
    try {
      const res = await detectDrivesMutation.mutateAsync({
        serverId: machine.id,
        nodeId: machine.hostedNodeId ?? undefined,
      })
      toast({
        title: 'Hard Drives Detected',
        description: `Detected ${res.detectedDrives?.length ?? 0} physical drive(s).`,
        variant: 'default',
      })
    } catch (err: unknown) {
      toast({
        title: 'Detection Failed',
        description: (err as { message?: string }).message || 'Could not auto-detect drives.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteMachine = async (machine: UserServerMachine) => {
    if (!window.confirm(`Are you sure you want to remove "${machine.name}"?`)) return
    try {
      await deleteMachineMutation.mutateAsync(machine.id)
      toast({
        title: 'Server Machine Removed',
        description: `Removed "${machine.name}".`,
        variant: 'default',
      })
    } catch {
      toast({
        title: 'Failed to delete server machine',
        variant: 'error',
      })
    }
  }

  const handleDeleteHome = async (home: UserHome) => {
    if (!window.confirm(`Are you sure you want to remove the home "${home.name}"?`)) return
    try {
      await deleteHomeMutation.mutateAsync(home.id)
      toast({
        title: 'Home Removed',
        description: `Removed "${home.name}".`,
        variant: 'default',
      })
    } catch {
      toast({
        title: 'Failed to delete home',
        variant: 'error',
      })
    }
  }

  if (!isAuthenticated || !user?.isAdmin) {
    return (
      <SettingsLockedState
        title="Admin access required"
        description="Only server admins can configure Otix nodes, homes, and homelab server machines."
        icon={ShieldAlert}
        action={<span />}
      />
    )
  }

  return (
    <div id="settings-nodes-section" className="relative w-full h-full overflow-hidden">
      {/* Edge-to-Edge Canvas Background across the entire page behind sidebar & header */}
      <NodesTopologyCanvas
        homes={homes}
        serverMachines={serverMachines}
        nodes={gameServers}
        pendingNodes={[]}
        customSambaShares={customSambaShares}
        anchor={anchorPos}
        onOpenDownloadModal={openDownloadNodeModal}
        onClaimPendingNode={handleClaimQuickNode}
        onAddHome={() => {
          setEditingHome(null)
          setHomeModalOpen(true)
        }}
        onAddServer={(homeId) => {
          setEditingServerMachine(homeId ? ({ homeId } as any) : null)
          setServerMachineModalOpen(true)
        }}
        onAddNode={() => setAddNodeModalOpen(true)}
        onAddSamba={(preset) => {
          if (preset) {
            setSelectedSambaForModal({
              id: '',
              shareName: preset.shareName || 'games',
              serverId: preset.serverId || null,
              serverName: preset.serverName || null,
              host: preset.host || '',
              port: preset.port || 445,
            })
          } else {
            setSelectedSambaForModal(null)
          }
          setSambaModalOpen(true)
        }}
        onOpenSambaSettings={(samba) => {
          setSelectedSambaForModal(samba)
          setSambaModalOpen(true)
        }}
        onSaveCustomSamba={handleSaveCustomSamba}
        onDeleteSamba={handleDeleteCustomSamba}
        onEditHome={(home) => {
          setEditingHome(home)
          setHomeModalOpen(true)
        }}
        onDeleteHome={handleDeleteHome}
        onEditServer={(server) => {
          setEditingServerMachine(server)
          setServerMachineModalOpen(true)
        }}
        onDeleteServer={handleDeleteMachine}
        onDetectDrives={handleDetectDrivesForMachine}
        onOpenNodeSettings={(node) => setSelectedNodeForModal(node)}
        onRenameNode={(node) => openRenameModal(node)}
        onPingNode={handlePingServerInstance}
      />

      {/* Foreground Container in the exact same spot as all settings pages */}
      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
        <div
          ref={sectionContainerRef}
          className={cn(
            'min-h-full w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl 3xl:max-w-[92rem] mx-auto px-2 sm:px-4 lg:px-6 pb-28',
            desktop ? 'pt-20 sm:pt-24 lg:pt-28' : 'pt-14 sm:pt-16 lg:pt-20',
          )}
        >
          {/* Frosted Glass Header Pod */}
          <div
            ref={headerRef}
            className={cn(
              'pointer-events-auto rounded-3xl p-4 sm:p-5 transition-all duration-300 shadow-2xl',
              'backdrop-blur-2xl bg-[var(--dk-surface-base)]/85 border border-white/[0.06]',
            )}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Left: Title, Badges & Homelab Topology Stats */}
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Nodes
                  </h1>
                  <NodesFeatureTags />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {stats.offlineNodes > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                        <AlertTriangle size={10} />
                        <span>{stats.offlineNodes} offline</span>
                      </span>
                    )}

                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.04] text-muted-foreground border border-white/[0.04]">
                      <span>
                        {stats.onlineNodes}/{stats.totalNodes} {stats.totalNodes === 1 ? 'node' : 'nodes'} active
                      </span>
                    </span>

                    {stats.serverCount > 0 && (
                      <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.04] text-muted-foreground border border-white/[0.04]">
                        <HardDrive size={10} className="text-primary" />
                        <span>{stats.serverCount} machines</span>
                      </span>
                    )}

                    {stats.homeCount > 0 && (
                      <span className="hidden xl:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.04] text-muted-foreground border border-white/[0.04]">
                        <HomeIcon size={10} className="text-primary" />
                        <span>{stats.homeCount} {stats.homeCount === 1 ? 'home' : 'homes'}</span>
                      </span>
                    )}

                    {stats.sambaCount > 0 && (
                      <span className="hidden xl:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.04] text-muted-foreground border border-white/[0.04]">
                        <FolderTree size={10} className="text-primary" />
                        <span>{stats.sambaCount} {stats.sambaCount === 1 ? 'samba share' : 'samba shares'}</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-2xl">
                    Interactive homelab topology map. Connect worker nodes, server machines,
                    household environments, and network storage.
                  </p>
                </div>
              </div>

              {/* Right: Add Node Action Button */}
              <div className="flex items-center gap-2 flex-wrap shrink-0 self-start lg:self-center">
                <DkButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setAddNodeModalOpen(true)}
                  className="gap-1.5 font-semibold shadow-md shadow-primary/20"
                >
                  <Plus size={14} />
                  <span>Add Node</span>
                  {unclaimedNodes.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white/20 text-primary-foreground">
                      {unclaimedNodes.length}
                    </span>
                  )}
                </DkButton>
              </div>
            </div>

            {/* Unclaimed Nodes Notice (if any freshly discovered node with PIN exists) */}
            {unclaimedNodes.length > 0 && (
              <div className="mt-4 p-3.5 sm:p-4 rounded-2xl bg-primary/[0.08] backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm border border-primary/20">
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
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white/[0.08] text-foreground/90">
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
          </div>
        </div>
      </div>

      {nodeToDelete && (
        <DkDialog
          open={Boolean(nodeToDelete)}
          onOpenChange={(open) => !open && setNodeToDelete(null)}
          title="Disconnect Node"
          description="Are you sure you want to disconnect this Otix node?"
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-foreground/90 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
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

      {nodeToRename && (
        <DkDialog
          open={!!nodeToRename}
          onOpenChange={(openRename) => {
            if (!openRename) setNodeToRename(null)
          }}
          title="Rename Node"
          description={`Change the display name for ${nodeToRename.name}.`}
          className="max-w-md"
        >
          <form onSubmit={handleRenameConfirm} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="rename-node-input" className="text-xs font-semibold text-white/70">
                Node Name
              </label>
              <input
                id="rename-node-input"
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Enter node name..."
                autoFocus
                className="w-full h-10 px-3 rounded-xl bg-white/5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                disabled={isSavingRename}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSavingRename}
                onClick={() => setNodeToRename(null)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="submit"
                variant="primary"
                size="sm"
                loading={isSavingRename}
                disabled={isSavingRename || !renameInput.trim() || renameInput.trim() === nodeToRename.name}
              >
                Save Name
              </DkButton>
            </div>
          </form>
        </DkDialog>
      )}

      {connectModalOpen && (
        <ConnectNodeModal
          isOpen={connectModalOpen}
          onClose={() => {
            setConnectModalOpen(false)
            setConnectInitialUrl('')
          }}
          defaultName={
            unclaimedNodes[0]?.serverName &&
            unclaimedNodes[0].serverName !== 'Otix Game Server' &&
            unclaimedNodes[0].serverName !== 'Otix Node'
              ? unclaimedNodes[0].serverName
              : defaultAutoName
          }
          initialNodeUrl={connectInitialUrl}
        />
      )}

      <NodeSettingsModal
        server={selectedNodeForModal}
        open={Boolean(selectedNodeForModal)}
        onOpenChange={(open) => {
          if (!open) setSelectedNodeForModal(null)
        }}
      />

      {serverMachineModalOpen && (
        <ServerMachineModal
          open={serverMachineModalOpen}
          onOpenChange={(open) => {
            setServerMachineModalOpen(open)
            if (!open) setEditingServerMachine(null)
          }}
          server={editingServerMachine}
          homes={homes}
          nodes={gameServers}
          defaultHomeId={homes.find((h) => h.isDefault)?.id || homes[0]?.id}
        />
      )}

      {homeModalOpen && (
        <HomeManageModal
          open={homeModalOpen}
          onOpenChange={(open) => {
            setHomeModalOpen(open)
            if (!open) setEditingHome(null)
          }}
          home={editingHome}
        />
      )}

      <SambaShareModal
        open={sambaModalOpen}
        onOpenChange={(open) => {
          setSambaModalOpen(open)
          if (!open) setSelectedSambaForModal(null)
        }}
        samba={selectedSambaForModal}
        serverMachines={serverMachines}
        onSaveCustom={handleSaveCustomSamba}
        onDeleteCustom={handleDeleteCustomSamba}
      />

      <AddNodeModal
        open={addNodeModalOpen}
        onOpenChange={setAddNodeModalOpen}
        unclaimedNodes={unclaimedNodes}
        onSelectType={handleSelectNodeType}
        onClaimNode={handleClaimQuickNode}
      />
    </div>
  )
}

export { SettingsNodesPage as SettingsDesktopPage }

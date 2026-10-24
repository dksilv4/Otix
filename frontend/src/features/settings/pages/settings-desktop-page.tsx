import { useState, useMemo, useEffect } from 'react'
import {
  AlertTriangle,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import { useModal } from '@/lib/modals'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/lib/providers/auth'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import {
  useClaimGameServer,
  useDeleteGameServer,
  usePingGameServer,
  usePendingGameServers,
  useUpdateGameServer,
} from '@/features/downloads/use-server-downloads'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import { DownloadNodeModal } from '@/features/downloads/molecules/download-node-modal'
import { useSettingsNode } from '../context/settings-node-context'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import {
  useUserHomes,
  useServerMachines,
  useDeleteServerMachine,
  useDetectServerDrives,
  useDeleteHome,
} from '../hooks/use-server-machines'
import { CreateWorkerNodeModal } from '../components/organisms/create-worker-node-modal'
import { EditWorkerNodeModal } from '../components/organisms/edit-worker-node-modal'
import { CreateServerMachineModal } from '../components/organisms/create-server-machine-modal'
import { EditServerMachineModal } from '../components/organisms/edit-server-machine-modal'
import { CreateHomeModal } from '../components/organisms/create-home-modal'
import { EditHomeModal } from '../components/organisms/edit-home-modal'
import { CreateSambaShareModal } from '../components/organisms/create-samba-share-modal'
import { EditSambaShareModal } from '../components/organisms/edit-samba-share-modal'
import { AddNodeModal } from '../components/organisms/add-node-modal'
import { NodesTopologyCanvas } from '../components/organisms/nodes-topology-canvas'
import { GameServersDrawer } from '../components/organisms/game-servers-drawer'
import { NodesGridView } from '../components/organisms/nodes-grid-view'
import { NodesListView } from '../components/organisms/nodes-list-view'
import { useNodesView } from '../context/nodes-view-context'
import {
  flattenInfrastructureItems,
  filterInfrastructureItems,
  getNavPillsTopOffset,
} from '../utils/node-views'
import {
  useGameServers,
  useQueryGameServer,
  CreateGameServerModal,
  EditGameServerModal,
  type DedicatedGameServer,
} from '@/features/gameservers'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type { SambaShareConfig } from '../types/node-map'
import {
  computeTopologyStats,
  loadStoredSambaShares,
  saveStoredSambaShares,
} from '../utils/node-map'

export const SettingsNodesPage = () => {
  useSettingsHashScroll()
  const { isAuthenticated } = useAuth()
  const { toast } = useToast()
  const { openModal } = useModal()

  const { servers: gameServers, setSelectedNodeId } = useSettingsNode()
  const navigate = useNavigate()

  const handleOpenNodeSettings = (node: GameServer) => {
    setSelectedNodeId(node.id)
    void navigate({ to: '/settings/library', hash: 'organize' })
  }
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

  const { data: dedicatedGameServers = [] } = useGameServers()
  const queryGameServerMutation = useQueryGameServer()
  const [gameServersDrawerOpen, setGameServersDrawerOpen] = useState(false)
  const [focusedGameServerId, setFocusedGameServerId] = useState<number | null>(null)
  const [createGameServerOpen, setCreateGameServerOpen] = useState(false)
  const [createGameServerMachineId, setCreateGameServerMachineId] = useState<number | null>(null)
  const [editingGameServer, setEditingGameServer] = useState<DedicatedGameServer | null>(null)

  const [createWorkerNodeOpen, setCreateWorkerNodeOpen] = useState(false)
  const [editingWorkerNode, setEditingWorkerNode] = useState<GameServer | null>(null)
  const [createServerMachineOpen, setCreateServerMachineOpen] = useState(false)
  const [createServerHomeId, setCreateServerHomeId] = useState<number | null>(null)
  const [editingServerMachine, setEditingServerMachine] = useState<UserServerMachine | null>(null)
  const [createHomeOpen, setCreateHomeOpen] = useState(false)
  const [editingHome, setEditingHome] = useState<UserHome | null>(null)
  const [createSambaOpen, setCreateSambaOpen] = useState(false)
  const [createSambaPreset, setCreateSambaPreset] = useState<Partial<SambaShareConfig> | null>(null)
  const [editingSamba, setEditingSamba] = useState<SambaShareConfig | null>(null)
  const [customSambaShares, setCustomSambaShares] = useState<SambaShareConfig[]>(loadStoredSambaShares)

  const [addNodeModalOpen, setAddNodeModalOpen] = useState(false)
  const [connectInitialUrl, setConnectInitialUrl] = useState('')
  const [nodeToDelete, setNodeToDelete] = useState<GameServer | null>(null)
  const [nodeToRename, setNodeToRename] = useState<GameServer | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [isSavingRename, setIsSavingRename] = useState(false)

  const {
    viewMode,
    searchQuery,
    categoryFilter,
    statusFilter,
    resetFilters,
    addModalOpen,
    setAddModalOpen,
    setTotalCount,
    setOnlineCount,
  } = useNodesView()

  const handleSelectNodeType = (type: 'worker' | 'server' | 'home' | 'samba' | 'game_server') => {
    if (type === 'worker') {
      openConnectModal()
    } else if (type === 'server') {
      setCreateServerHomeId(null)
      setCreateServerMachineOpen(true)
    } else if (type === 'home') {
      setCreateHomeOpen(true)
    } else if (type === 'samba') {
      setCreateSambaPreset(null)
      setCreateSambaOpen(true)
    } else if (type === 'game_server') {
      setCreateGameServerMachineId(null)
      setCreateGameServerOpen(true)
    }
  }

  const defaultAutoName = `Node ID:${(gameServers?.length || 0) + 1}`

  const unclaimedNodes = pendingNodes.filter(
    (p) =>
      !p.claimed &&
      Boolean(p.claimCode || p.localUrl) &&
      !gameServers.some((s) => s.localUrl === p.localUrl || s.primaryUrl === p.localUrl),
  )

  const stats = useMemo(
    () =>
      computeTopologyStats(
        gameServers,
        serverMachines,
        homes,
        pendingNodes,
        customSambaShares,
        dedicatedGameServers,
      ),
    [gameServers, serverMachines, homes, pendingNodes, customSambaShares, dedicatedGameServers],
  )

  const allInfrastructureItems = useMemo(
    () =>
      flattenInfrastructureItems({
        nodes: gameServers,
        serverMachines,
        homes,
        customSambaShares,
        gameServers: dedicatedGameServers,
        unclaimedNodes,
      }),
    [gameServers, serverMachines, homes, customSambaShares, dedicatedGameServers, unclaimedNodes],
  )

  const filteredInfrastructureItems = useMemo(
    () => filterInfrastructureItems(allInfrastructureItems, searchQuery, categoryFilter, statusFilter),
    [allInfrastructureItems, searchQuery, categoryFilter, statusFilter],
  )

  const totalInfrastructureCount = allInfrastructureItems.length
  const onlineInfrastructureCount = useMemo(
    () => allInfrastructureItems.filter((i) => i.isOnline).length,
    [allInfrastructureItems],
  )

  useEffect(() => {
    setTotalCount(totalInfrastructureCount)
    setOnlineCount(onlineInfrastructureCount)
  }, [totalInfrastructureCount, onlineInfrastructureCount, setTotalCount, setOnlineCount])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase()
      const search = window.location.search.toLowerCase()
      if (hash === 'servers' || hash === 'server-machines') {
        setCreateServerMachineOpen(true)
      } else if (hash === 'homes') {
        setCreateHomeOpen(true)
      } else if (hash === 'samba') {
        setCreateSambaOpen(true)
      } else if (hash === 'game-servers' || search.includes('panel=game-servers')) {
        setGameServersDrawerOpen(true)
      }
    }
  }, [])


  const openDownloadNodeModal = () => {
    const close = openModal(<DownloadNodeModal onClose={() => close()} />)
  }

  const openConnectModal = (initialUrl = '') => {
    setConnectInitialUrl(initialUrl)
    setCreateWorkerNodeOpen(true)
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

  const handleCopyGameServerAddress = (server: DedicatedGameServer, e: React.MouseEvent) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(server.connectionAddress)
    toast({
      title: 'Address Copied',
      description: `${server.connectionAddress} copied to clipboard.`,
      variant: 'success',
    })
  }

  const handlePingDedicatedGameServer = async (server: DedicatedGameServer) => {
    try {
      await queryGameServerMutation.mutateAsync(server.id)
      toast({
        title: 'Server Queried',
        description: `Updated status for ${server.name}.`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Query Failed',
        description: `Could not reach ${server.name}.`,
        variant: 'error',
      })
    }
  }

  if (!isAuthenticated) {
    return (
      <SettingsLockedState
        title="Sign in required"
        description="Sign in to view and configure your Otix nodes, homes, and homelab server machines."
        icon={ShieldAlert}
        action={<span />}
      />
    )
  }

  return (
    <div
      id="settings-nodes-section"
      className={
        viewMode === 'map'
          ? 'relative w-full h-full overflow-hidden'
          : cn(
              'relative w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-28',
              getNavPillsTopOffset(false),
            )
      }
    >
      {viewMode === 'map' && (
        <NodesTopologyCanvas
          homes={homes}
          serverMachines={serverMachines}
          nodes={gameServers}
          gameServers={dedicatedGameServers}
          pendingNodes={[]}
          customSambaShares={customSambaShares}
          hubStats={stats}
          unclaimedNodes={unclaimedNodes}
          searchQuery={searchQuery}
          categoryFilter={categoryFilter}
          statusFilter={statusFilter}
          onOpenConnectModal={(url) => openConnectModal(url)}
          onOpenDownloadModal={openDownloadNodeModal}
          onOpenGameServersDrawer={() => setGameServersDrawerOpen(true)}
          onSelectGameServer={(server) => {
            setFocusedGameServerId(server.id)
            setGameServersDrawerOpen(true)
          }}
          onEditGameServer={(server) => setEditingGameServer(server)}
          onPingGameServer={handlePingDedicatedGameServer}
          onCopyGameServerAddress={handleCopyGameServerAddress}
          onClaimPendingNode={handleClaimQuickNode}
          onAddHome={() => setCreateHomeOpen(true)}
          onAddServer={(homeId) => {
            setCreateServerHomeId(homeId ?? null)
            setCreateServerMachineOpen(true)
          }}
          onAddNode={() => setAddNodeModalOpen(true)}
          onAddSamba={(preset) => {
            setCreateSambaPreset(preset ?? null)
            setCreateSambaOpen(true)
          }}
          onOpenSambaSettings={(samba) => setEditingSamba(samba)}
          onEditSamba={(samba) => setEditingSamba(samba)}
          onSaveCustomSamba={handleSaveCustomSamba}
          onDeleteSamba={handleDeleteCustomSamba}
          onEditHome={(home) => setEditingHome(home)}
          onDeleteHome={handleDeleteHome}
          onEditServer={(server) => setEditingServerMachine(server)}
          onDeleteServer={handleDeleteMachine}
          onDetectDrives={handleDetectDrivesForMachine}
          onOpenNodeSettings={handleOpenNodeSettings}
          onEditNode={(node) => setEditingWorkerNode(node)}
          onRenameNode={(node) => openRenameModal(node)}
          onPingNode={handlePingServerInstance}
        />
      )}

      {viewMode !== 'map' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.04]">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Nodes &amp; Infrastructure
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-status-online" />
                <span>{onlineInfrastructureCount}/{totalInfrastructureCount} online</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Worker companions, server machines, Samba network storage, and dedicated game servers.
            </p>
          </div>
        </div>
      )}

      {viewMode === 'grid' && (
        <div className="space-y-4">
          <NodesGridView
            items={filteredInfrastructureItems}
            categoryFilter={categoryFilter}
            onOpenNodeSettings={handleOpenNodeSettings}
            onEditNode={(node) => setEditingWorkerNode(node)}
            onRenameNode={(node) => openRenameModal(node)}
            onPingNode={handlePingServerInstance}
            onDisconnectNode={(node) => setNodeToDelete(node)}
            onEditServer={(server) => setEditingServerMachine(server)}
            onDeleteServer={handleDeleteMachine}
            onDetectDrives={handleDetectDrivesForMachine}
            onEditHome={(home) => setEditingHome(home)}
            onDeleteHome={handleDeleteHome}
            onEditSamba={(samba) => setEditingSamba(samba)}
            onDeleteSamba={handleDeleteCustomSamba}
            onOpenGameServerDrawer={(server) => {
              setFocusedGameServerId(server.id)
              setGameServersDrawerOpen(true)
            }}
            onPingGameServer={handlePingDedicatedGameServer}
            onEditGameServer={(server) => setEditingGameServer(server)}
            onCopyGameServerAddress={handleCopyGameServerAddress}
            onClaimPendingNode={handleClaimQuickNode}
            onAddNode={() => setAddNodeModalOpen(true)}
            onResetFilters={resetFilters}
          />
        </div>
      )}

      {viewMode === 'list' && (
        <div className="space-y-4">
          <NodesListView
            items={filteredInfrastructureItems}
            onOpenNodeSettings={handleOpenNodeSettings}
            onEditNode={(node) => setEditingWorkerNode(node)}
            onRenameNode={(node) => openRenameModal(node)}
            onPingNode={handlePingServerInstance}
            onDisconnectNode={(node) => setNodeToDelete(node)}
            onEditServer={(server) => setEditingServerMachine(server)}
            onDeleteServer={handleDeleteMachine}
            onDetectDrives={handleDetectDrivesForMachine}
            onEditHome={(home) => setEditingHome(home)}
            onDeleteHome={handleDeleteHome}
            onEditSamba={(samba) => setEditingSamba(samba)}
            onDeleteSamba={handleDeleteCustomSamba}
            onOpenGameServerDrawer={(server) => {
              setFocusedGameServerId(server.id)
              setGameServersDrawerOpen(true)
            }}
            onPingGameServer={handlePingDedicatedGameServer}
            onEditGameServer={(server) => setEditingGameServer(server)}
            onCopyGameServerAddress={handleCopyGameServerAddress}
            onClaimPendingNode={handleClaimQuickNode}
            onAddNode={() => setAddNodeModalOpen(true)}
            onResetFilters={resetFilters}
          />
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
            <div className="p-3.5 rounded-xl bg-destructive/10 text-xs text-foreground/90 flex items-start gap-2.5">
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
              <label htmlFor="rename-node-input" className="text-xs font-semibold text-muted-foreground">
                Node Name
              </label>
              <input
                id="rename-node-input"
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Enter node name..."
                autoFocus
                className="w-full h-10 px-3 rounded-xl bg-[var(--dk-surface-field)] text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
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

      {createWorkerNodeOpen && (
        <CreateWorkerNodeModal
          open={createWorkerNodeOpen}
          onOpenChange={(open) => {
            setCreateWorkerNodeOpen(open)
            if (!open) setConnectInitialUrl('')
          }}
          defaultName={
            unclaimedNodes[0]?.serverName &&
            unclaimedNodes[0].serverName !== 'Otix Game Server' &&
            unclaimedNodes[0].serverName !== 'Otix Node'
              ? unclaimedNodes[0].serverName
              : defaultAutoName
          }
          initialNodeUrl={connectInitialUrl}
          homes={homes}
          defaultHomeId={homes.find((h) => h.isDefault)?.id || homes[0]?.id}
        />
      )}

      {editingWorkerNode && (
        <EditWorkerNodeModal
          open={Boolean(editingWorkerNode)}
          onOpenChange={(open) => {
            if (!open) setEditingWorkerNode(null)
          }}
          node={editingWorkerNode}
          homes={homes}
          serverMachines={serverMachines}
          onOpenFullSettings={handleOpenNodeSettings}
        />
      )}

      <CreateServerMachineModal
        open={createServerMachineOpen}
        onOpenChange={setCreateServerMachineOpen}
        homes={homes}
        nodes={gameServers}
        defaultHomeId={createServerHomeId ?? homes.find((h) => h.isDefault)?.id ?? homes[0]?.id}
      />

      <EditServerMachineModal
        open={Boolean(editingServerMachine)}
        onOpenChange={(open) => {
          if (!open) setEditingServerMachine(null)
        }}
        server={editingServerMachine}
        homes={homes}
        nodes={gameServers}
      />

      <CreateHomeModal
        open={createHomeOpen}
        onOpenChange={setCreateHomeOpen}
      />

      <EditHomeModal
        open={Boolean(editingHome)}
        onOpenChange={(open) => {
          if (!open) setEditingHome(null)
        }}
        home={editingHome}
      />

      <CreateSambaShareModal
        open={createSambaOpen}
        onOpenChange={setCreateSambaOpen}
        serverMachines={serverMachines}
        preset={createSambaPreset}
        onSaveCustom={handleSaveCustomSamba}
      />

      <EditSambaShareModal
        open={Boolean(editingSamba)}
        onOpenChange={(open) => {
          if (!open) setEditingSamba(null)
        }}
        samba={editingSamba}
        serverMachines={serverMachines}
        onSaveCustom={handleSaveCustomSamba}
        onDeleteCustom={handleDeleteCustomSamba}
      />

      <AddNodeModal
        open={addNodeModalOpen || addModalOpen}
        onOpenChange={(open) => {
          setAddNodeModalOpen(open)
          setAddModalOpen(open)
        }}
        unclaimedNodes={unclaimedNodes}
        onSelectType={handleSelectNodeType}
        onClaimNode={handleClaimQuickNode}
      />

      <GameServersDrawer
        open={gameServersDrawerOpen}
        onClose={() => setGameServersDrawerOpen(false)}
        focusedServerId={focusedGameServerId}
        onOpenCreateServer={() => {
          setCreateGameServerMachineId(null)
          setCreateGameServerOpen(true)
        }}
      />

      <CreateGameServerModal
        isOpen={createGameServerOpen}
        onClose={() => setCreateGameServerOpen(false)}
        initialServerMachineId={createGameServerMachineId}
      />

      {editingGameServer && (
        <EditGameServerModal
          server={editingGameServer}
          isOpen={Boolean(editingGameServer)}
          onClose={() => setEditingGameServer(null)}
        />
      )}
    </div>
  )
}

export { SettingsNodesPage as SettingsDesktopPage }

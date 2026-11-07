import { useState, useMemo, useEffect } from 'react'
import { useToast } from '@ui/molecules/toast'
import { useModal } from '@/lib/modals'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/lib/providers/auth'
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
import {
  useUserHomes,
  useServerMachines,
  useDeleteServerMachine,
  useDetectServerDrives,
  useDeleteHome,
} from './use-server-machines'
import { useNodesView } from '../context/nodes-view-context'
import {
  flattenInfrastructureItems,
  filterInfrastructureItems,
} from '../utils/node-views'
import {
  useGameServers,
  useQueryGameServer,
  type DedicatedGameServer,
} from '@/features/gameservers'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type { SambaShareConfig } from '../types/node-map'
import {
  computeTopologyStats,
  loadStoredSambaShares,
  saveStoredSambaShares,
} from '../utils/node-map'

export const useNodesPageState = () => {
  const { isAuthenticated } = useAuth()
  const { toast } = useToast()
  const { openModal } = useModal()

  const { servers: gameServers, setSelectedNodeId } = useSettingsNode()
  const navigate = useNavigate()

  const {
    activeTab,
    setActiveTab,
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

  const handleOpenNodeSettings = (node: GameServer) => {
    setSelectedNodeId(node.id)
    setActiveTab('organize')
    void navigate({ to: '/settings/nodes', hash: 'organize' })
  }

  const deleteServerMutation = useDeleteGameServer()
  const pingServerMutation = usePingGameServer()
  const updateServerMutation = useUpdateGameServer()
  const claimServerMutation = useClaimGameServer()
  const { data: pendingNodes = [] } = usePendingGameServers()

  const { data: homes = [] } = useUserHomes({ enabled: isAuthenticated })
  const { data: serverMachines = [] } = useServerMachines(null, { enabled: isAuthenticated })
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
  const [duplicateWorkerNodeOpen, setDuplicateWorkerNodeOpen] = useState(false)
  const [nodeToDuplicate, setNodeToDuplicate] = useState<GameServer | null>(null)
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

  const openDownloadNodeModal = () => {
    const close = openModal(<DownloadNodeModal onClose={() => close()} />)
  }

  const openConnectModal = (initialUrl = '') => {
    setConnectInitialUrl(initialUrl)
    setCreateWorkerNodeOpen(true)
  }

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

  const handleDuplicateNode = (node: GameServer) => {
    setNodeToDuplicate(node)
    setDuplicateWorkerNodeOpen(true)
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

  return {
    isAuthenticated,
    gameServers,
    homes,
    serverMachines,
    dedicatedGameServers,
    unclaimedNodes,
    stats,
    allInfrastructureItems,
    filteredInfrastructureItems,
    totalInfrastructureCount,
    onlineInfrastructureCount,
    activeTab,
    setActiveTab,
    viewMode,
    searchQuery,
    categoryFilter,
    statusFilter,
    resetFilters,
    addModalOpen,
    setAddModalOpen,
    gameServersDrawerOpen,
    setGameServersDrawerOpen,
    focusedGameServerId,
    setFocusedGameServerId,
    createGameServerOpen,
    setCreateGameServerOpen,
    createGameServerMachineId,
    setCreateGameServerMachineId,
    editingGameServer,
    setEditingGameServer,
    createWorkerNodeOpen,
    setCreateWorkerNodeOpen,
    duplicateWorkerNodeOpen,
    setDuplicateWorkerNodeOpen,
    nodeToDuplicate,
    setNodeToDuplicate,
    editingWorkerNode,
    setEditingWorkerNode,
    createServerMachineOpen,
    setCreateServerMachineOpen,
    createServerHomeId,
    setCreateServerHomeId,
    editingServerMachine,
    setEditingServerMachine,
    createHomeOpen,
    setCreateHomeOpen,
    editingHome,
    setEditingHome,
    createSambaOpen,
    setCreateSambaOpen,
    createSambaPreset,
    setCreateSambaPreset,
    editingSamba,
    setEditingSamba,
    customSambaShares,
    setCustomSambaShares,
    addNodeModalOpen,
    setAddNodeModalOpen,
    connectInitialUrl,
    setConnectInitialUrl,
    nodeToDelete,
    setNodeToDelete,
    nodeToRename,
    setNodeToRename,
    renameInput,
    setRenameInput,
    isSavingRename,
    defaultAutoName,
    deleteServerPending: deleteServerMutation.isPending,
    openDownloadNodeModal,
    openConnectModal,
    handleSelectNodeType,
    handleSaveCustomSamba,
    handleDeleteCustomSamba,
    handleDeleteConfirm,
    handleRenameConfirm,
    handlePingServerInstance,
    handleClaimQuickNode,
    openRenameModal,
    handleDuplicateNode,
    handleDetectDrivesForMachine,
    handleDeleteMachine,
    handleDeleteHome,
    handleCopyGameServerAddress,
    handlePingDedicatedGameServer,
    handleOpenNodeSettings,
  }
}

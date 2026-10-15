import { useMemo, useState, useEffect, useRef } from 'react'
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Copy,
  Check,
  Cpu,
  DownloadCloud,
  ExternalLink,
  Globe,
  HardDrive,
  Home as HomeIcon,
  KeyRound,
  Monitor,
  Network,
  Pencil,
  Plus,
  Radio,
  Search,
  Server,
  Sparkles,
  Star,
  Trash2,
  RotateCcw,
  AlertCircle,
  RefreshCw,
  Loader2,
  ChevronDown,
  LayoutGrid,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { useModal } from '@/lib/modals'
import { cn, formatBytes, formatRAM } from '@/lib/utils'
import { readStoredSettings } from '../components/organisms/node-machine-settings'
import {
  useClaimGameServer,
  useDeleteGameServer,
  usePingGameServer,
  usePendingGameServers,
  useProbeGameServer,
  useUpdateGameServer,
  useUnclaimLocalNode,
  type ServerProbeResult,
} from '@/features/downloads/use-server-downloads'
import type { GameServer } from '@/features/downloads/types'
import { isNodeOrphaned, type PendingNode } from '@/features/downloads/pending-nodes'
import { ConnectNodeModal } from '@/features/downloads/molecules/connect-node-modal'
import { DownloadNodeModal } from '@/features/downloads/molecules/download-node-modal'
import { NodeFileExplorerModal } from '@/features/downloads/molecules/node-file-explorer-modal'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { NodesFeatureTags } from '../components/nodes-feature-tags'
import { NodeSettingsModal } from '../components/organisms/node-settings-modal'
import { useSettingsNode } from '../context/settings-node-context'
import { isLocalDesktopNode } from '../local-desktop-node'
import { isDesktop } from '@/lib/desktop/api'
import { EmbeddedNodeCard } from '../components/molecules/embedded-node-card'
import { nodeSettingsNavigateOptions } from '../node-settings'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import {
  useUserHomes,
  useServerMachines,
  useAssignNodeHome,
  useDeleteServerMachine,
  useDetectServerDrives,
  useDeleteHome,
} from '../hooks/use-server-machines'
import { ServerMachineModal } from '../components/organisms/server-machine-modal'
import { HomeManageModal } from '../components/organisms/home-manage-modal'
import { NodeConnectionsGroup } from '../components/organisms/node-connections-group'
import { NodesTopologyCanvas } from '../components/organisms/nodes-topology-canvas'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import { getOSLabel } from '../utils/server-machines'

export const SettingsNodesPage = () => {
  useSettingsHashScroll()
  const { toast } = useToast()
  const { openModal } = useModal()

  const { servers: gameServers, isLoading } = useSettingsNode()
  const deleteServerMutation = useDeleteGameServer()
  const pingServerMutation = usePingGameServer()
  const updateServerMutation = useUpdateGameServer()
  const claimServerMutation = useClaimGameServer()
  const probeServerMutation = useProbeGameServer()
  const unclaimLocalMutation = useUnclaimLocalNode()
  const { data: pendingNodes = [] } = usePendingGameServers()

  const { data: homes = [], isLoading: loadingHomes } = useUserHomes()
  const { data: serverMachines = [], isLoading: loadingMachines } = useServerMachines()
  const assignHomeMutation = useAssignNodeHome()
  const deleteMachineMutation = useDeleteServerMachine()
  const detectDrivesMutation = useDetectServerDrives()
  const deleteHomeMutation = useDeleteHome()

  const [viewMode, setViewMode] = useState<'map' | 'cards'>('map')
  const [activeTab, setActiveTab] = useState<'nodes' | 'servers' | 'homes'>('nodes')
  const [serverMachineModalOpen, setServerMachineModalOpen] = useState(false)
  const [editingServerMachine, setEditingServerMachine] = useState<UserServerMachine | null>(null)
  const [homeModalOpen, setHomeModalOpen] = useState(false)
  const [editingHome, setEditingHome] = useState<UserHome | null>(null)
  const [detectingMachineId, setDetectingMachineId] = useState<number | null>(null)
  const [expandedServicesNodeId, setExpandedServicesNodeId] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase()
      if (hash === 'servers' || hash === 'server-machines') {
        setViewMode('cards')
        setActiveTab('servers')
      } else if (hash === 'homes') {
        setViewMode('cards')
        setActiveTab('homes')
      } else if (hash === 'cards') {
        setViewMode('cards')
        setActiveTab('nodes')
      } else if (hash === 'map') {
        setViewMode('map')
      }
    }
  }, [])

  const handleTabChange = (tab: 'nodes' | 'servers' | 'homes') => {
    setActiveTab(tab)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tab}`)
    }
  }

  const handleViewModeChange = (mode: 'map' | 'cards') => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${mode}`)
    }
  }

  const [search, setSearch] = useState('')
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [connectInitialUrl, setConnectInitialUrl] = useState('')
  const [nodeToDelete, setNodeToDelete] = useState<GameServer | null>(null)
  const [nodeToRename, setNodeToRename] = useState<GameServer | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [isSavingRename, setIsSavingRename] = useState(false)
  const [isUnclaimingQuick, setIsUnclaimingQuick] = useState(false)
  const [selectedNodeForModal, setSelectedNodeForModal] = useState<GameServer | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [probeResults, setProbeResults] = useState<Record<number, ServerProbeResult>>({})
  const [probingServerId, setProbingServerId] = useState<number | null>(null)

  const desktop = isDesktop()
  const sectionContainerRef = useRef<HTMLDivElement>(null)
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | undefined>(undefined)

  const defaultAutoName = `Node ID:${(gameServers?.length || 0) + 1}`

  const unclaimedNodes = pendingNodes.filter(
    (p) =>
      !p.claimed &&
      Boolean(p.claimCode || p.localUrl) &&
      !gameServers.some((s) => s.localUrl === p.localUrl || s.primaryUrl === p.localUrl),
  )

  const orphanedNodes = pendingNodes.filter((p) => isNodeOrphaned(p, gameServers))

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateAnchor = () => {
      if (sectionContainerRef.current) {
        const rect = sectionContainerRef.current.getBoundingClientRect()
        if (rect.left > 0) {
          setAnchorPos({
            x: Math.round(rect.left),
            y: Math.round(rect.top + (unclaimedNodes.length > 0 ? 170 : 104)),
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
        result.status === 'online',
      )
      if (isReachable) {
        toast({
          title: 'Remote Access Verified',
          description: `${name} is accessible from the internet (${result.latency_ms}ms).`,
          variant: 'default',
        })
      } else {
        toast({
          title: 'Remote Access Not Reachable',
          description:
            result.message ||
            'Could not reach node via WAN IP. Check router port forwarding (8090).',
          variant: 'destructive',
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

  const handleUnclaimQuickNode = async (node: PendingNode) => {
    setIsUnclaimingQuick(true)
    try {
      await unclaimLocalMutation.mutateAsync(node.authToken)
      toast({
        title: 'Node Reset',
        description: `Reset ${node.serverName || 'local node'}. Generating fresh PIN...`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Reset Failed',
        description: 'Failed to reset local node.',
        variant: 'error',
      })
    } finally {
      setIsUnclaimingQuick(false)
    }
  }

  const openRenameModal = (server: GameServer) => {
    setNodeToRename(server)
    setRenameInput(server.name)
  }

  const handleDetectDrivesForMachine = async (machine: UserServerMachine) => {
    setDetectingMachineId(machine.id)
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
    } finally {
      setDetectingMachineId(null)
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

  const handleAssignNodeHome = async (nodeId: number, homeId: number | null) => {
    try {
      await assignHomeMutation.mutateAsync({ nodeId, homeId })
      toast({
        title: 'Home Assigned',
        description: 'Updated home assignment for node.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Failed to assign home',
        variant: 'error',
      })
    }
  }

  return (
    <div id="settings-nodes-section" className="relative w-full h-full overflow-hidden">
      {/* Edge-to-Edge Canvas Background across the entire page behind sidebar & header */}
      {viewMode === 'map' && (
        <NodesTopologyCanvas
          homes={homes}
          serverMachines={serverMachines}
          nodes={gameServers}
          pendingNodes={pendingNodes}
          anchor={anchorPos}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onOpenDownloadModal={openDownloadNodeModal}
          onClaimPendingNode={handleClaimQuickNode}
          onAddHome={() => {
            setEditingHome(null)
            setHomeModalOpen(true)
          }}
          onAddServer={() => {
            setEditingServerMachine(null)
            setServerMachineModalOpen(true)
          }}
          onAddNode={() => openConnectModal()}
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
        />
      )}

      {/* Foreground Container in the exact same spot as all settings pages */}
      <div
        className={cn(
          'absolute inset-0 z-10 pointer-events-none',
          viewMode === 'cards' ? 'overflow-y-auto' : 'overflow-hidden',
        )}
      >
        <div
          ref={sectionContainerRef}
          className={cn(
            'min-h-full w-full max-w-5xl xl:max-w-6xl mx-auto px-1 sm:px-3 lg:px-4 pb-28',
            desktop ? 'pt-24 sm:pt-28 lg:pt-32' : 'pt-16 sm:pt-20 lg:pt-24',
          )}
        >
          {/* Header in the exact same spot across all views */}
          <div className="pointer-events-auto space-y-4">
            <SectionHeader
              variant="page"
              icon={Server}
              title="Nodes"
              badges={<NodesFeatureTags />}
              description="Interactive homelab topology map. Connect worker nodes, server machines, and household environments."
              action={
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('map')}
                      title="Node Map topology view"
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                        viewMode === 'map'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Network size={13} />
                      <span>Node Map</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('cards')}
                      title="Cards list view"
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                        viewMode === 'cards'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <LayoutGrid size={13} />
                      <span>Cards</span>
                    </button>
                  </div>

                  <DkButton
                    type="button"
                    variant="secondary"
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
                    className="gap-1.5 font-semibold"
                  >
                    <Plus size={14} />
                    <span>Connect Node</span>
                  </DkButton>
                </div>
              }
            />

            {orphanedNodes.length > 0 && (
              <div className="p-4 rounded-2xl bg-destructive/[0.08] backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm border border-destructive/20">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-foreground">
                        Node Needs Re-linking: <span className="text-destructive font-bold">{orphanedNodes[0].serverName}</span>
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Running at {orphanedNodes[0].localUrl}, but linked to a deleted or different account. Reset to generate a new PIN and link to this account.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <DkButton
                    size="sm"
                    variant="primary"
                    onClick={() => handleUnclaimQuickNode(orphanedNodes[0])}
                    loading={isUnclaimingQuick}
                    className="text-xs font-bold"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Reset &amp; Claim Node
                  </DkButton>
                </div>
              </div>
            )}

            {unclaimedNodes.length > 0 && (
              <div className="p-4 rounded-2xl bg-primary/[0.08] backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm border border-primary/20">
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

          {/* Cards View when active */}
          {viewMode === 'cards' && (
            <div className="pointer-events-auto space-y-4 mt-6">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <DkButton
                    type="button"
                    size="sm"
                    variant={activeTab === 'nodes' ? 'primary' : 'ghost'}
                    onClick={() => handleTabChange('nodes')}
                    className="gap-1.5"
                  >
                    <Server size={14} />
                    <span>Nodes</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                        activeTab === 'nodes' ? 'bg-white/20' : 'bg-white/10',
                      )}
                    >
                      {gameServers.length}
                    </span>
                  </DkButton>

                  <DkButton
                    type="button"
                    size="sm"
                    variant={activeTab === 'servers' ? 'primary' : 'ghost'}
                    onClick={() => handleTabChange('servers')}
                    className="gap-1.5"
                  >
                    <HardDrive size={14} />
                    <span>Server Machines</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                        activeTab === 'servers' ? 'bg-white/20' : 'bg-white/10',
                      )}
                    >
                      {serverMachines.length}
                    </span>
                  </DkButton>

                  <DkButton
                    type="button"
                    size="sm"
                    variant={activeTab === 'homes' ? 'primary' : 'ghost'}
                    onClick={() => handleTabChange('homes')}
                    className="gap-1.5"
                  >
                    <HomeIcon size={14} />
                    <span>Homes</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                        activeTab === 'homes' ? 'bg-white/20' : 'bg-white/10',
                      )}
                    >
                      {homes.length}
                    </span>
                  </DkButton>
                </div>
              </div>

              {activeTab === 'nodes' && (
                <>
                  <EmbeddedNodeCard />

      {gameServers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by node name or address..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/[0.04] text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
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
          <div className="w-14 h-14 rounded-3xl bg-primary/10 flex items-center justify-center text-primary shadow-inner shadow-primary/10">
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
            const cachedNode = readStoredSettings(server.id)
            const cpuSummary = cachedNode.hardware?.cpu?.modelName
            const gpuSummary =
              cachedNode.hardware?.gpus?.find((g) => g.isDiscrete)?.name ||
              cachedNode.hardware?.gpus?.[0]?.name
            const ramSummary = cachedNode.hardware?.memory?.totalBytes
              ? formatRAM(cachedNode.hardware.memory.totalBytes)
              : null
            const hostedMachine = serverMachines.find((m) => m.hostedNodeId === server.id)
            const smbMachines = serverMachines.filter((m) => m.smbEnabled && m.smbNodeIds?.includes(server.id))

            return (
              <SettingsCard
                key={server.id}
                tone="raised"
                className="p-5 flex flex-col justify-between gap-4 transition-all duration-200 group"
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors',
                          isOnline
                            ? 'bg-primary/15 text-primary shadow-sm shadow-primary/10'
                            : 'bg-white/[0.04] text-muted-foreground',
                        )}
                      >
                        <Server className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 group/rename">
                          <h4 className="text-sm font-bold text-foreground truncate" title={server.name}>
                            {server.name}
                          </h4>
                          {!reserved && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setNodeToRename(server)
                                setRenameInput(server.name)
                              }}
                              title="Rename node"
                              aria-label={`Rename ${server.name}`}
                              className="opacity-0 group-hover/rename:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-opacity cursor-pointer"
                            >
                              <Pencil size={11} />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider',
                              isOnline
                                ? 'bg-primary/15 text-primary'
                                : 'bg-white/[0.05] text-muted-foreground',
                            )}
                          >
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                          {server.homeName && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                              {server.homeName}
                            </span>
                          )}
                          {local && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold uppercase tracking-wider">
                              Otix app
                            </span>
                          )}
                          {server.isActive && !local && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold uppercase tracking-wider">
                              <Star size={9} />
                              Primary
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground font-medium">
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
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <Radio
                              size={14}
                              className={
                                pingServerMutation.isPending && pingServerMutation.variables === server.id
                                  ? 'animate-pulse text-primary'
                                  : ''
                              }
                            />
                          </button>
                          {server.localUrl && (
                            <a
                              href={server.localUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Open node WebUI"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setNodeToDelete(server)
                            }}
                            title="Disconnect node"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-black/20 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {address ? (
                        <button
                          type="button"
                          onClick={(e) => handleCopyAddress(server, e)}
                          title="Click to copy address"
                          className="flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-foreground/80 transition-colors cursor-pointer"
                        >
                          <Globe size={11} className="text-primary shrink-0" />
                          <span className="truncate max-w-[200px]">{address}</span>
                          {isCopied ? (
                            <Check size={11} className="text-primary ml-1 shrink-0" />
                          ) : (
                            <Copy size={11} className="text-muted-foreground ml-1 shrink-0" />
                          )}
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Otix desktop local daemon</span>
                      )}

                      {server.totalFiles > 0 && (
                        <span className="text-xs font-semibold text-foreground/90">
                          {server.totalFiles} {server.totalFiles === 1 ? 'game' : 'games'}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {server.storageFreeBytes > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-foreground/75 bg-white/[0.04] px-2 py-0.5 rounded-md font-medium">
                          <HardDrive size={11} className="text-primary shrink-0" />
                          <span>{formatBytes(server.storageFreeBytes)} free</span>
                        </span>
                      )}

                      {cpuSummary && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-foreground/75 bg-white/[0.04] px-2 py-0.5 rounded-md font-medium"
                          title={`CPU: ${cpuSummary}`}
                        >
                          <Cpu size={11} className="text-primary shrink-0" />
                          <span className="truncate max-w-[130px]">
                            {cpuSummary
                              .replace(
                                /(Processor|8-Core|16-Core|12-Core|6-Core|32-Core|24-Core|\(R\)|\(TM\))/gi,
                                '',
                              )
                              .trim()}
                          </span>
                        </span>
                      )}

                      {gpuSummary && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-foreground/75 bg-white/[0.04] px-2 py-0.5 rounded-md font-medium"
                          title={`GPU: ${gpuSummary}`}
                        >
                          <Monitor size={11} className="text-primary shrink-0" />
                          <span className="truncate max-w-[130px]">
                            {gpuSummary
                              .replace(/(NVIDIA|AMD|Radeon|GeForce|\(R\)|\(TM\))/gi, '')
                              .trim()}
                          </span>
                        </span>
                      )}

                      {ramSummary && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-foreground/75 bg-white/[0.04] px-2 py-0.5 rounded-md font-medium"
                          title={`RAM: ${ramSummary}`}
                        >
                          <Activity size={11} className="text-primary shrink-0" />
                          <span>{ramSummary}</span>
                        </span>
                      )}

                      {probeResults[server.id]?.remote_accessible && (
                        <span className="inline-flex items-center gap-1 text-primary text-[11px] bg-primary/10 px-2 py-0.5 rounded-md font-medium">
                          <Globe size={11} />
                          Remote OK ({probeResults[server.id].latency_ms}ms)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Home assignment & Server machine relationships */}
                  <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-white/[0.04]">
                    <div className="flex items-center gap-1.5">
                      <HomeIcon size={12} className="text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">Home:</span>
                      <select
                        value={server.homeId ?? ''}
                        onChange={(e) =>
                          handleAssignNodeHome(
                            server.id,
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="rounded-lg bg-white/[0.05] hover:bg-white/[0.08] px-2 py-0.5 text-foreground text-[11px] outline-none border-none cursor-pointer"
                      >
                        <option value="" className="bg-[#18181b] text-foreground">
                          None (Unassigned)
                        </option>
                        {homes.map((h) => (
                          <option key={h.id} value={h.id} className="bg-[#18181b] text-foreground">
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {hostedMachine && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-foreground/80">
                        <Server size={11} className="text-primary" />
                        <span>Hosted on: {hostedMachine.name}</span>
                        <span className="text-muted-foreground">({getOSLabel(hostedMachine.os)})</span>
                      </span>
                    )}

                    {smbMachines.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-foreground/80">
                        <Network size={11} className="text-primary" />
                        <span>SMB link: {smbMachines.map((m) => m.name).join(', ')}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
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
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <Star size={12} />
                        <span>Set as primary</span>
                      </button>
                    )}
                    {(reserved || server.isActive) && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {local ? 'Desktop companion' : server.isActive ? 'Primary library node' : 'Worker node'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!reserved && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => handleProbeServer(server.id, server.name, e)}
                          disabled={probingServerId === server.id}
                          title="Probe remote reachability"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          {probingServerId === server.id ? (
                            <Loader2 size={14} className="animate-spin text-primary" />
                          ) : (
                            <Globe size={14} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openServerExplorer(server)
                          }}
                          title="Explore node storage"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <HardDrive size={14} />
                        </button>
                      </>
                    )}
                    <DkButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setSelectedNodeForModal(server)}
                      className="gap-1.5 h-8 px-3.5 text-xs font-semibold cursor-pointer"
                    >
                      <span>Open</span>
                      <ChevronRight size={13} />
                    </DkButton>
                  </div>
                </div>

                {/* Downloader & Arr Services Collapsible Group */}
                <div className="pt-2 border-t border-white/[0.04]">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedServicesNodeId(
                        expandedServicesNodeId === server.id ? null : server.id,
                      )
                    }
                    className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <DownloadCloud size={13} className="text-primary" />
                      <span>Downloader Services (SABnzbd, Prowlarr, Radarr, Sonarr)</span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={cn(
                        'transition-transform duration-200',
                        expandedServicesNodeId === server.id ? 'rotate-180' : '',
                      )}
                    />
                  </button>
                  {expandedServicesNodeId === server.id && (
                    <div className="mt-3">
                      <NodeConnectionsGroup
                        server={server}
                        searchQuery={search}
                        onOpenSettings={setSelectedNodeForModal}
                      />
                    </div>
                  )}
                </div>
              </SettingsCard>
            )
          })}
        </div>
      )}
        </>
      )}

      {/* TAB 2: SERVER MACHINES */}
      {activeTab === 'servers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
            <div>
              <p className="text-sm font-semibold text-foreground">Homelab &amp; NAS Server Machines</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Physical or virtual hosts running Unraid, TrueNAS, Ubuntu, Debian, Proxmox VE, or Windows Server.
              </p>
            </div>
            <DkButton
              type="button"
              size="sm"
              variant="primary"
              onClick={() => {
                setEditingServerMachine(null)
                setServerMachineModalOpen(true)
              }}
              className="gap-1.5 self-start sm:self-auto shrink-0"
            >
              <Plus size={14} />
              <span>Add Server Machine</span>
            </DkButton>
          </div>

          {loadingMachines ? (
            <SettingsCard className="p-12 text-center text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-primary" />
              Loading server machines...
            </SettingsCard>
          ) : serverMachines.length === 0 ? (
            <SettingsCard className="p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-3xl bg-primary/10 flex items-center justify-center text-primary shadow-inner shadow-primary/10">
                <Server size={28} />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-base font-bold text-foreground tracking-tight">No server machines added</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Add your Unraid tower, TrueNAS SCALE vault, or Proxmox homelab host to manage hard drives, OS features, and SMB network access for nodes.
                </p>
              </div>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingServerMachine(null)
                  setServerMachineModalOpen(true)
                }}
                className="gap-1.5 mt-2"
              >
                <Plus size={14} />
                <span>Add Your First Server Machine</span>
              </DkButton>
            </SettingsCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {serverMachines.map((machine) => {
                const isDetecting = detectingMachineId === machine.id
                const usedBytes = Math.max(0, machine.totalStorageBytes - machine.freeStorageBytes)
                const percentUsed =
                  machine.totalStorageBytes > 0
                    ? Math.min(100, Math.round((usedBytes / machine.totalStorageBytes) * 100))
                    : 0

                return (
                  <SettingsCard
                    key={machine.id}
                    tone="raised"
                    className="p-5 flex flex-col justify-between gap-4 transition-all duration-200"
                  >
                    <div className="space-y-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3.5 min-w-0">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm shadow-primary/10">
                            <Server className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-foreground truncate" title={machine.name}>
                                {machine.name}
                              </h4>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-foreground/80 font-medium">
                                {getOSLabel(machine.os)}
                              </span>
                              {machine.homeName && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                                  {machine.homeName}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {machine.host || 'No IP / Hostname'}
                              {machine.osVersion ? ` • ${machine.osVersion}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <DkButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDetectDrivesForMachine(machine)}
                            disabled={isDetecting || (!machine.hostedNodeId && gameServers.length === 0)}
                            title="Auto-detect hard drives from node"
                            className="p-1.5 h-8 text-muted-foreground hover:text-foreground"
                          >
                            <RefreshCw size={13} className={cn(isDetecting && 'animate-spin text-primary')} />
                          </DkButton>
                          <DkButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingServerMachine(machine)
                              setServerMachineModalOpen(true)
                            }}
                            title="Edit server machine"
                            className="p-1.5 h-8 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil size={13} />
                          </DkButton>
                          <DkButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteMachine(machine)}
                            title="Delete server machine"
                            className="p-1.5 h-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 size={13} />
                          </DkButton>
                        </div>
                      </div>

                      {/* Hard Drive Storage Capacity Bar */}
                      {machine.totalStorageBytes > 0 && (
                        <div className="rounded-xl bg-black/20 p-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5 font-medium text-foreground/80">
                              <HardDrive size={13} className="text-primary" />
                              <span>{formatBytes(usedBytes)} used of {formatBytes(machine.totalStorageBytes)}</span>
                            </span>
                            <span className="font-semibold text-foreground/90">
                              {formatBytes(machine.freeStorageBytes)} free ({percentUsed}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-300"
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Machine Details / Relationships */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px] pt-1 border-t border-white/[0.04]">
                        {machine.hostedNodeName ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary font-medium">
                            <Cpu size={11} />
                            <span>Node running on server: {machine.hostedNodeName}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground">
                            No node hosted on this machine
                          </span>
                        )}

                        {machine.smbEnabled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                            <Network size={11} />
                            <span>SMB: /{machine.smbShareName || 'share'} ({machine.smbPort || 445})</span>
                            {machine.smbNodeIds?.length ? (
                              <span className="text-muted-foreground">
                                • {machine.smbNodeIds.length} client node(s)
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground">
                            SMB Disabled
                          </span>
                        )}

                        {machine.drivesConfig?.length ? (
                          <span className="text-muted-foreground ml-auto text-[10px]">
                            {machine.drivesConfig.length} drive volume(s)
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </SettingsCard>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HOMES */}
      {activeTab === 'homes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
            <div>
              <p className="text-sm font-semibold text-foreground">Household &amp; Homelab Environments</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Organize your nodes and server machines by physical home or network environment.
              </p>
            </div>
            <DkButton
              type="button"
              size="sm"
              variant="primary"
              onClick={() => {
                setEditingHome(null)
                setHomeModalOpen(true)
              }}
              className="gap-1.5 self-start sm:self-auto shrink-0"
            >
              <Plus size={14} />
              <span>New Home</span>
            </DkButton>
          </div>

          {loadingHomes ? (
            <SettingsCard className="p-12 text-center text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-primary" />
              Loading homes...
            </SettingsCard>
          ) : homes.length === 0 ? (
            <SettingsCard className="p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-3xl bg-primary/10 flex items-center justify-center text-primary shadow-inner shadow-primary/10">
                <HomeIcon size={28} />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-base font-bold text-foreground tracking-tight">No homes configured</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Create a home to group your Otix nodes, storage servers, and homelab machines under a single location.
                </p>
              </div>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingHome(null)
                  setHomeModalOpen(true)
                }}
                className="gap-1.5 mt-2"
              >
                <Plus size={14} />
                <span>Create Your First Home</span>
              </DkButton>
            </SettingsCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {homes.map((home) => (
                <SettingsCard
                  key={home.id}
                  tone="raised"
                  className="p-5 flex flex-col justify-between gap-4 transition-all duration-200"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm shadow-primary/10">
                          <HomeIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-foreground truncate" title={home.name}>
                              {home.name}
                            </h4>
                            {home.isDefault && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold uppercase tracking-wider">
                                Default Home
                              </span>
                            )}
                            {home.subnetCidr && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground font-mono">
                                {home.subnetCidr}
                              </span>
                            )}
                          </div>
                          {home.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {home.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <DkButton
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingHome(home)
                            setHomeModalOpen(true)
                          }}
                          title="Edit home"
                          className="p-1.5 h-8 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil size={13} />
                        </DkButton>
                        {!home.isDefault && (
                          <DkButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteHome(home)}
                            title="Delete home"
                            className="p-1.5 h-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 size={13} />
                          </DkButton>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-white/[0.04]">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-foreground/80 font-medium">
                        <Server size={11} className="text-primary" />
                        <span>{home.nodesCount ?? 0} node(s)</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-foreground/80 font-medium">
                        <HardDrive size={11} className="text-primary" />
                        <span>{home.serverMachinesCount ?? 0} server machine(s)</span>
                      </span>
                    </div>
                  </div>
                </SettingsCard>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )}
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
    </div>
  )
};

export { SettingsNodesPage as SettingsDesktopPage }

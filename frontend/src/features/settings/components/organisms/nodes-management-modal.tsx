import { useState } from 'react'
import {
  Server,
  HardDrive,
  Home as HomeIcon,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Cpu,
  Network,
  Sparkles,
  Loader2,
  Settings,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { formatBytes, cn } from '@/lib/utils'
import type { GameServer } from '@/features/downloads/types'
import {
  useGameServers,
  usePendingGameServers,
  useProbeGameServer,
  type ServerProbeResult,
} from '@/features/downloads/use-server-downloads'
import { CreateWorkerNodeModal } from './create-worker-node-modal'
import { EditWorkerNodeModal } from './edit-worker-node-modal'
import { NodeSettingsModal } from './node-settings-modal'
import { CreateServerMachineModal } from './create-server-machine-modal'
import { EditServerMachineModal } from './edit-server-machine-modal'
import { CreateHomeModal } from './create-home-modal'
import { EditHomeModal } from './edit-home-modal'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import { getOSLabel } from '../../utils/server-machines'
import { isLocalDesktopNode } from '../../local-desktop-node'
import { isProbeReachable, formatProbeLatency } from '../../utils/node-probe'
import {
  useUserHomes,
  useServerMachines,
  useAssignNodeHome,
  useDeleteServerMachine,
  useDetectServerDrives,
  useDeleteHome,
} from '../../hooks/use-server-machines'

interface NodesManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: 'nodes' | 'servers' | 'homes'
  onSelectNodeDetail?: (node: GameServer) => void
}

export const NodesManagementModal = ({
  open,
  onOpenChange,
  initialTab = 'nodes',
  onSelectNodeDetail,
}: NodesManagementModalProps) => {
  const { toast } = useToast()

  const { data: servers = [], isLoading: loadingNodes } = useGameServers()
  const { data: pendingNodes = [] } = usePendingGameServers({ enabled: open })
  const { data: homes = [], isLoading: loadingHomes } = useUserHomes()
  const { data: serverMachines = [], isLoading: loadingMachines } = useServerMachines()

  const probeServerMutation = useProbeGameServer()
  const assignHomeMutation = useAssignNodeHome()
  const deleteMachineMutation = useDeleteServerMachine()
  const detectDrivesMutation = useDetectServerDrives()
  const deleteHomeMutation = useDeleteHome()

  const [activeTab, setActiveTab] = useState<'nodes' | 'servers' | 'homes'>(initialTab)
  const [createNodeModalOpen, setCreateNodeModalOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<GameServer | null>(null)
  const [selectedNodeSettings, setSelectedNodeSettings] = useState<GameServer | null>(null)
  const [createServerMachineOpen, setCreateServerMachineOpen] = useState(false)
  const [editingServerMachine, setEditingServerMachine] = useState<UserServerMachine | null>(null)
  const [createHomeOpen, setCreateHomeOpen] = useState(false)
  const [editingHome, setEditingHome] = useState<UserHome | null>(null)
  const [probingServerId, setProbingServerId] = useState<number | null>(null)
  const [probeResults, setProbeResults] = useState<Record<number, ServerProbeResult>>({})
  const [detectingMachineId, setDetectingMachineId] = useState<number | null>(null)

  const defaultHome = homes.find((h) => h.isDefault) || homes[0]

  const unclaimedNodes = pendingNodes.filter(
    (p) =>
      !p.claimed &&
      Boolean(p.claimCode || p.localUrl) &&
      !servers.some((s) => s.localUrl === p.localUrl || s.primaryUrl === p.localUrl),
  )

  const handleProbe = async (server: GameServer) => {
    setProbingServerId(server.id)
    try {
      const res = await probeServerMutation.mutateAsync(server.id)
      setProbeResults((prev) => ({ ...prev, [server.id]: res }))
      const reachable = isProbeReachable(res)
      toast({
        title: reachable ? 'Node Reachable' : 'Node Unreachable',
        description:
          res.message ||
          (reachable
            ? `Connected in ${formatProbeLatency(res)}.`
            : 'Node is offline or unreachable.'),
        variant: reachable ? 'success' : 'error',
      })
    } catch {
      toast({
        title: 'Probe Failed',
        description: 'Could not contact the node probe endpoint.',
        variant: 'error',
      })
    } finally {
      setProbingServerId(null)
    }
  }

  const handleAssignNodeHome = async (nodeId: number, homeId: number | null) => {
    try {
      await assignHomeMutation.mutateAsync({ nodeId, homeId })
      toast({
        title: 'Home Assigned',
        description: 'Updated node home location.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to assign node to home.',
        variant: 'error',
      })
    }
  }

  const handleDeleteMachine = async (machine: UserServerMachine) => {
    try {
      await deleteMachineMutation.mutateAsync(machine.id)
      toast({
        title: 'Server Machine Removed',
        description: `Removed ${machine.name} from your homelab.`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to remove server machine.',
        variant: 'error',
      })
    }
  }

  const handleDetectDrivesForMachine = async (machine: UserServerMachine) => {
    setDetectingMachineId(machine.id)
    try {
      const res = await detectDrivesMutation.mutateAsync({
        serverId: machine.id,
        nodeId: machine.hostedNodeId ?? servers[0]?.id,
      })
      if (res.detectedDrives?.length) {
        toast({
          title: 'Hard Drives Detected',
          description: `Updated disk configuration with ${res.detectedDrives.length} volume(s).`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Detection Complete',
          description: 'No drives found from the node probe.',
          variant: 'info',
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Detection Failed',
        description: (err as { message?: string })?.message || 'Could not probe node drives.',
        variant: 'error',
      })
    } finally {
      setDetectingMachineId(null)
    }
  }

  const handleDeleteHome = async (home: UserHome) => {
    try {
      await deleteHomeMutation.mutateAsync(home.id)
      toast({
        title: 'Home Deleted',
        description: `Deleted ${home.name}.`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete home.',
        variant: 'error',
      })
    }
  }

  return (
    <>
      <DkDialog
        open={open}
        onOpenChange={onOpenChange}
        className="max-w-4xl max-h-[85vh] overflow-y-auto"
        title={
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold leading-tight text-foreground">
                  Nodes &amp; Homelab
                </h2>
                <p className="text-xs text-muted-foreground">
                  Manage worker nodes, homelab server machines, hard drive storage, and homes.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'nodes' && (
                <DkButton
                  size="sm"
                  variant="primary"
                  onClick={() => setCreateNodeModalOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Connect Node
                </DkButton>
              )}
              {activeTab === 'servers' && (
                <DkButton
                  size="sm"
                  variant="primary"
                  onClick={() => setCreateServerMachineOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Server Machine
                </DkButton>
              )}
              {activeTab === 'homes' && (
                <DkButton
                  size="sm"
                  variant="primary"
                  onClick={() => setCreateHomeOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Home
                </DkButton>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-6 pt-4">
          {/* Main Navigation Tabs */}
          <div className="flex gap-2 rounded-2xl bg-[var(--dk-surface-ghost)] p-1.5 border border-[var(--dk-separator)]">
            <button
              type="button"
              onClick={() => setActiveTab('nodes')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all',
                activeTab === 'nodes'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
              )}
            >
              <Cpu className="h-4 w-4" />
              <span>Nodes ({servers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('servers')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all',
                activeTab === 'servers'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
              )}
            >
              <Server className="h-4 w-4" />
              <span>Server Machines ({serverMachines.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('homes')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all',
                activeTab === 'homes'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
              )}
            >
              <HomeIcon className="h-4 w-4" />
              <span>Homes ({homes.length})</span>
            </button>
          </div>

          {/* TAB 1: NODES */}
          {activeTab === 'nodes' && (
            <div className="space-y-4">
              {/* Unclaimed Nodes Notice */}
              {unclaimedNodes.length > 0 && (
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {unclaimedNodes.length} Unclaimed Node(s) Detected
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        PINs found on your local network ready for 1-click account pairing.
                      </p>
                    </div>
                  </div>
                  <DkButton
                    size="sm"
                    variant="primary"
                    onClick={() => setCreateNodeModalOpen(true)}
                  >
                    Claim Node
                  </DkButton>
                </div>
              )}

              {loadingNodes ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading nodes...
                </div>
              ) : servers.length === 0 ? (
                <div className="rounded-2xl p-8 text-center bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]">
                  <Server className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">No nodes connected</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Install or start an Otix Node daemon on your PC, NAS (Unraid, TrueNAS),
                    or server to manage games, cloud saves, and downloaders.
                  </p>
                  <DkButton
                    size="sm"
                    variant="primary"
                    className="mt-4 gap-1.5"
                    onClick={() => setCreateNodeModalOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Connect Your First Node
                  </DkButton>
                </div>
              ) : (
                <div className="space-y-3">
                  {servers.map((node) => {
                    const isLocal = isLocalDesktopNode(node)
                    const isProbing = probingServerId === node.id
                    const probeResult = probeResults[node.id]

                    // Find if hosted on a server machine
                    const hostedMachine = serverMachines.find((m) => m.hostedNodeId === node.id)
                    // Find if communicating with server machines via SMB
                    const smbMachines = serverMachines.filter((m) => m.smbNodeIds?.includes(node.id))

                    return (
                      <div
                        key={node.id}
                        className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-[var(--dk-separator)] transition-all space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Cpu className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground truncate">
                                  {node.name}
                                </span>
                                <span
                                  className={cn(
                                    'text-[10px] px-2 py-0.5 rounded-full font-medium',
                                    node.isOnline
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : 'bg-[var(--dk-surface-field)] text-muted-foreground',
                                  )}
                                >
                                  {node.isOnline ? 'Online' : 'Offline'}
                                </span>
                                {isLocal && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                                    Local Desktop
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {node.primaryUrl || 'No URL configured'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                            <DkButton
                              size="sm"
                              variant="outline"
                              onClick={() => handleProbe(node)}
                              disabled={isProbing}
                              title="Test network reachability"
                              className="gap-1.5"
                            >
                              <RefreshCw className={cn('h-3.5 w-3.5', isProbing && 'animate-spin')} />
                              Probe
                            </DkButton>
                            <DkButton
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingNode(node)}
                              className="gap-1.5"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </DkButton>
                            <DkButton
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                if (onSelectNodeDetail) {
                                  onSelectNodeDetail(node)
                                } else {
                                  setSelectedNodeSettings(node)
                                }
                              }}
                              className="gap-1.5"
                            >
                              <Settings className="h-3.5 w-3.5" />
                              Configure
                            </DkButton>
                          </div>
                        </div>

                        {/* Node Relationships: Home, Hosted Machine, SMB Connections */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--dk-separator)] text-[11px]">
                          {/* Home assignment dropdown */}
                          <div className="flex items-center gap-1.5">
                            <HomeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Home:</span>
                            <select
                              value={node.homeId ?? ''}
                              onChange={(e) =>
                                handleAssignNodeHome(
                                  node.id,
                                  e.target.value ? Number(e.target.value) : null,
                                )
                              }
                              className="rounded-lg bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] px-2 py-1 text-foreground text-[11px] outline-none border border-[var(--dk-separator)]"
                            >
                              <option value="" className="bg-[var(--dk-surface-overlay)] text-foreground">
                                None (Unassigned)
                              </option>
                              {homes.map((h) => (
                                <option
                                  key={h.id}
                                  value={h.id}
                                  className="bg-[var(--dk-surface-overlay)] text-foreground"
                                >
                                  {h.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Hosted machine indicator */}
                          {hostedMachine && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--dk-surface-field)] text-muted-foreground border border-[var(--dk-separator)]">
                              <Server className="h-3 w-3 text-primary" />
                              <span>Hosted on: {hostedMachine.name}</span>
                              <span className="text-muted-foreground/70">({getOSLabel(hostedMachine.os)})</span>
                            </span>
                          )}

                          {/* SMB connections indicator */}
                          {smbMachines.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--dk-surface-field)] text-muted-foreground border border-[var(--dk-separator)]">
                              <Network className="h-3 w-3 text-emerald-400" />
                              <span>SMB link: {smbMachines.map((m) => m.name).join(', ')}</span>
                            </span>
                          )}

                          {probeResult && (
                            <span
                              className={cn(
                                'ml-auto text-[10px] font-medium tabular-nums',
                                isProbeReachable(probeResult) ? 'text-status-online' : 'text-status-offline',
                              )}
                            >
                              {isProbeReachable(probeResult)
                                ? formatProbeLatency(probeResult)
                                : 'Probe unreachable'}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SERVER MACHINES */}
          {activeTab === 'servers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]">
                <div>
                  <p className="text-xs font-semibold text-foreground">Homelab &amp; NAS Computers</p>
                  <p className="text-[11px] text-muted-foreground">
                    Physical and virtual servers running Unraid, TrueNAS, Ubuntu, Proxmox, and Windows Server.
                  </p>
                </div>
                <DkButton
                  size="sm"
                  variant="primary"
                  onClick={() => setCreateServerMachineOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Server Machine
                </DkButton>
              </div>

              {loadingMachines ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading servers...
                </div>
              ) : serverMachines.length === 0 ? (
                <div className="rounded-2xl p-8 text-center bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]">
                  <Server className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">No server machines added</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Add your Unraid tower, TrueNAS SCALE vault, or Proxmox homelab host to configure
                    hard drive storage, OS integration, and SMB network access for nodes.
                  </p>
                  <DkButton
                    size="sm"
                    variant="primary"
                    className="mt-4 gap-1.5"
                    onClick={() => setCreateServerMachineOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Your First Server Machine
                  </DkButton>
                </div>
              ) : (
                <div className="space-y-3">
                  {serverMachines.map((machine) => {
                    const isDetecting = detectingMachineId === machine.id
                    const usedBytes = Math.max(0, machine.totalStorageBytes - machine.freeStorageBytes)
                    const percentUsed =
                      machine.totalStorageBytes > 0
                        ? Math.min(100, Math.round((usedBytes / machine.totalStorageBytes) * 100))
                        : 0

                    return (
                      <div
                        key={machine.id}
                        className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-[var(--dk-separator)] transition-all space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Server className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground truncate">
                                  {machine.name}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--dk-surface-field)] text-foreground font-medium border border-[var(--dk-separator)]">
                                  {getOSLabel(machine.os)}
                                </span>
                                {machine.homeName && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                    {machine.homeName}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {machine.host || 'No IP configured'}
                                {machine.osVersion ? ` • ${machine.osVersion}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                            <DkButton
                              size="sm"
                              variant="outline"
                              onClick={() => handleDetectDrivesForMachine(machine)}
                              disabled={isDetecting || (!machine.hostedNodeId && servers.length === 0)}
                              title="Auto-detect drives from linked node"
                              className="gap-1.5"
                            >
                              <RefreshCw className={cn('h-3.5 w-3.5', isDetecting && 'animate-spin')} />
                              Detect Drives
                            </DkButton>
                            <DkButton
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditingServerMachine(machine)}
                              className="gap-1.5"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </DkButton>
                            <DkButton
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteMachine(machine)}
                              className="text-muted-foreground hover:text-destructive p-2"
                              title="Delete Server Machine"
                            >
                              <Trash2 className="h-4 w-4" />
                            </DkButton>
                          </div>
                        </div>

                        {/* Storage Capacity Bar */}
                        {machine.totalStorageBytes > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <HardDrive className="h-3 w-3 text-primary" />
                                <span>
                                  {formatBytes(usedBytes)} used of {formatBytes(machine.totalStorageBytes)}
                                </span>
                              </span>
                              <span>{formatBytes(machine.freeStorageBytes)} free ({percentUsed}%)</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-[var(--dk-surface-ghost)] overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all duration-300"
                                style={{ width: `${percentUsed}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Metadata Footer: Hosted Node & SMB */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--dk-separator)] text-[11px]">
                          {machine.hostedNodeName ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                              <Cpu className="h-3 w-3" />
                              <span>Hosted Node: {machine.hostedNodeName}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--dk-surface-field)] text-muted-foreground border border-[var(--dk-separator)]">
                              No node running directly on this host
                            </span>
                          )}

                          {machine.smbEnabled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary">
                              <Network className="h-3 w-3" />
                              <span>SMB: /{machine.smbShareName || 'share'} ({machine.smbPort || 445})</span>
                              {machine.smbNodeIds?.length ? (
                                <span className="text-muted-foreground">
                                  • {machine.smbNodeIds.length} connected node(s)
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--dk-surface-field)] text-muted-foreground border border-[var(--dk-separator)]">
                              SMB Disabled
                            </span>
                          )}

                          {machine.drivesConfig?.length ? (
                            <span className="text-muted-foreground ml-auto">
                              {machine.drivesConfig.length} drive volume(s)
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HOMES */}
          {activeTab === 'homes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]">
                <div>
                  <p className="text-xs font-semibold text-foreground">Household &amp; Homelab Environments</p>
                  <p className="text-[11px] text-muted-foreground">
                    Organize your instances, nodes, and servers across different physical or logical homes.
                  </p>
                </div>
                <DkButton
                  size="sm"
                  variant="primary"
                  onClick={() => setCreateHomeOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Home
                </DkButton>
              </div>

              {loadingHomes ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading homes...
                </div>
              ) : homes.length === 0 ? (
                <div className="rounded-2xl p-8 text-center bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]">
                  <HomeIcon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">No homes configured</p>
                  <DkButton
                    size="sm"
                    variant="primary"
                    className="mt-4 gap-1.5"
                    onClick={() => setCreateHomeOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create Default Home
                  </DkButton>
                </div>
              ) : (
                <div className="space-y-3">
                  {homes.map((h) => {
                    const assignedNodes = servers.filter((s) => s.homeId === h.id)
                    const assignedMachines = serverMachines.filter((m) => m.homeId === h.id)

                    return (
                      <div
                        key={h.id}
                        className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-[var(--dk-separator)] transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <HomeIcon className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">{h.name}</span>
                                {h.isDefault && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                                    Default
                                  </span>
                                )}
                              </div>
                              {h.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">{h.description}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <DkButton
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditingHome(h)}
                              className="gap-1.5"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </DkButton>
                            {!h.isDefault && (
                              <DkButton
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteHome(h)}
                                className="text-muted-foreground hover:text-destructive p-2"
                                title="Delete Home"
                              >
                                <Trash2 className="h-4 w-4" />
                              </DkButton>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground border-t border-[var(--dk-separator)]">
                          <span>{assignedNodes.length} Node(s)</span>
                          <span>•</span>
                          <span>{assignedMachines.length} Server Machine(s)</span>
                          {h.subnetCidr && (
                            <>
                              <span>•</span>
                              <span>Subnet: {h.subnetCidr}</span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </DkDialog>

      {/* Child Modals */}
      <CreateWorkerNodeModal
        open={createNodeModalOpen}
        onOpenChange={setCreateNodeModalOpen}
      />

      <EditWorkerNodeModal
        open={Boolean(editingNode)}
        onOpenChange={(open) => {
          if (!open) setEditingNode(null)
        }}
        node={editingNode}
      />

      {selectedNodeSettings && (
        <NodeSettingsModal
          server={selectedNodeSettings}
          open={Boolean(selectedNodeSettings)}
          onOpenChange={(open) => {
            if (!open) setSelectedNodeSettings(null)
          }}
        />
      )}

      <CreateServerMachineModal
        open={createServerMachineOpen}
        onOpenChange={setCreateServerMachineOpen}
        homes={homes}
        nodes={servers}
        defaultHomeId={defaultHome?.id}
      />

      <EditServerMachineModal
        open={Boolean(editingServerMachine)}
        onOpenChange={(open) => {
          if (!open) setEditingServerMachine(null)
        }}
        server={editingServerMachine}
        homes={homes}
        nodes={servers}
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
    </>
  )
};

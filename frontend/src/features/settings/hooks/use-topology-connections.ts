import { useState, useMemo } from 'react'
import { useToast } from '@ui/molecules/toast'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import { useUpdateGameServer } from '@/features/gameservers/queries/gameservers-queries'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type {
  NodeMapConnectPrompt,
  NodeMapEdge,
  NodeMapItem,
  SambaShareConfig,
} from '../types/node-map'
import {
  buildNodeMapGraph,
  isCompatibleConnection,
} from '../utils/node-map'
import {
  useAssignNodeHome,
  useUpdateServerMachine,
} from './use-server-machines'
import {
  isNodeMapItemMatch,
  type NodesCategoryFilter,
  type NodesStatusFilter,
} from '../utils/node-views'

export interface UseTopologyConnectionsOptions {
  homes: UserHome[]
  serverMachines: UserServerMachine[]
  nodes: GameServer[]
  gameServers?: DedicatedGameServer[]
  pendingNodes?: PendingNode[]
  customSambaShares?: SambaShareConfig[]
  onSaveCustomSamba?: (samba: SambaShareConfig) => void
  externalSearchQuery?: string
  categoryFilter?: NodesCategoryFilter
  statusFilter?: NodesStatusFilter
}

export const useTopologyConnections = ({
  homes,
  serverMachines,
  nodes,
  gameServers = [],
  pendingNodes = [],
  customSambaShares = [],
  onSaveCustomSamba,
  externalSearchQuery,
  categoryFilter = 'all',
  statusFilter = 'all',
}: UseTopologyConnectionsOptions) => {
  const { toast } = useToast()
  const assignHomeMutation = useAssignNodeHome()
  const updateServerMutation = useUpdateServerMachine()
  const updateGameServerMutation = useUpdateGameServer()

  const [connectPickerItem, setConnectPickerItem] = useState<NodeMapItem | null>(null)
  const [connectPrompt, setConnectPrompt] = useState<NodeMapConnectPrompt | null>(null)
  const [isConnectingPending, setIsConnectingPending] = useState(false)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)

  const { items, edges } = useMemo(
    () => buildNodeMapGraph(homes, serverMachines, nodes, pendingNodes, customSambaShares, gameServers),
    [homes, serverMachines, nodes, pendingNodes, customSambaShares, gameServers],
  )

  const executeConnection = async (
    source: NodeMapItem,
    target: NodeMapItem,
    type: 'home' | 'host' | 'smb' | 'game_server',
  ) => {
    setIsConnectingPending(true)
    try {
      if (type === 'home') {
        const homeItem = source.type === 'home' ? source : target.type === 'home' ? target : null
        const otherItem = source.type === 'home' ? target : target.type === 'home' ? source : null

        if (homeItem && otherItem) {
          const homeId = Number(homeItem.entityId)
          if (otherItem.type === 'server') {
            await updateServerMutation.mutateAsync({ id: Number(otherItem.entityId), homeId })
            toast({
              title: 'Server Assigned',
              description: `"${otherItem.name}" assigned to home "${homeItem.name}".`,
            })
          } else if (otherItem.type === 'node') {
            await assignHomeMutation.mutateAsync({ nodeId: Number(otherItem.entityId), homeId })
            toast({
              title: 'Node Assigned',
              description: `"${otherItem.name}" assigned to home "${homeItem.name}".`,
            })
          }
        } else {
          const defaultHome = homes.find((h) => h.isDefault) || homes[0]
          if (defaultHome) {
            if (source.type === 'node') await assignHomeMutation.mutateAsync({ nodeId: Number(source.entityId), homeId: defaultHome.id })
            if (source.type === 'server') await updateServerMutation.mutateAsync({ id: Number(source.entityId), homeId: defaultHome.id })
            if (target.type === 'node') await assignHomeMutation.mutateAsync({ nodeId: Number(target.entityId), homeId: defaultHome.id })
            if (target.type === 'server') await updateServerMutation.mutateAsync({ id: Number(target.entityId), homeId: defaultHome.id })
            toast({
              title: 'Linked via Home',
              description: `"${source.name}" and "${target.name}" linked under "${defaultHome.name}".`,
            })
          } else {
            toast({
              title: 'Home Environment Required',
              description: 'Create a Home Environment first to link peer instances together.',
              variant: 'destructive',
            })
          }
        }
      } else if (type === 'host') {
        const gameServerItem =
          source.type === 'game_server' ? source : target.type === 'game_server' ? target : null
        const serverItem =
          source.type === 'server' ? source : target.type === 'server' ? target : null
        const nodeItem =
          source.type === 'node' ? source : target.type === 'node' ? target : null

        if (gameServerItem && serverItem) {
          const gsId = Number(gameServerItem.entityId)
          const machineId = Number(serverItem.entityId)
          const machine = serverMachines.find((m) => m.id === machineId)
          const machineHost = machine?.host
          const existingGs = gameServers.find((s) => s.id === gsId)
          const shouldUpdateHost =
            machineHost &&
            (!existingGs?.host ||
              existingGs.host === 'localhost' ||
              existingGs.host === '127.0.0.1')

          await updateGameServerMutation.mutateAsync({
            id: gsId,
            payload: {
              serverMachineId: machineId,
              ...(shouldUpdateHost ? { host: machineHost } : {}),
            },
          })
          toast({
            title: 'Dedicated Game Server Hosted',
            description: `Game server "${gameServerItem.name}" is now hosted on "${serverItem.name}".`,
          })
        } else if (serverItem && nodeItem) {
          const serverId = Number(serverItem.entityId)
          const nodeId = Number(nodeItem.entityId)
          await updateServerMutation.mutateAsync({
            id: serverId,
            hostedNodeId: nodeId,
          })
          const parentServer = serverMachines.find((m) => m.id === serverId)
          toast({
            title: 'Hosted Node Configured',
            description: `Node "${nodeItem.name}" is now marked as running on "${serverItem.name}"${parentServer?.homeId ? ' and inherits its Home Environment.' : '.'}`,
          })
        }
      } else if (type === 'smb') {
        const sambaItem = source.type === 'samba' ? source : target.type === 'samba' ? target : null
        const serverItem = source.type === 'server' ? source : target.type === 'server' ? target : null
        const nodeItem = source.type === 'node' ? source : target.type === 'node' ? target : null

        if (sambaItem && serverItem) {
          const sambaConfig = (sambaItem.data as { samba: SambaShareConfig }).samba
          const serverId = Number(serverItem.entityId)
          const targetServer = serverMachines.find((m) => m.id === serverId)
          const existingShares = Array.isArray(targetServer?.smbShares) ? [...targetServer.smbShares] : []
          if (
            targetServer?.smbShareName &&
            !existingShares.some(
              (s) => s.shareName?.toLowerCase() === targetServer.smbShareName?.toLowerCase(),
            )
          ) {
            existingShares.unshift({
              id: `samba-server-${targetServer.id}`,
              serverId: targetServer.id,
              serverName: targetServer.name,
              shareName: targetServer.smbShareName,
              host: targetServer.smbHost || targetServer.host || '',
              port: targetServer.smbPort || 445,
              username: targetServer.smbUsername || '',
              password: targetServer.smbPassword || '',
              workgroup: targetServer.smbWorkgroup || 'WORKGROUP',
              mountPath: targetServer.smbMountPath || '',
              isOnline: targetServer.isOnline,
              nodeIds: targetServer.smbNodeIds || [],
            })
          }
          const updatedConfig: SambaShareConfig = {
            ...sambaConfig,
            serverId,
            serverName: targetServer?.name || null,
          }
          const existingIndex = existingShares.findIndex(
            (s) =>
              s.id === updatedConfig.id ||
              s.shareName?.toLowerCase() === updatedConfig.shareName?.toLowerCase(),
          )
          const nextShares =
            existingIndex >= 0
              ? existingShares.map((s, idx) => (idx === existingIndex ? updatedConfig : s))
              : [...existingShares, updatedConfig]

          await updateServerMutation.mutateAsync({
            id: serverId,
            smbEnabled: true,
            smbShareName: targetServer?.smbShareName || updatedConfig.shareName || 'games',
            smbHost: targetServer?.smbHost || updatedConfig.host || '',
            smbPort: targetServer?.smbPort || updatedConfig.port || 445,
            smbUsername: targetServer?.smbUsername || updatedConfig.username || '',
            smbPassword: targetServer?.smbPassword || updatedConfig.password || '',
            smbWorkgroup: targetServer?.smbWorkgroup || updatedConfig.workgroup || 'WORKGROUP',
            smbMountPath: targetServer?.smbMountPath || updatedConfig.mountPath || '',
            smbShares: nextShares,
          })
          onSaveCustomSamba?.(updatedConfig)
          toast({
            title: 'Samba Share Connected',
            description: `Samba share "${sambaItem.name}" connected to server "${serverItem.name}".`,
          })
        } else if (sambaItem && nodeItem) {
          const sambaConfig = (sambaItem.data as { samba: SambaShareConfig }).samba
          const targetNodeId = Number(nodeItem.entityId)
          if (sambaConfig.serverId) {
            const server = serverMachines.find((m) => m.id === sambaConfig.serverId)
            const currentSmbNodes = server?.smbNodeIds || []
            const nextSmbNodes = Array.from(new Set([...currentSmbNodes, targetNodeId]))
            await updateServerMutation.mutateAsync({
              id: sambaConfig.serverId,
              smbNodeIds: nextSmbNodes,
              smbEnabled: true,
            })
          } else if (onSaveCustomSamba) {
            const currentNodes = sambaConfig.nodeIds || []
            const nextNodes = Array.from(new Set([...currentNodes, targetNodeId]))
            onSaveCustomSamba({ ...sambaConfig, nodeIds: nextNodes })
          }
          toast({
            title: 'Samba Share Linked',
            description: `Node "${nodeItem.name}" now connected to Samba share "${sambaItem.name}".`,
          })
        } else if (serverItem && nodeItem) {
          const server = (serverItem.data as { machine: UserServerMachine }).machine
          const currentSmbNodes = server.smbNodeIds || []
          const nextSmbNodes = Array.from(new Set([...currentSmbNodes, Number(nodeItem.entityId)]))

          await updateServerMutation.mutateAsync({
            id: Number(serverItem.entityId),
            smbNodeIds: nextSmbNodes,
            smbEnabled: true,
          })
          toast({
            title: 'SMB Connection Established',
            description: `Node "${nodeItem.name}" linked to SMB share on "${serverItem.name}".`,
          })
        }
      }
    } catch {
      toast({
        title: 'Connection Failed',
        description: 'Could not establish connection between nodes.',
        variant: 'destructive',
      })
    } finally {
      setIsConnectingPending(false)
    }
  }

  const handleCardDropConnect = (source: NodeMapItem, target: NodeMapItem) => {
    const check = isCompatibleConnection(source, target)
    if (!check.compatible) {
      toast({
        title: 'Incompatible Connection',
        description: check.reason || 'These nodes cannot be linked directly.',
        variant: 'destructive',
      })
      return
    }

    if (check.connectionTypes.length === 1) {
      void executeConnection(source, target, check.connectionTypes[0])
      return
    }

    setConnectPrompt({
      source,
      target,
      allowedTypes: check.connectionTypes,
    })
  }

  const handleDisconnectEdge = async (edge: NodeMapEdge) => {
    try {
      if (edge.relation === 'home_link') {
        if (edge.targetType === 'server') {
          const serverId = Number(edge.targetId.replace('server-', ''))
          await updateServerMutation.mutateAsync({ id: serverId, homeId: null })
          toast({ title: 'Unlinked from Home' })
        } else if (edge.targetType === 'node') {
          const nodeId = Number(edge.targetId.replace('node-', ''))
          await assignHomeMutation.mutateAsync({ nodeId, homeId: null })
          toast({ title: 'Unlinked from Home' })
        }
      } else if (edge.relation === 'hosted_link') {
        const serverId = Number(edge.sourceId.replace('server-', ''))
        await updateServerMutation.mutateAsync({ id: serverId, hostedNodeId: null })
        toast({ title: 'Host Node Link Removed' })
      } else if (edge.relation === 'samba_server_link') {
        const serverId = Number(edge.sourceId.replace('server-', ''))
        const targetShareId = edge.targetId
        const machine = serverMachines.find((m) => m.id === serverId)
        if (machine) {
          const updatedShares = (machine.smbShares || []).filter((s) => s.id !== targetShareId)
          const remainingCount = updatedShares.length
          const isPrimary =
            machine.smbShareName &&
            (targetShareId === `samba-server-${serverId}` ||
              targetShareId.endsWith(machine.smbShareName))
          await updateServerMutation.mutateAsync({
            id: serverId,
            smbShares: updatedShares,
            ...(isPrimary
              ? {
                  smbShareName: updatedShares[0]?.shareName || '',
                  smbEnabled: remainingCount > 0,
                }
              : {}),
          })
        } else {
          await updateServerMutation.mutateAsync({ id: serverId, smbEnabled: false })
        }
        toast({ title: 'Samba Share Disconnected' })
      } else if (edge.relation === 'smb_link') {
        const nodeId = Number(edge.targetId.replace('node-', ''))
        if (edge.sourceId.startsWith('samba-server-')) {
          const serverId = Number(edge.sourceId.replace('samba-server-', ''))
          const machine = serverMachines.find((m) => m.id === serverId)
          if (machine) {
            const filtered = (machine.smbNodeIds || []).filter((id) => id !== nodeId)
            await updateServerMutation.mutateAsync({ id: serverId, smbNodeIds: filtered })
            toast({ title: 'SMB Link Removed' })
          }
        } else if (edge.sourceId.startsWith('server-')) {
          const serverId = Number(edge.sourceId.replace('server-', ''))
          const machine = serverMachines.find((m) => m.id === serverId)
          if (machine) {
            const filtered = (machine.smbNodeIds || []).filter((id) => id !== nodeId)
            await updateServerMutation.mutateAsync({ id: serverId, smbNodeIds: filtered })
            toast({ title: 'SMB Link Removed' })
          }
        } else {
          const samba = customSambaShares.find((s) => s.id === edge.sourceId)
          if (samba && onSaveCustomSamba) {
            const nextNodeIds = (samba.nodeIds || []).filter((id) => id !== nodeId)
            onSaveCustomSamba({ ...samba, nodeIds: nextNodeIds })
            toast({ title: 'SMB Link Removed' })
          }
        }
      }
    } catch {
      toast({ title: 'Disconnect failed', variant: 'destructive' })
    }
  }

  const getMatchingItemIds = (searchQuery: string) => {
    const effectiveQuery = (externalSearchQuery !== undefined ? externalSearchQuery : searchQuery).trim()
    const matches = new Set<string>()
    for (const item of items) {
      if (isNodeMapItemMatch(item, effectiveQuery, categoryFilter, statusFilter)) {
        matches.add(item.id)
      }
    }
    return matches
  }

  return {
    items,
    edges,
    connectPickerItem,
    setConnectPickerItem,
    connectPrompt,
    setConnectPrompt,
    isConnectingPending,
    hoveredEdgeId,
    setHoveredEdgeId,
    executeConnection,
    handleCardDropConnect,
    handleDisconnectEdge,
    getMatchingItemIds,
  }
}

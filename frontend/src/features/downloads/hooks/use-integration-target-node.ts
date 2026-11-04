import type { OtixNode } from '../types'
import { useGameServers, useNodes } from '@/features/downloads/use-server-downloads'

/** Otix nodes that run services and downloaders. */
export function remoteConnectionNodes(nodes: OtixNode[]): OtixNode[] {
  return nodes.filter(
    (node) =>
      Number(node.id) > 0 &&
      !node.primaryUrl?.startsWith('otix://') &&
      !node.localUrl?.startsWith('otix://'),
  )
}

/** Worker machines. */
export function workerConnectionNodes(nodes: OtixNode[]): OtixNode[] {
  return remoteConnectionNodes(nodes)
}

export function pickConnectionNode(nodes: OtixNode[], preferredId?: number): OtixNode | undefined {
  if (preferredId != null && Number(preferredId) > 0) {
    const match = nodes.find((node) => Number(node.id) === Number(preferredId))
    if (match) return match
  }
  const remotes = remoteConnectionNodes(nodes)
  return (
    remotes.find((node) => node.isOnline) ||
    remotes[0] ||
    nodes.find((node) => Number(node.id) > 0 && node.isOnline && !node.primaryUrl?.startsWith('otix://')) ||
    nodes.find((node) => Number(node.id) > 0 && !node.primaryUrl?.startsWith('otix://')) ||
    nodes[0]
  )
}

export function connectionSyncLabel(nodes: OtixNode[], targetName?: string): string {
  const remotes = remoteConnectionNodes(nodes)
  const name = targetName || remotes[0]?.name
  if (name) return `On ${name}`
  return 'Select an Otix node'
}

export function useIntegrationTargetNode(nodeId?: number, nodeName?: string) {
  const fetcher = typeof useGameServers === 'function' ? useGameServers : useNodes
  const { data: nodes = [] } = fetcher()
  const effectiveNode =
    (nodeId != null && Number(nodeId) > 0 ? nodes.find((n) => Number(n.id) === Number(nodeId)) : undefined) ||
    pickConnectionNode(nodes, nodeId) ||
    (nodeId != null && Number(nodeId) > 0 ? { id: nodeId, name: nodeName } : undefined)
  const targetNodeId = effectiveNode?.id ?? (nodeId != null && Number(nodeId) > 0 ? nodeId : undefined)
  const targetNodeName = effectiveNode?.name || nodeName || 'Otix node'
  return {
    targetNodeId,
    targetNodeName,
    targetServerId: targetNodeId,
    targetServerName: targetNodeName,
    nodes,
    servers: nodes,
    remoteNodes: remoteConnectionNodes(nodes),
    remoteServers: remoteConnectionNodes(nodes),
    syncLabel: connectionSyncLabel(nodes, targetNodeName),
  }
}

export const useIntegrationTargetServer = useIntegrationTargetNode;

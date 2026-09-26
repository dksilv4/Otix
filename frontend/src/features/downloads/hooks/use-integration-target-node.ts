import { isBackendNode } from '@/features/settings/backend-node'
import { isLocalDesktopNode } from '@/features/settings/local-desktop-node'
import type { OtixNode } from '../types'
import { useGameServers, useNodes } from '@/features/downloads/use-server-downloads'

/** Nodes that can store SABnzbd / *arr settings (workers + the Otix backend). */
export function remoteConnectionNodes(nodes: OtixNode[]): OtixNode[] {
  return nodes.filter((node) => !isLocalDesktopNode(node))
}

/** Worker machines only — Epic tokens and live downloaders do not run on the backend node. */
export function workerConnectionNodes(nodes: OtixNode[]): OtixNode[] {
  return remoteConnectionNodes(nodes).filter(
    (node) => !isBackendNode(node) && Number(node.id) > 0,
  )
}

export function pickConnectionNode(nodes: OtixNode[], preferredId?: number): OtixNode | undefined {
  const remotes = remoteConnectionNodes(nodes)
  const workers = workerConnectionNodes(nodes)
  return (
    remotes.find((node) => node.id === preferredId) ||
    workers.find((node) => node.isOnline) ||
    workers[0] ||
    remotes.find((node) => isBackendNode(node)) ||
    remotes[0]
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
  const effectiveNode = pickConnectionNode(nodes, nodeId) || (
    nodeId != null && !isLocalDesktopNode({ id: nodeId })
      ? { id: nodeId, name: nodeName }
      : undefined
  )
  const targetNodeId =
    effectiveNode?.id ??
    (nodeId != null && !isLocalDesktopNode({ id: nodeId }) ? nodeId : undefined)
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

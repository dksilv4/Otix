import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as serverDownloads from '@/features/downloads/use-server-downloads'
import type { GameServer } from '@/features/downloads/types'
import { isLocalDesktopNode, mergeLocalDesktopNode, pickSettingsNode, syncServersWithPendingNodes } from '../local-desktop-node'
import { nodeUrlKey, type PendingNode } from '@/features/downloads/pending-nodes'

function resolveUsePending(): (options?: { enabled?: boolean }) => { data?: PendingNode[] } {
  try {
    const fn = (serverDownloads as Record<string, unknown>)['usePendingGameServers']
    if (typeof fn === 'function') return fn as (options?: { enabled?: boolean }) => { data?: PendingNode[] }
  } catch {
    // Vitest throws on missing mock export
  }
  return () => ({ data: [] })
}

function resolveUseUpdate(): () => { mutate: (args: { id: number; name: string }) => void } {
  try {
    const fn = (serverDownloads as Record<string, unknown>)['useUpdateGameServer']
    if (typeof fn === 'function') return fn as () => { mutate: (args: { id: number; name: string }) => void }
  } catch {
    // Vitest throws on missing mock export
  }
  return () => ({ mutate: () => {} })
}

const usePendingGameServers = resolveUsePending()
const useUpdateGameServer = resolveUseUpdate()
const useGameServers = serverDownloads.useGameServers

export const SETTINGS_SELECTED_NODE_KEY = 'otix:settings-selected-node'

export interface SettingsNodeValue {
  servers: GameServer[]
  selectedNode: GameServer | null
  selectedNodeId: number | null
  setSelectedNodeId: (id: number | null) => void
  isLoading: boolean
}

const SettingsNodeContext = createContext<SettingsNodeValue | null>(null)

function readStoredNodeId(): number | null {
  try {
    const raw = localStorage.getItem(SETTINGS_SELECTED_NODE_KEY)
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

export function SettingsNodeProvider({
  children,
  enabled = true,
}: {
  children: ReactNode
  enabled?: boolean
}) {
  const { data: remoteServers = [], isLoading } = useGameServers({
    enabled,
    refetchInterval: enabled ? 10_000 : false,
  })
  const { data: pendingNodes = [] } = usePendingGameServers({ enabled })
  const updateServerMutation = useUpdateGameServer()

  const servers = useMemo(
    () => syncServersWithPendingNodes(mergeLocalDesktopNode(remoteServers), pendingNodes),
    [remoteServers, pendingNodes],
  )
  const [preferredId, setPreferredId] = useState<number | null>(readStoredNodeId)

  const selectedNode = useMemo(() => pickSettingsNode(servers, preferredId), [servers, preferredId])

  const attemptedRenamesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const server of remoteServers) {
      if (isLocalDesktopNode(server)) continue
      const match = pendingNodes.find(
        (p) =>
          (p.authToken && server.authToken && p.authToken === server.authToken) ||
          (p.localUrl && server.localUrl && nodeUrlKey(p.localUrl) === nodeUrlKey(server.localUrl)) ||
          (p.localUrl && server.primaryUrl && nodeUrlKey(p.localUrl) === nodeUrlKey(server.primaryUrl)),
      )
      if (
        match?.serverName &&
        match.serverName !== 'Otix Game Server' &&
        match.serverName !== 'Otix Node' &&
        !match.serverName.startsWith('Node ID:') &&
        match.serverName !== server.name
      ) {
        const renameKey = `${server.id}:${match.serverName}`
        if (!attemptedRenamesRef.current.has(renameKey)) {
          attemptedRenamesRef.current.add(renameKey)
          updateServerMutation.mutate({ id: server.id, name: match.serverName })
        }
      }
    }
  }, [remoteServers, pendingNodes, updateServerMutation])

  useEffect(() => {
    if (!selectedNode) return
    try {
      localStorage.setItem(SETTINGS_SELECTED_NODE_KEY, String(selectedNode.id))
    } catch {
      // ignore
    }
  }, [selectedNode])

  const setSelectedNodeId = useCallback((id: number | null) => {
    setPreferredId(id)
    try {
      if (id == null) localStorage.removeItem(SETTINGS_SELECTED_NODE_KEY)
      else localStorage.setItem(SETTINGS_SELECTED_NODE_KEY, String(id))
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo<SettingsNodeValue>(
    () => ({
      servers,
      selectedNode,
      selectedNodeId: selectedNode?.id ?? null,
      setSelectedNodeId,
      isLoading,
    }),
    [servers, selectedNode, setSelectedNodeId, isLoading],
  )

  return createElement(SettingsNodeContext.Provider, { value }, children)
}

export function useSettingsNode(): SettingsNodeValue {
  const ctx = useContext(SettingsNodeContext)
  const { data: remoteServers = [], isLoading } = useGameServers({ refetchInterval: 10_000 })
  const { data: pendingNodes = [] } = usePendingGameServers()
  const servers = useMemo(
    () => syncServersWithPendingNodes(mergeLocalDesktopNode(remoteServers), pendingNodes),
    [remoteServers, pendingNodes],
  )
  const [preferredId, setPreferredId] = useState<number | null>(readStoredNodeId)

  const selectedNode = useMemo(() => pickSettingsNode(servers, preferredId), [servers, preferredId])

  const setSelectedNodeId = useCallback((id: number | null) => {
    setPreferredId(id)
    try {
      if (id == null) localStorage.removeItem(SETTINGS_SELECTED_NODE_KEY)
      else localStorage.setItem(SETTINGS_SELECTED_NODE_KEY, String(id))
    } catch {
      // ignore
    }
  }, [])

  if (ctx) return ctx

  return {
    servers,
    selectedNode,
    selectedNodeId: selectedNode?.id ?? null,
    setSelectedNodeId,
    isLoading,
  }
}


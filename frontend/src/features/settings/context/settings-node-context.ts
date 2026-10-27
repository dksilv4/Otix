import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as serverDownloads from '@/features/downloads/use-server-downloads'
import type { GameServer } from '@/features/downloads/types'
import { LOCAL_DESKTOP_NODE_ID, isLocalDesktopNode, mergeLocalDesktopNode, pickSettingsNode, syncServersWithPendingNodes } from '../local-desktop-node'
import { nodeUrlKey, type PendingNode } from '@/features/downloads/pending-nodes'
import { useCompanionNode } from '../hooks/use-companion-node'
import { queryClient } from '@/lib/query/client'

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
  pendingNodes?: PendingNode[]
  companionNode?: ReturnType<typeof useCompanionNode>
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

export const SettingsNodeProvider = ({
  children,
  enabled = true,
}: {
  children: ReactNode
  enabled?: boolean
}) => {
  // Automatically discover and claim companion nodes
  if (typeof serverDownloads.useAutoClaimPendingServers === 'function') {
    serverDownloads.useAutoClaimPendingServers(enabled)
  }

  const companion = useCompanionNode({ autoPair: enabled })

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

  // When a node is newly claimed, automatically switch to it if currently on default/fallback
  useEffect(() => {
    const handleNodeClaimed = (e: Event) => {
      const custom = e as CustomEvent
      const results = custom.detail
      if (Array.isArray(results) && results.length > 0) {
        const first = results[0]
        if (first?.id != null) {
          setPreferredId(Number(first.id))
        }
      }
    }
    window.addEventListener('node-claimed', handleNodeClaimed)
    return () => window.removeEventListener('node-claimed', handleNodeClaimed)
  }, [])

  // Immediately recognize and switch to the local companion node when daemon becomes running
  const lastAutoSwitchedIdRef = useRef<number | null>(null)
  const prevRunningRef = useRef(false)

  useEffect(() => {
    if (companion.isRunning && !prevRunningRef.current) {
      lastAutoSwitchedIdRef.current = null
    }
    prevRunningRef.current = companion.isRunning

    if (!companion.isRunning) return

    const claimedCompanion = servers.find(
      (s) =>
        s.id !== LOCAL_DESKTOP_NODE_ID &&
        (isLocalDesktopNode(s) ||
          (companion.port &&
            ((s.localUrl && s.localUrl.includes(`:${companion.port}`)) ||
              (s.primaryUrl && s.primaryUrl.includes(`:${companion.port}`))))),
    )
    const targetCompanion = claimedCompanion ?? servers.find((s) => isLocalDesktopNode(s))

    if (!targetCompanion) return

    const shouldSwitch =
      lastAutoSwitchedIdRef.current === null ||
      (lastAutoSwitchedIdRef.current === LOCAL_DESKTOP_NODE_ID && targetCompanion.id !== LOCAL_DESKTOP_NODE_ID)

    if (shouldSwitch) {
      lastAutoSwitchedIdRef.current = targetCompanion.id
      setPreferredId(targetCompanion.id)
    }
  }, [companion.isRunning, companion.port, servers])

  // Listen to companion lifecycle events to immediately switch active server without waiting 15s
  useEffect(() => {
    const handleCompanionEvent = (e: Event) => {
      const custom = e as CustomEvent
      const detail = custom?.detail
      const port = detail?.port

      try {
        queryClient.invalidateQueries({ queryKey: ['nodes'] })
        queryClient.invalidateQueries({ queryKey: ['game-servers'] })
      } catch {
        // ignore
      }

      const claimed = servers.find(
        (s) =>
          s.id !== LOCAL_DESKTOP_NODE_ID &&
          (isLocalDesktopNode(s) ||
            (port &&
              ((s.localUrl && s.localUrl.includes(`:${port}`)) ||
                (s.primaryUrl && s.primaryUrl.includes(`:${port}`))))),
      )
      const target = claimed ?? servers.find((s) => isLocalDesktopNode(s))
      if (target) {
        setPreferredId(target.id)
      }
    }

    window.addEventListener('companion-node-running', handleCompanionEvent)
    window.addEventListener('companion-node-ready', handleCompanionEvent)
    return () => {
      window.removeEventListener('companion-node-running', handleCompanionEvent)
      window.removeEventListener('companion-node-ready', handleCompanionEvent)
    }
  }, [servers])

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
      pendingNodes,
      companionNode: companion,
    }),
    [servers, selectedNode, setSelectedNodeId, isLoading, pendingNodes, companion],
  )

  return createElement(SettingsNodeContext.Provider, { value }, children)
}

export const useSettingsNode = (): SettingsNodeValue => {
  const ctx = useContext(SettingsNodeContext)
  const companion = useCompanionNode()
  const { data: remoteServers = [], isLoading } = useGameServers({ refetchInterval: 10_000 })
  const { data: pendingNodes = [] } = usePendingGameServers()
  const servers = useMemo(
    () => syncServersWithPendingNodes(mergeLocalDesktopNode(remoteServers), pendingNodes),
    [remoteServers, pendingNodes],
  )
  const [preferredId, setPreferredId] = useState<number | null>(readStoredNodeId)

  // Auto-switch in hook fallback mode when outside SettingsNodeProvider
  const lastAutoSwitchedIdRef = useRef<number | null>(null)
  const prevRunningRef = useRef(false)

  useEffect(() => {
    if (ctx) return
    if (companion.isRunning && !prevRunningRef.current) {
      lastAutoSwitchedIdRef.current = null
    }
    prevRunningRef.current = companion.isRunning

    if (!companion.isRunning) return

    const claimedCompanion = servers.find(
      (s) =>
        s.id !== LOCAL_DESKTOP_NODE_ID &&
        (isLocalDesktopNode(s) ||
          (companion.port &&
            ((s.localUrl && s.localUrl.includes(`:${companion.port}`)) ||
              (s.primaryUrl && s.primaryUrl.includes(`:${companion.port}`))))),
    )
    const targetCompanion = claimedCompanion ?? servers.find((s) => isLocalDesktopNode(s))

    if (!targetCompanion) return

    const shouldSwitch =
      lastAutoSwitchedIdRef.current === null ||
      (lastAutoSwitchedIdRef.current === LOCAL_DESKTOP_NODE_ID && targetCompanion.id !== LOCAL_DESKTOP_NODE_ID)

    if (shouldSwitch) {
      lastAutoSwitchedIdRef.current = targetCompanion.id
      setPreferredId(targetCompanion.id)
    }
  }, [ctx, companion.isRunning, companion.port, servers])

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
    pendingNodes,
    companionNode: companion,
  }
}



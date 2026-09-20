import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import type { GameServer } from '@/features/downloads/types'
import { mergeBackendNode } from '../backend-node'
import { mergeLocalDesktopNode, pickSettingsNode } from '../local-desktop-node'

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

export function SettingsNodeProvider({ children }: { children: ReactNode }) {
  const { data: remoteServers = [], isLoading } = useGameServers()
  const servers = useMemo(
    () => mergeLocalDesktopNode(mergeBackendNode(remoteServers)),
    [remoteServers],
  )
  const [preferredId, setPreferredId] = useState<number | null>(readStoredNodeId)

  const selectedNode = useMemo(() => pickSettingsNode(servers, preferredId), [servers, preferredId])

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

  return <SettingsNodeContext.Provider value={value}>{children}</SettingsNodeContext.Provider>
}

export function useSettingsNode(): SettingsNodeValue {
  const ctx = useContext(SettingsNodeContext)
  const { data: remoteServers = [], isLoading } = useGameServers()
  const servers = useMemo(
    () => mergeLocalDesktopNode(mergeBackendNode(remoteServers)),
    [remoteServers],
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

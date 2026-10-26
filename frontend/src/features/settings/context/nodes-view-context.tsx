import { createContext, useContext, useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
import {
  type NodesViewMode,
  type NodesActiveTab,
  type NodesCategoryFilter,
  type NodesStatusFilter,
  loadStoredNodesViewMode,
  saveStoredNodesViewMode,
  loadStoredNodesActiveTab,
  saveStoredNodesActiveTab,
  resolveNodesActiveTabFromHash,
} from '../utils/node-views'

export interface NodesViewContextValue {
  viewMode: NodesViewMode
  setViewMode: (mode: NodesViewMode) => void
  activeTab: NodesActiveTab
  setActiveTab: (tab: NodesActiveTab) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  categoryFilter: NodesCategoryFilter
  setCategoryFilter: (category: NodesCategoryFilter) => void
  statusFilter: NodesStatusFilter
  setStatusFilter: (status: NodesStatusFilter) => void
  resetFilters: () => void
  addModalOpen: boolean
  setAddModalOpen: (open: boolean) => void
  totalCount: number
  setTotalCount: (count: number) => void
  onlineCount: number
  setOnlineCount: (count: number) => void
}

const NodesViewContext = createContext<NodesViewContextValue | null>(null)

export interface NodesViewProviderProps {
  children: ReactNode
}

export const NodesViewProvider = ({ children }: NodesViewProviderProps) => {
  const [viewMode, setViewModeState] = useState<NodesViewMode>(loadStoredNodesViewMode)
  const [activeTab, setActiveTabState] = useState<NodesActiveTab>(loadStoredNodesActiveTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<NodesCategoryFilter>('all')
  const [statusFilter, setStatusFilter] = useState<NodesStatusFilter>('all')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [onlineCount, setOnlineCount] = useState(0)

  const setViewMode = (mode: NodesViewMode) => {
    setViewModeState(mode)
    saveStoredNodesViewMode(mode)
  }

  const setActiveTab = useCallback((tab: NodesActiveTab) => {
    setActiveTabState(tab)
    saveStoredNodesActiveTab(tab)
    if (typeof window !== 'undefined') {
      const nextHash = tab === 'infrastructure' ? '' : `#${tab}`
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash || window.location.pathname)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleHashChange = () => {
      const parsed = resolveNodesActiveTabFromHash(window.location.hash)
      if (parsed) {
        setActiveTabState(parsed)
      } else if (
        !window.location.hash ||
        window.location.hash === '#' ||
        window.location.hash === '#map' ||
        window.location.hash === '#grid' ||
        window.location.hash === '#list'
      ) {
        setActiveTabState('infrastructure')
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const resetFilters = () => {
    setSearchQuery('')
    setCategoryFilter('all')
    setStatusFilter('all')
  }

  const value = useMemo<NodesViewContextValue>(
    () => ({
      viewMode,
      setViewMode,
      activeTab,
      setActiveTab,
      searchQuery,
      setSearchQuery,
      categoryFilter,
      setCategoryFilter,
      statusFilter,
      setStatusFilter,
      resetFilters,
      addModalOpen,
      setAddModalOpen,
      totalCount,
      setTotalCount,
      onlineCount,
      setOnlineCount,
    }),
    [
      viewMode,
      activeTab,
      setActiveTab,
      searchQuery,
      categoryFilter,
      statusFilter,
      addModalOpen,
      totalCount,
      onlineCount,
    ],
  )

  return <NodesViewContext.Provider value={value}>{children}</NodesViewContext.Provider>
}

const defaultFallbackValue: NodesViewContextValue = {
  viewMode: 'map',
  setViewMode: () => {},
  activeTab: 'infrastructure',
  setActiveTab: () => {},
  searchQuery: '',
  setSearchQuery: () => {},
  categoryFilter: 'all',
  setCategoryFilter: () => {},
  statusFilter: 'all',
  setStatusFilter: () => {},
  resetFilters: () => {},
  addModalOpen: false,
  setAddModalOpen: () => {},
  totalCount: 0,
  setTotalCount: () => {},
  onlineCount: 0,
  setOnlineCount: () => {},
}

export const useNodesView = (): NodesViewContextValue => {
  const ctx = useContext(NodesViewContext)
  return ctx || defaultFallbackValue
}

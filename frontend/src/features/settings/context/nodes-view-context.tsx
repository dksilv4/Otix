import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import {
  type NodesViewMode,
  type NodesCategoryFilter,
  type NodesStatusFilter,
  loadStoredNodesViewMode,
  saveStoredNodesViewMode,
} from '../utils/node-views'

export interface NodesViewContextValue {
  viewMode: NodesViewMode
  setViewMode: (mode: NodesViewMode) => void
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

  const resetFilters = () => {
    setSearchQuery('')
    setCategoryFilter('all')
    setStatusFilter('all')
  }

  const value = useMemo<NodesViewContextValue>(
    () => ({
      viewMode,
      setViewMode,
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
    [viewMode, searchQuery, categoryFilter, statusFilter, addModalOpen, totalCount, onlineCount],
  )

  return <NodesViewContext.Provider value={value}>{children}</NodesViewContext.Provider>
}

const defaultFallbackValue: NodesViewContextValue = {
  viewMode: 'map',
  setViewMode: () => {},
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

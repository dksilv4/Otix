import { useContext } from 'react'
import {
  NodesViewContext,
  type NodesViewContextValue,
} from '../context/nodes-view-context'

export const defaultFallbackValue: NodesViewContextValue = {
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

/**
 * Access the nodes dashboard view mode, active tabs, and filtering state.
 */
export const useNodesView = (): NodesViewContextValue => {
  const ctx = useContext(NodesViewContext)
  return ctx || defaultFallbackValue
}

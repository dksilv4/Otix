import { useContext } from 'react'
import {
  NodesViewContext,
  defaultFallbackValue,
  type NodesViewContextValue,
} from '../context/nodes-view-context'

/**
 * Access the nodes dashboard view mode, active tabs, and filtering state.
 */
export const useNodesView = (): NodesViewContextValue => {
  const ctx = useContext(NodesViewContext)
  return ctx || defaultFallbackValue
}

/** Imperative opener for the Indexer Search modal (Hub Cmd+K / Ctrl+K + downloads CTA). */

export const INDEXER_SEARCH_EVENT = 'otix:indexer-search'

export interface OpenIndexerSearchDetail {
  query?: string
  nodeId?: number
  nodeName?: string
  serverId?: number
  serverName?: string
}

export function openIndexerSearch(detail?: OpenIndexerSearchDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(INDEXER_SEARCH_EVENT, { detail }))
}

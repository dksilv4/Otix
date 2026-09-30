import { useEffect, useRef } from 'react'
import { useModal } from '@/lib/modals'
import { INDEXER_SEARCH_EVENT, type OpenIndexerSearchDetail } from '../open-indexer-search'
import { ServerGameSearchModal } from './server-game-search-modal'
import { useGameServers, getCachedNodes } from '../hooks/use-node-downloads'

/** Listens for Hub (Ctrl+K) / global CTA events and opens the Indexer Search modal. */
export function IndexerSearchHost() {
  const { openModal } = useModal()
  const openModalRef = useRef(openModal)
  useEffect(() => {
    openModalRef.current = openModal
  })
  const isOpenRef = useRef(false)
  const { data: gameServers = [] } = useGameServers()
  const gameServersRef = useRef(gameServers)
  useEffect(() => {
    gameServersRef.current = gameServers
  }, [gameServers])

  useEffect(() => {
    const handler = (event: Event) => {
      if (isOpenRef.current) return
      const customEvent = event as CustomEvent<OpenIndexerSearchDetail | undefined>
      const detail = customEvent.detail

      const servers = gameServersRef.current.length > 0 ? gameServersRef.current : getCachedNodes()
      const explicitId = detail?.nodeId ?? detail?.serverId
      const targetServer = explicitId != null
        ? servers.find((s) => s.id === explicitId)
        : servers.find((s) => s.isActive) || servers[0]

      const explicitName = detail?.nodeName ?? detail?.serverName
      const resolvedName = explicitName || targetServer?.name || 'Node'
      const resolvedId = explicitId ?? targetServer?.id

      isOpenRef.current = true
      const close = openModalRef.current(
        <ServerGameSearchModal
          nodeId={resolvedId}
          nodeName={resolvedName}
          serverId={resolvedId}
          serverName={resolvedName}
          initialQuery={detail?.query || ''}
          onClose={() => {
            isOpenRef.current = false
            close()
          }}
        />,
      )
    }

    window.addEventListener(INDEXER_SEARCH_EVENT, handler)
    return () => window.removeEventListener(INDEXER_SEARCH_EVENT, handler)
  }, [])

  return null
}

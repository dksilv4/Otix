import { DownloadCloud } from 'lucide-react'
import { openIndexerSearch } from '@/features/downloads/open-indexer-search'
import { getCachedNodes } from '@/features/downloads/hooks/use-node-downloads'
import type { Command, CommandProvider } from '../types'

const INDEXER_KEYWORDS = ['indexer', 'indexers', 'prowlarr', 'usenet', 'torrent', 'download', 'releases']

export function createIndexerProvider(): CommandProvider {
  return {
    id: 'indexer',
    label: 'Indexers',
    domain: 'games',
    search: (query: string): Command[] => {
      const q = query.trim()
      const servers = getCachedNodes()
      const activeServer = servers.find((s) => s.isActive) || servers[0] || null
      const serverSubtitle = activeServer
        ? `Search Prowlarr on ${activeServer.name} for releases`
        : 'Search Prowlarr indexers for releases'

      const commands: Command[] = []

      // If empty query or keyword query, show the generic "Search indexers" command
      if (!q || INDEXER_KEYWORDS.some((k) => k.includes(q.toLowerCase()))) {
        commands.push({
          id: 'indexer:open',
          title: 'Search indexers',
          subtitle: serverSubtitle,
          icon: DownloadCloud,
          domain: 'games',
          keywords: INDEXER_KEYWORDS,
          run: () =>
            openIndexerSearch({
              nodeId: activeServer?.id,
              nodeName: activeServer?.name,
            }),
        })
      }

      // If there's an actual search term, provide direct search for that query
      if (q) {
        commands.push({
          id: `indexer:search:${q.toLowerCase()}`,
          title: `Search indexers for “${q}”`,
          subtitle: serverSubtitle,
          icon: DownloadCloud,
          domain: 'games',
          keywords: [...INDEXER_KEYWORDS, q.toLowerCase()],
          run: () =>
            openIndexerSearch({
              query: q,
              nodeId: activeServer?.id,
              nodeName: activeServer?.name,
            }),
        })
      }

      return commands
    },
  }
}

import type { GameServer } from '@/features/downloads/types'

export const NODE_KEYWORDS =
  'sabnzbd prowlarr g4u g4u.to radarr sonarr jdownloader jd2 usenet torrent arr downloader indexer server node companion'

export const NODE_SERVICE_COLORS: Record<string, string> = {
  sabnzbd: '#f59e0b',
  prowlarr: '#e05338',
  g4u: 'var(--primary)',
  radarr: '#ffc107',
  sonarr: '#00c4df',
  jdownloader: 'var(--primary)',
}

export const NODE_SERVICE_BG: Record<string, string> = {
  sabnzbd: 'bg-[#f59e0b]/10',
  prowlarr: 'bg-[#e05338]/10',
  g4u: 'bg-primary/10',
  radarr: 'bg-[#ffc107]/10',
  sonarr: 'bg-[#00c4df]/10',
  jdownloader: 'bg-primary/10',
}

export function filterConnectedNodes(servers: GameServer[], query: string): GameServer[] {
  const clean = query.toLowerCase().trim()
  if (!clean) return servers
  return servers.filter((server) => {
    const nameMatch = server.name.toLowerCase().includes(clean)
    const urlMatch = (server.primaryUrl || server.localUrl || '').toLowerCase().includes(clean)
    const keywordMatch = NODE_KEYWORDS.includes(clean)
    return nameMatch || urlMatch || keywordMatch
  })
}

export function formatNodeEndpoint(server: GameServer): string {
  return server.primaryUrl || server.localUrl || 'Local endpoint'
}

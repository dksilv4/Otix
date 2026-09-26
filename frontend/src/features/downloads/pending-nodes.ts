export interface PendingNode {
  serverName: string
  localUrl: string
  authToken?: string
  claimCode?: string
  claimed?: boolean
}

function normalizeHost(host: string): string {
  if (host === 'localhost' || host === '::1') return '127.0.0.1'
  return host
}

export function nodeUrlKey(url: string): string {
  try {
    const parsed = new URL(url)
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
    return `${normalizeHost(parsed.hostname)}:${port}`
  } catch {
    return url.replace(/\/$/, '')
  }
}

function knownKeys(servers: Array<{ primaryUrl?: string; localUrl?: string | null }>): Set<string> {
  return new Set(
    servers.flatMap((server) =>
      [server.primaryUrl, server.localUrl].filter(Boolean).map((url) => nodeUrlKey(url as string)),
    ),
  )
}

export function pendingNodesToClaim(
  pending: PendingNode[],
  servers: Array<{ primaryUrl?: string; localUrl?: string | null; authToken?: string | null }>,
): PendingNode[] {
  const known = knownKeys(servers)
  const knownTokens = new Set(
    servers.map((server) => server.authToken).filter((token): token is string => Boolean(token)),
  )
  const seenKeys = new Set<string>()
  const seenTokens = new Set<string>()
  const unique: PendingNode[] = []
  for (const node of pending) {
    if (!node.localUrl) continue
    if (node.claimed) continue
    const key = nodeUrlKey(node.localUrl)
    if (known.has(key) || seenKeys.has(key)) continue
    if (node.authToken && (knownTokens.has(node.authToken) || seenTokens.has(node.authToken))) continue
    seenKeys.add(key)
    if (node.authToken) seenTokens.add(node.authToken)
    unique.push(node)
  }
  return unique
}

export function pendingNodesToRefresh(
  pending: PendingNode[],
  servers: Array<{
    id: number
    primaryUrl?: string
    localUrl?: string | null
    authToken?: string | null
  }>,
): Array<{ id: number; node: PendingNode }> {
  return pending.flatMap((node) => {
    if (!node.localUrl || !node.authToken) return []
    const key = nodeUrlKey(node.localUrl)
    const match = servers.find((server) =>
      [server.primaryUrl, server.localUrl].filter(Boolean).some((url) => nodeUrlKey(url as string) === key),
    )
    if (!match || match.authToken === node.authToken) return []
    return [{ id: match.id, node }]
  })
}

export async function probeLocalGameNode(fetcher: typeof fetch = fetch): Promise<PendingNode | null> {
  try {
    const statusResp = await fetcher('http://127.0.0.1:8090/api/v1/status', {
      signal: AbortSignal.timeout(2000),
    })
    if (!statusResp.ok) return null
    const data = await statusResp.json()
    let authToken = ''
    try {
      const home = await fetcher('http://127.0.0.1:8090/', { signal: AbortSignal.timeout(2000) })
      if (home.ok) {
        const html = await home.text()
        const match = html.match(/id="node-access-token"[^>]*value="([^"]*)"/)
        if (match?.[1]) authToken = match[1]
      }
    } catch {
      // Token comes from heartbeat when the homepage cannot be read.
    }
    let claimCode = data.claim_code || ''
    let claimed = Boolean(data.claimed)
    if (!claimed && !claimCode) {
      try {
        const claimResp = await fetcher('http://127.0.0.1:8090/api/v1/claim/status', {
          signal: AbortSignal.timeout(1500),
        })
        if (claimResp.ok) {
          const claimData = await claimResp.json()
          claimCode = claimData.claim_code || ''
          claimed = Boolean(claimData.claimed)
        }
      } catch {
        // ignore
      }
    }
    return {
      serverName: data.server_name || data.serverName || 'Otix Game Server',
      localUrl: 'http://127.0.0.1:8090',
      authToken,
      claimCode,
      claimed,
    }
  } catch {
    return null
  }
}

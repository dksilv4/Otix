export interface PendingNode {
  serverName: string
  localUrl: string
  authToken?: string
  claimCode?: string
  claimed?: boolean
  claimedBy?: string
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

export function isNodeOrphaned(
  node: PendingNode,
  servers: Array<{ primaryUrl?: string; localUrl?: string | null; authToken?: string | null }>,
): boolean {
  if (!node.claimed) return false
  const known = knownKeys(servers)
  const key = nodeUrlKey(node.localUrl)
  if (known.has(key)) return false
  if (node.authToken) {
    const knownTokens = new Set(
      servers.map((server) => server.authToken).filter((token): token is string => Boolean(token)),
    )
    if (knownTokens.has(node.authToken)) return false
  }
  return true
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
    name?: string
    primaryUrl?: string
    localUrl?: string | null
    authToken?: string | null
  }>,
): Array<{ id: number; node: PendingNode }> {
  return pending.flatMap((node) => {
    if (!node.localUrl) return []
    const key = nodeUrlKey(node.localUrl)
    const match = servers.find((server) =>
      [server.primaryUrl, server.localUrl].filter(Boolean).some((url) => nodeUrlKey(url as string) === key),
    )
    if (!match) return []
    const tokenChanged = Boolean(node.authToken && match.authToken !== node.authToken)
    const nameChanged = Boolean(
      match.name &&
      node.serverName &&
      node.serverName !== 'Otix Game Server' &&
      node.serverName !== 'Otix Node' &&
      match.name !== node.serverName,
    )
    if (!tokenChanged && !nameChanged) return []
    return [{ id: match.id, node }]
  })
}

export async function unclaimLocalGameNode(fetcher: typeof fetch = fetch, authToken?: string, customPort?: number): Promise<boolean> {
  const port = customPort && customPort > 0 ? customPort : 8090
  const baseUrl = `http://127.0.0.1:${port}`
  try {
    let url = `${baseUrl}/api/v1/claim/unclaim`
    const headers: Record<string, string> = {}
    if (authToken) {
      url += `?token=${encodeURIComponent(authToken)}`
      headers['Authorization'] = `Bearer ${authToken}`
    } else {
      try {
        const home = await fetcher(`${baseUrl}/`, { signal: AbortSignal.timeout(1500) })
        if (home.ok) {
          const html = await home.text()
          const match = html.match(/id="node-access-token"[^>]*value="([^"]*)"/) || html.match(/const TOKEN\s*=\s*"([^"]*)"/)
          if (match?.[1]) {
            url += `?token=${encodeURIComponent(match[1])}`
            headers['Authorization'] = `Bearer ${match[1]}`
          }
        }
      } catch {
        // ignore
      }
    }
    const resp = await fetcher(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(3000),
    })
    return resp.ok
  } catch {
    return false
  }
}

export async function probeLocalGameNode(fetcher: typeof fetch = fetch, customPort?: number): Promise<PendingNode | null> {
  const port = customPort && customPort > 0 ? customPort : 8090
  const baseUrl = `http://127.0.0.1:${port}`
  try {
    let serverName = 'Otix Game Server'
    let claimCode = ''
    let claimed = false
    let claimedBy: string | undefined = undefined
    let authToken = ''
    let reached = false

    try {
      const statusResp = await fetcher(`${baseUrl}/api/v1/status`, {
        signal: AbortSignal.timeout(600),
      })
      if (statusResp.ok) {
        reached = true
        const data = await statusResp.json()
        if (data.server_name || data.serverName) serverName = data.server_name || data.serverName
        if (data.claim_code) claimCode = data.claim_code
        if (data.claimed !== undefined) claimed = Boolean(data.claimed)
        if (data.claimed_by) claimedBy = data.claimed_by
      } else if (statusResp.status === 404) {
        // Server exists on port but has an older endpoint structure
        reached = true
      }
    } catch {
      // Nothing is listening on port or request was blocked; abort probe immediately
      return null
    }

    if (!reached) {
      try {
        const pingResp = await fetcher(`${baseUrl}/api/v1/ping`, {
          signal: AbortSignal.timeout(600),
        })
        if (pingResp.ok) {
          reached = true
          const pingData = await pingResp.json()
          if (pingData.server_name) serverName = pingData.server_name
          if (pingData.claimed !== undefined) claimed = Boolean(pingData.claimed)
          if (pingData.claimed_by) claimedBy = pingData.claimed_by
        }
      } catch {
        // ignore
      }
    }

    if (!reached) {
      try {
        const claimResp = await fetcher(`${baseUrl}/api/v1/claim/status`, {
          signal: AbortSignal.timeout(600),
        })
        if (claimResp.ok) {
          reached = true
          const claimData = await claimResp.json()
          claimed = Boolean(claimData.claimed)
          claimCode = claimData.claim_code || ''
          if (claimData.server_name) serverName = claimData.server_name
          if (claimData.username) claimedBy = claimData.username
        }
      } catch {
        // ignore
      }
    }

    if (!reached) return null

    try {
      const home = await fetcher(`${baseUrl}/`, { signal: AbortSignal.timeout(600) })
      if (home.ok) {
        const html = await home.text()
        const match = html.match(/id="node-access-token"[^>]*value="([^"]*)"/) || html.match(/const TOKEN\s*=\s*"([^"]*)"/)
        if (match?.[1]) authToken = match[1]
      }
    } catch {
      // ignore
    }

    if (!claimed && !claimCode) {
      try {
        const claimResp = await fetcher(`${baseUrl}/api/v1/claim/status`, {
          signal: AbortSignal.timeout(600),
        })
        if (claimResp.ok) {
          const claimData = await claimResp.json()
          claimCode = claimData.claim_code || ''
          claimed = Boolean(claimData.claimed)
          if (claimData.username) claimedBy = claimData.username
        }
      } catch {
        // ignore
      }
    }

    const res: PendingNode = {
      serverName,
      localUrl: baseUrl,
      authToken,
      claimCode,
      claimed,
    }
    if (claimedBy) {
      res.claimedBy = claimedBy
    }
    return res
  } catch {
    return null
  }
}

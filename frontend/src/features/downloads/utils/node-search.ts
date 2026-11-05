/**
 * Utilities for direct node communication for indexer and provider searches.
 * Bypasses central API server / Cloudflare origin to execute searches directly on the node.
 */

import { getCachedNodes } from '../hooks/use-node-downloads';
import { normalizeProwlarrRelease } from '../usenet-utils';
import type { ServerProwlarrRelease } from '../usenet-types';
import type { UnifiedReleaseItem } from '../provider-types';

export interface NodeSearchEndpoints {
  targets: string[];
  authToken?: string;
  nodeName: string;
}

/**
 * Resolves reachable direct HTTP endpoints and auth credentials for a target node.
 */
export function resolveNodeSearchEndpoints(nodeId?: number): NodeSearchEndpoints {
  const cached = getCachedNodes();
  const targetNode =
    typeof nodeId === 'number' && nodeId > 0
      ? cached.find((n) => n.id === nodeId)
      : cached.find((n) => n.isActive) || cached[0];

  const targets: string[] = [];
  const addTarget = (rawUrl?: string | null) => {
    if (!rawUrl) return;
    const clean = rawUrl.trim().replace(/\/+$/, '');
    if (!clean || clean.startsWith('otix://')) return;
    if (!targets.includes(clean)) {
      targets.push(clean);
    }
  };

  if (targetNode) {
    addTarget(targetNode.localUrl);
    addTarget(targetNode.primaryUrl);
    addTarget(targetNode.remoteUrl);
  }

  // Include local default port if node is local, desktop, or loopback-based
  const isLocal =
    targetNode?.isLocal ||
    targetNode?.isLocalDesktop ||
    !targetNode ||
    targets.length === 0 ||
    targets.some((t) => t.includes('127.0.0.1') || t.includes('localhost'));

  if (isLocal) {
    for (const t of [...targets]) {
      try {
        const u = new URL(t);
        if (u.port && u.port !== '8090') {
          const loopback = `http://127.0.0.1:${u.port}`;
          if (!targets.includes(loopback)) targets.push(loopback);
        }
      } catch {
        // ignore malformed URLs
      }
    }
    if (!targets.includes('http://127.0.0.1:8090')) {
      targets.push('http://127.0.0.1:8090');
    }
  }

  return {
    targets,
    authToken: targetNode?.authToken || undefined,
    nodeName: targetNode?.name || 'Otix Node',
  };
}

/**
 * Searches indexers (Prowlarr & g4u) directly on the target Otix Node daemon.
 * Queries candidate node endpoints sequentially and returns normalized releases.
 */
export async function searchNodeIndexersDirect(
  nodeId: number | undefined,
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<ServerProwlarrRelease[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const { targets, authToken, nodeName } = resolveNodeSearchEndpoints(nodeId);
  if (targets.length === 0) {
    throw new Error(`No reachable endpoint found for node “${nodeName}”. Ensure your node is online.`);
  }

  let lastError: Error | null = null;
  for (const base of targets) {
    try {
      const url = new URL('/api/v1/usenet/search', base);
      url.searchParams.set('query', cleanQuery);
      if (authToken) {
        url.searchParams.set('token', authToken);
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const resp = await fetcher(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Node HTTP ${resp.status}: ${errText || resp.statusText}`);
      }

      const raw = await resp.json();
      if (!Array.isArray(raw)) return [];

      const releases: ServerProwlarrRelease[] = [];
      const seen = new Set<string>();
      for (const row of raw) {
        const item = normalizeProwlarrRelease(row);
        if (item && !seen.has(item.guid)) {
          seen.add(item.guid);
          releases.push(item);
        }
      }
      return releases;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  throw (
    lastError ||
    new Error(`Failed to contact node “${nodeName}” at ${targets.join(', ')}. Ensure the node is online.`)
  );
}

/**
 * Searches modular providers directly on the target Otix Node daemon (/api/v1/downloads/search).
 */
export async function searchModularNodeDirect(
  nodeId: number | undefined,
  query: string,
  provider?: string,
  fetcher: typeof fetch = fetch,
): Promise<UnifiedReleaseItem[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const { targets, authToken, nodeName } = resolveNodeSearchEndpoints(nodeId);
  if (targets.length === 0) {
    throw new Error(`No reachable endpoint found for node “${nodeName}”. Ensure your node is online.`);
  }

  let lastError: Error | null = null;
  for (const base of targets) {
    try {
      const url = new URL('/api/v1/downloads/search', base);
      url.searchParams.set('query', cleanQuery);
      if (provider) {
        url.searchParams.set('provider', provider);
      }
      if (authToken) {
        url.searchParams.set('token', authToken);
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const resp = await fetcher(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Node HTTP ${resp.status}: ${errText || resp.statusText}`);
      }

      const raw = await resp.json();
      if (!Array.isArray(raw)) return [];
      return raw as UnifiedReleaseItem[];
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  throw (
    lastError ||
    new Error(`Failed to contact node “${nodeName}” at ${targets.join(', ')}. Ensure the node is online.`)
  );
}

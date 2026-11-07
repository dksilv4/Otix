/**
 * UNC Path Resolver & Unresolver
 *
 * Dynamically resolves machine hostnames in UNC network paths (e.g. \\SERVER\Games\...)
 * to their corresponding IP addresses (e.g. \\192.168.1.58\Games\...) for backend
 * filesystem operations (stat, readdir, scanning, file moves, launching), while
 * maintaining the user-facing display machine name in the frontend UI and database.
 *
 * High-performance optimizations:
 * - Character code fast-path for non-UNC paths (bypasses regex execution)
 * - 2,000-entry in-memory LRU cache for resolveUncPath and unresolveUncPath
 * - Offline host circuit breaker (60-second TTL) to prevent 20-45s Windows SMB blocking
 * - 10-minute TTL caching on backend machine mapping sync to eliminate heartbeat overhead
 */

import * as netSocket from 'net';

// Registry of lowercase machine name -> resolved host/IP
const machineToIpMap = new Map<string, string>();

// Reverse map: host/IP (lowercase) -> display machine name (e.g. '192.168.1.58' -> 'SERVER')
const ipToMachineMap = new Map<string, string>();

// LRU Caches for UNC path resolution (capacity: 2000)
const MAX_CACHE_SIZE = 2000;
const resolveCache = new Map<string, string>();
const unresolveCache = new Map<string, string>();

function putResolveCache(key: string, value: string): void {
  if (resolveCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = resolveCache.keys().next().value;
    if (oldestKey !== undefined) resolveCache.delete(oldestKey);
  }
  resolveCache.set(key, value);
}

function putUnresolveCache(key: string, value: string): void {
  if (unresolveCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = unresolveCache.keys().next().value;
    if (oldestKey !== undefined) unresolveCache.delete(oldestKey);
  }
  unresolveCache.set(key, value);
}

export function clearUncCache(): void {
  resolveCache.clear();
  unresolveCache.clear();
}

// ── Offline Host Circuit Breaker ──────────────────────────────────────────

const offlineHosts = new Map<string, number>();
const OFFLINE_HOST_TTL_MS = 60000; // 60 seconds TTL

export function isHostOffline(host: string): boolean {
  if (!host) return false;
  const lower = host.toLowerCase();
  const expiresAt = offlineHosts.get(lower);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    offlineHosts.delete(lower);
    return false;
  }
  return true;
}

export function markHostOffline(host: string, ttlMs = OFFLINE_HOST_TTL_MS): void {
  if (!host) return;
  offlineHosts.set(host.toLowerCase(), Date.now() + ttlMs);
}

export function markHostOnline(host: string): void {
  if (!host) return;
  offlineHosts.delete(host.toLowerCase());
}

export function clearOfflineHosts(): void {
  offlineHosts.clear();
}

export function extractUncHost(pathStr: string): string | null {
  if (!pathStr || typeof pathStr !== 'string' || pathStr.length < 3) return null;
  const c0 = pathStr.charCodeAt(0);
  const c1 = pathStr.charCodeAt(1);
  if (!((c0 === 92 && c1 === 92) || (c0 === 47 && c1 === 47))) return null;
  const match = /^([\\/]{2})([^\\/]+)/.exec(pathStr);
  return match ? match[2] : null;
}

/**
 * Fast TCP reachability check (port 445 SMB by default, 500ms timeout).
 * Automatically updates circuit breaker state.
 */
export async function isHostReachable(hostOrPath: string, port = 445, timeoutMs = 500): Promise<boolean> {
  const host = extractUncHost(hostOrPath) || hostOrPath;
  if (!host) return true;
  if (isHostOffline(host)) return false;

  return new Promise((resolve) => {
    const socket = new netSocket.Socket();
    let settled = false;

    const finish = (reachable: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        if (!reachable) {
          markHostOffline(host);
        } else {
          markHostOnline(host);
        }
        resolve(reachable);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

// ── Machine Mappings ──────────────────────────────────────────────────────

/**
 * Register or update a machine-to-IP mapping.
 */
export function registerMachineMapping(machineName: string, hostOrIp: string): void {
  if (!machineName || !hostOrIp) return;
  const nameNorm = machineName.trim().toLowerCase();
  const hostNorm = hostOrIp.trim();
  if (!nameNorm || !hostNorm) return;

  // Don't map IP to IP redundantly
  if (nameNorm === hostNorm.toLowerCase()) return;

  machineToIpMap.set(nameNorm, hostNorm);
  ipToMachineMap.set(hostNorm.toLowerCase(), machineName.trim());
  clearUncCache();
}

/**
 * Bulk sync machine mappings (e.g. from server-machines or nodes).
 */
export function syncMachineMappings(
  machines: Array<{
    name?: string;
    node_name?: string;
    server_name?: string;
    host?: string;
    smbHost?: string;
    localUrl?: string;
    local_url?: string;
    primary_url?: string;
    local_endpoints?: string[];
  }>,
): void {
  if (!Array.isArray(machines)) return;
  for (const m of machines) {
    const name = m.name || m.node_name || m.server_name;
    let target = m.smbHost || m.host;
    if (!target && (m.localUrl || m.local_url || m.primary_url)) {
      const urlCandidate = m.localUrl || m.local_url || m.primary_url || '';
      try {
        const u = new URL(urlCandidate);
        target = u.hostname;
      } catch {
        target = urlCandidate.replace(/^https?:\/\//i, '').split(/[:/]/)[0];
      }
    }
    if (!target && Array.isArray(m.local_endpoints) && m.local_endpoints.length > 0) {
      try {
        const u = new URL(m.local_endpoints[0]);
        target = u.hostname;
      } catch {
        target = m.local_endpoints[0].replace(/^https?:\/\//i, '').split(/[:/]/)[0];
      }
    }
    if (name && target) {
      registerMachineMapping(name, target);
    }
  }
}

/**
 * Return current registered machine mappings as a plain object.
 */
export function getRegisteredMachineMappings(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of machineToIpMap.entries()) {
    result[k] = v;
  }
  return result;
}

/**
 * Resolves a UNC path with a machine name to its IP address for backend operations.
 * Example: `\\SERVER\Games\title` -> `\\192.168.1.58\Games\title`
 */
export function resolveUncPath(pathStr: string): string {
  if (!pathStr || typeof pathStr !== 'string' || pathStr.length < 3) return pathStr;

  // Fast path: must start with \\ or //
  const c0 = pathStr.charCodeAt(0);
  const c1 = pathStr.charCodeAt(1);
  if (!((c0 === 92 && c1 === 92) || (c0 === 47 && c1 === 47))) {
    return pathStr;
  }

  const cached = resolveCache.get(pathStr);
  if (cached !== undefined) {
    resolveCache.delete(pathStr);
    resolveCache.set(pathStr, cached);
    return cached;
  }

  const match = /^([\\/]{2})([^\\/]+)([\\/].*|$)/.exec(pathStr);
  if (!match) {
    putResolveCache(pathStr, pathStr);
    return pathStr;
  }

  const prefix = match[1];
  const host = match[2];
  const rest = match[3] || '';

  const mappedIp = machineToIpMap.get(host.toLowerCase());
  if (mappedIp) {
    const sep = prefix.includes('/') ? '/' : '\\';
    const normalizedRest = rest ? (sep === '\\' ? rest.replace(/\//g, '\\') : rest.replace(/\\/g, '/')) : '';
    const result = `${prefix}${mappedIp}${normalizedRest}`;
    putResolveCache(pathStr, result);
    return result;
  }

  putResolveCache(pathStr, pathStr);
  return pathStr;
}

/**
 * Converts an IP-based UNC path back to the display machine name for UI presentation.
 * Example: `\\192.168.1.58\Games\title` -> `\\SERVER\Games\title`
 */
export function unresolveUncPath(pathStr: string): string {
  if (!pathStr || typeof pathStr !== 'string' || pathStr.length < 3) return pathStr;

  // Fast path: must start with \\ or //
  const c0 = pathStr.charCodeAt(0);
  const c1 = pathStr.charCodeAt(1);
  if (!((c0 === 92 && c1 === 92) || (c0 === 47 && c1 === 47))) {
    return pathStr;
  }

  const cached = unresolveCache.get(pathStr);
  if (cached !== undefined) {
    unresolveCache.delete(pathStr);
    unresolveCache.set(pathStr, cached);
    return cached;
  }

  const match = /^([\\/]{2})([^\\/]+)([\\/].*|$)/.exec(pathStr);
  if (!match) {
    putUnresolveCache(pathStr, pathStr);
    return pathStr;
  }

  const prefix = match[1];
  const host = match[2];
  const rest = match[3] || '';

  const displayMachine = ipToMachineMap.get(host.toLowerCase());
  if (displayMachine) {
    const sep = prefix.includes('/') ? '/' : '\\';
    const normalizedRest = rest ? (sep === '\\' ? rest.replace(/\//g, '\\') : rest.replace(/\\/g, '/')) : '';
    const result = `${prefix}${displayMachine}${normalizedRest}`;
    putUnresolveCache(pathStr, result);
    return result;
  }

  putUnresolveCache(pathStr, pathStr);
  return pathStr;
}

// ── Backend Machine Mappings Sync with 10-Minute TTL ──────────────────────

let lastMachineMappingSync = 0;
const MACHINE_MAPPING_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function clearMachineMappingSyncCache(): void {
  lastMachineMappingSync = 0;
}

/**
 * Fetch machine mappings from Otix backend API with a 10-minute cache TTL.
 */
export async function syncMachineMappingsFromBackend(
  apiBaseUrl: string,
  authToken?: string,
  force = false,
): Promise<void> {
  if (!apiBaseUrl) return;
  const now = Date.now();
  if (!force && lastMachineMappingSync > 0 && (now - lastMachineMappingSync < MACHINE_MAPPING_CACHE_TTL_MS)) {
    return;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const base = apiBaseUrl.replace(/\/$/, '');

  try {
    let synced = false;
    try {
      const nodeRes = await fetch(`${base}/api/v1/library/nodes`, { headers });
      if (nodeRes.ok) {
        const data = await nodeRes.json();
        const nodesList = Array.isArray(data) ? data : (Array.isArray((data as any)?.results) ? (data as any).results : null);
        if (nodesList && nodesList.length > 0) {
          syncMachineMappings(nodesList);
          lastMachineMappingSync = now;
          synced = true;
        }
      }
    } catch {
      // Fall through to server-machines fallback
    }

    if (!synced) {
      const res = await fetch(`${base}/api/v1/library/server-machines`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          syncMachineMappings(data);
        }
        lastMachineMappingSync = now;
      }
    }
  } catch {
    // Non-fatal if offline
  }
}

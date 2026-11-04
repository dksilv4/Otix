/**
 * UNC Path Resolver & Unresolver
 *
 * Dynamically resolves machine hostnames in UNC network paths (e.g. \\SERVER\Games\...)
 * to their corresponding IP addresses (e.g. \\192.168.1.58\Games\...) for backend
 * filesystem operations (stat, readdir, scanning, file moves, launching), while
 * maintaining the user-facing display machine name in the frontend UI and database.
 */

// Registry of lowercase machine name -> resolved host/IP
const machineToIpMap = new Map<string, string>();

// Reverse map: host/IP (lowercase) -> display machine name (e.g. '192.168.1.58' -> 'SERVER')
const ipToMachineMap = new Map<string, string>();

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
}

/**
 * Bulk sync machine mappings (e.g. from server-machines or nodes).
 */
export function syncMachineMappings(
  machines: Array<{ name?: string; host?: string; smbHost?: string; localUrl?: string }>,
): void {
  if (!Array.isArray(machines)) return;
  for (const m of machines) {
    const name = m.name;
    let target = m.smbHost || m.host;
    if (!target && m.localUrl) {
      try {
        const u = new URL(m.localUrl);
        target = u.hostname;
      } catch {
        target = m.localUrl.replace(/^https?:\/\//i, '').split(/[:/]/)[0];
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
  if (!pathStr || typeof pathStr !== 'string') return pathStr;

  const match = /^([\\/]{2})([^\\/]+)([\\/].*|$)/.exec(pathStr);
  if (!match) return pathStr;

  const prefix = match[1];
  const host = match[2];
  const rest = match[3] || '';

  const mappedIp = machineToIpMap.get(host.toLowerCase());
  if (mappedIp) {
    const sep = prefix.includes('/') ? '/' : '\\';
    const normalizedRest = rest ? (sep === '\\' ? rest.replace(/\//g, '\\') : rest.replace(/\\/g, '/')) : '';
    return `${prefix}${mappedIp}${normalizedRest}`;
  }

  return pathStr;
}

/**
 * Converts an IP-based UNC path back to the display machine name for UI presentation.
 * Example: `\\192.168.1.58\Games\title` -> `\\SERVER\Games\title`
 */
export function unresolveUncPath(pathStr: string): string {
  if (!pathStr || typeof pathStr !== 'string') return pathStr;

  const match = /^([\\/]{2})([^\\/]+)([\\/].*|$)/.exec(pathStr);
  if (!match) return pathStr;

  const prefix = match[1];
  const host = match[2];
  const rest = match[3] || '';

  const displayMachine = ipToMachineMap.get(host.toLowerCase());
  if (displayMachine) {
    const sep = prefix.includes('/') ? '/' : '\\';
    const normalizedRest = rest ? (sep === '\\' ? rest.replace(/\//g, '\\') : rest.replace(/\\/g, '/')) : '';
    return `${prefix}${displayMachine}${normalizedRest}`;
  }

  return pathStr;
}

/**
 * Optionally fetch machine mappings from Otix backend API.
 */
export async function syncMachineMappingsFromBackend(
  apiBaseUrl: string,
  authToken?: string,
): Promise<void> {
  if (!apiBaseUrl) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const base = apiBaseUrl.replace(/\/$/, '');

  try {
    const res = await fetch(`${base}/api/v1/library/server-machines`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        syncMachineMappings(data);
      }
    }
  } catch {
    // Non-fatal if offline
  }
}

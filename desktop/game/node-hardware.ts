import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { exec } from 'child_process';

export interface SessionNodeInfo {
  id?: string | number | null;
  name: string;
  url?: string | null;
  installed: boolean;
  running: boolean;
}

export interface SessionHardwareInfo {
  cpu?: string;
  gpu?: string;
  ramBytes?: number;
  os?: string;
  discreteGpu?: boolean;
}

export interface HostNodeMatch {
  node: SessionNodeInfo | null;
  hardware: SessionHardwareInfo | null;
  hardwareSummary: string;
  shareEligible: boolean;
}

let cachedMatch: HostNodeMatch | null = null;
let lastProbedAt = 0;
const CACHE_TTL_MS = 60000; // 1 minute

function httpGetJson<T = any>(urlStr: string, timeoutMs = 800): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const req = http.request(
        {
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => {
              try {
                resolve(JSON.parse(body) as T);
              } catch {
                resolve(null);
              }
            });
          } else {
            resolve(null);
          }
        },
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

/** Check known filesystem locations to verify if an Otix Node is installed. */
export function checkNodeInstalledOnDisk(): { installed: boolean; name?: string } {
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    if (process.env.APPDATA) {
      candidates.push(
        path.join(process.env.APPDATA, 'otix', 'config.yaml'),
        path.join(process.env.APPDATA, 'otix-node', 'config.yaml'),
      );
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push(
        path.join(process.env.LOCALAPPDATA, 'Programs', 'Otix Node', 'config.yaml'),
        path.join(process.env.LOCALAPPDATA, 'OtixNode', 'config.yaml'),
      );
    }
    if (process.env.ProgramFiles) {
      candidates.push(path.join(process.env.ProgramFiles, 'Otix Node', 'config.yaml'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      path.join(os.homedir(), 'Library', 'Application Support', 'otix', 'config.yaml'),
    );
  } else {
    candidates.push(
      path.join(os.homedir(), '.config', 'otix', 'config.yaml'),
      '/etc/otix/config.yaml',
    );
  }

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        const match = content.match(/(?:^|\n)\s*name:\s*["']?([^"'\r\n]+)["']?/);
        return { installed: true, name: match ? match[1].trim() : undefined };
      }
    } catch {
      // ignore read error
    }
  }

  return { installed: false };
}

/**
 * Maps raw OS usable memory bytes (which exclude hardware reserved RAM)
 * to standard manufactured installed physical RAM capacity (e.g. 8GB, 16GB, 24GB, 32GB, 64GB).
 */
export function normalizeRamBytes(bytes?: number | null): number {
  if (!bytes || bytes <= 0) return 0;
  const gib = bytes / (1024 * 1024 * 1024);
  const tiers = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const prev = i === 0 ? 0 : tiers[i - 1];
    const minBound = Math.max(prev + 0.1, tier * 0.8);
    const maxBound = tier * 1.05;
    if (gib >= minBound && gib <= maxBound) {
      return tier * 1024 * 1024 * 1024;
    }
  }
  return Math.round(gib) * 1024 * 1024 * 1024;
}

/** Fallback system hardware specs gathered via Node.js OS APIs. */
function getLocalHardwareFallback(): SessionHardwareInfo {
  const cpus = os.cpus();
  const cpuModel = cpus && cpus.length > 0 ? cpus[0].model.trim() : undefined;
  const ramBytes = normalizeRamBytes(os.totalmem());
  const osName = `${os.type()} ${os.release()} (${os.arch()})`;
  return {
    cpu: cpuModel,
    ramBytes,
    os: osName,
  };
}

let cachedWindowsGpu: string | undefined;
function probeWindowsGpu(): Promise<string | undefined> {
  if (process.platform !== 'win32') return Promise.resolve(undefined);
  if (cachedWindowsGpu) return Promise.resolve(cachedWindowsGpu);

  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"',
      { timeout: 2500 },
      (err, stdout) => {
        if (err || !stdout) return resolve(undefined);
        const lines = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        const discrete = lines.find((l) => /nvidia|geforce|rtx|gtx|radeon|rx\s*\d|arc/i.test(l));
        cachedWindowsGpu = discrete || lines[0];
        resolve(cachedWindowsGpu);
      },
    );
  });
}

/**
 * Detect host node status and hardware specs.
 * Probes the local node daemon if running, checks filesystem if installed,
 * and matches system hardware for anonymous community benchmark sharing.
 */
export async function getHostNodeAndHardware(forceRefresh = false): Promise<HostNodeMatch> {
  const now = Date.now();
  if (!forceRefresh && cachedMatch && now - lastProbedAt < CACHE_TTL_MS) {
    return cachedMatch;
  }

  let nodeInfo: SessionNodeInfo | null = null;
  let hwInfo: SessionHardwareInfo = getLocalHardwareFallback();

  // 1. Try local node HTTP probe (default port 8090)
  const nodeStatus = await httpGetJson<{
    status?: string;
    server_name?: string;
    claimed?: boolean;
    claimed_by?: string;
  }>('http://127.0.0.1:8090/api/v1/status', 600);

  if (nodeStatus && (nodeStatus.status === 'online' || nodeStatus.server_name)) {
    nodeInfo = {
      name: nodeStatus.server_name || os.hostname(),
      url: 'http://127.0.0.1:8090',
      installed: true,
      running: true,
    };

    // Query node hardware endpoint
    const nodeHw = await httpGetJson<any>('http://127.0.0.1:8090/api/v1/desktop/hardware', 1000)
      || await httpGetJson<any>('http://127.0.0.1:8090/api/v1/hardware', 1000);

    if (nodeHw) {
      const gpus: any[] = Array.isArray(nodeHw.gpus) ? nodeHw.gpus : [];
      const primaryGpu = gpus.find((g) => g.isDiscrete) || gpus[0];
      hwInfo = {
        cpu: nodeHw.cpu?.modelName || hwInfo.cpu,
        gpu: primaryGpu?.name || hwInfo.gpu,
        ramBytes: normalizeRamBytes(nodeHw.memory?.totalBytes) || hwInfo.ramBytes,
        os: nodeHw.os?.name || hwInfo.os,
        discreteGpu: primaryGpu?.isDiscrete,
      };
    }
  }

  // 2. If node not actively running, check if installed on machine
  if (!nodeInfo) {
    const diskCheck = checkNodeInstalledOnDisk();
    if (diskCheck.installed) {
      nodeInfo = {
        name: diskCheck.name || os.hostname(),
        url: 'http://127.0.0.1:8090',
        installed: true,
        running: false,
      };
    }
  }

  // 3. If GPU is not resolved yet, probe Windows video controller
  if (!hwInfo.gpu && process.platform === 'win32') {
    const winGpu = await probeWindowsGpu();
    if (winGpu) {
      hwInfo.gpu = winGpu;
      hwInfo.discreteGpu = /nvidia|geforce|rtx|gtx|radeon|rx\s*\d|arc/i.test(winGpu);
    }
  }

  // Compute summary string (e.g. "RTX 4080 · i7-13700K")
  const parts: string[] = [];
  if (hwInfo.gpu) {
    const shortGpu = hwInfo.gpu.replace(/(NVIDIA|AMD|Radeon|GeForce|\(R\)|\(TM\))/gi, '').trim();
    parts.push(shortGpu || hwInfo.gpu);
  }
  if (hwInfo.cpu) {
    const shortCpu = hwInfo.cpu.replace(/(Processor|8-Core|16-Core|12-Core|6-Core|32-Core|24-Core|\(R\)|\(TM\))/gi, '').trim();
    parts.push(shortCpu || hwInfo.cpu);
  }
  const hardwareSummary = parts.join(' · ') || 'Generic Hardware';

  const shareEligible = Boolean(nodeInfo?.installed || hwInfo.gpu || hwInfo.cpu);

  cachedMatch = {
    node: nodeInfo,
    hardware: hwInfo,
    hardwareSummary,
    shareEligible,
  };
  lastProbedAt = now;

  return cachedMatch;
}

/** Synchronous snapshot of the last probed match or sensible defaults. */
export function getCachedHostNodeAndHardware(): HostNodeMatch {
  if (cachedMatch) return cachedMatch;
  const fallbackHw = getLocalHardwareFallback();
  const diskCheck = checkNodeInstalledOnDisk();
  const node: SessionNodeInfo | null = diskCheck.installed
    ? {
        name: diskCheck.name || os.hostname(),
        url: 'http://127.0.0.1:8090',
        installed: true,
        running: false,
      }
    : null;

  const parts: string[] = [];
  if (fallbackHw.cpu) parts.push(fallbackHw.cpu.replace(/\(R\)|\(TM\)|Processor/gi, '').trim());

  return {
    node,
    hardware: fallbackHw,
    hardwareSummary: parts.join(' · ') || 'Host PC',
    shareEligible: Boolean(node?.installed || fallbackHw.cpu),
  };
}

/** Reset cache for unit testing. */
export function resetHostNodeCache(): void {
  cachedMatch = null;
  lastProbedAt = 0;
  cachedWindowsGpu = undefined;
}

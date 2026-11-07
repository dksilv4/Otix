import * as http from 'http';
import * as path from 'path';
import * as gameService from '../../game/storage';
import { resolveUncPath } from '../../unc-resolver';

export interface ScanPathsResult {
  allPathsMap: Map<string, 'game' | 'iso'>;
  hasClientPaths: boolean;
}

export async function resolveAndSyncScanPaths(
  paths: string[] | undefined,
  isoPaths: string[] | undefined,
  port: number,
  authHeaders: Record<string, string>,
  nodeDaemon: any
): Promise<ScanPathsResult> {
  const hasClientPaths = Boolean((paths && paths.length > 0) || (isoPaths && isoPaths.length > 0));
  const allPathsMap = new Map<string, 'game' | 'iso'>();

  if (hasClientPaths) {
    for (const p of paths || []) {
      allPathsMap.set(p, 'game');
    }
    for (const ip of isoPaths || []) {
      allPathsMap.set(ip, 'iso');
    }
  } else {
    let configuredPaths = gameService.getScanPaths();
    if (configuredPaths.length === 0 && nodeDaemon) {
      try {
        const nodeLibs: any = await new Promise((resolve) => {
          const req = http.get(
            `http://127.0.0.1:${port}/api/v1/libraries`,
            { headers: authHeaders, timeout: 2000 },
            (res) => {
              let buf = '';
              res.on('data', (c) => { buf += c; });
              res.on('end', () => {
                try { resolve(JSON.parse(buf)); } catch { resolve([]); }
              });
            }
          );
          req.on('error', () => resolve([]));
          req.on('timeout', () => { req.destroy(); resolve([]); });
        });
        if (Array.isArray(nodeLibs) && nodeLibs.length > 0) {
          const recovered = nodeLibs.map((nl: any) => ({
            path: nl.path,
            type: (nl.kind === 'iso' ? 'iso' : 'game') as 'game' | 'iso',
          }));
          gameService.saveScanPaths(recovered);
          configuredPaths = recovered;
        }
      } catch {
        // ignore node library fetch error
      }
    }
    for (const cp of configuredPaths) {
      allPathsMap.set(cp.path, cp.type === 'iso' || (cp.type as any) === 'provider' ? 'iso' : 'game');
    }
  }

  // Deduplicate paths and prune nested subfolders so directories are not walked multiple times
  const sortedPaths = Array.from(allPathsMap.entries()).sort((a, b) => a[0].length - b[0].length);
  const prunedPathsMap = new Map<string, 'game' | 'iso'>();
  for (const [p, type] of sortedPaths) {
    const normP = path.resolve(p).toLowerCase();
    let isChild = false;
    for (const [parentP] of prunedPathsMap.entries()) {
      const normParent = path.resolve(parentP).toLowerCase();
      if (normP !== normParent && normP.startsWith(normParent + path.sep.toLowerCase())) {
        isChild = true;
        break;
      }
    }
    if (!isChild) {
      prunedPathsMap.set(p, type);
    }
  }
  allPathsMap.clear();
  for (const [k, v] of prunedPathsMap) {
    allPathsMap.set(k, v);
  }

  if (nodeDaemon && allPathsMap.size > 0) {
    const scanItems = Array.from(allPathsMap.entries()).map(([p, t]) => ({ path: p, type: t }));
    // Sync libraries to node with ?no_scan=true so it skips autonomous ScanAll() before explicit scan
    try {
      await new Promise<void>((resolve) => {
        const body = JSON.stringify({
          libraries: scanItems.map((item) => ({
            name: path.basename(item.path) || item.type,
            path: resolveUncPath(item.path),
            kind: item.type,
          })),
        });
        const sHeaders: Record<string, string> = {
          ...authHeaders,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body).toString(),
        };
        const sreq = http.request(
          `http://127.0.0.1:${port}/api/v1/libraries?no_scan=true`,
          { method: 'PUT', headers: sHeaders, timeout: 5000 },
          (res) => {
            res.resume();
            res.on('end', () => resolve());
          }
        );
        sreq.on('error', () => resolve());
        sreq.on('timeout', () => { sreq.destroy(); resolve(); });
        sreq.write(body);
        sreq.end();
      });
    } catch {
      await nodeDaemon.syncLibraries(scanItems);
    }
  }

  return { allPathsMap, hasClientPaths: Boolean(hasClientPaths) };
}

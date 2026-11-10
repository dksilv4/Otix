import * as http from 'http';
import type { LocalGame } from '../../preload-api';

export interface NodeScanRunnerOptions {
  port: number;
  authHeaders: Record<string, string>;
  nodeDaemon: any;
  ingestFile: (f: any) => LocalGame | null;
  handleDiscoveredBatch: (batch: LocalGame[]) => void;
  sendSafeProgress: (currentDir: string, progress: number) => void;
}

export async function runNodeScan(options: NodeScanRunnerOptions): Promise<void> {
  const { port, authHeaders, nodeDaemon, ingestFile, handleDiscoveredBatch, sendSafeProgress } = options;
  if (!nodeDaemon) return;

  const fetchCurrentFiles = (): Promise<any[]> => {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/files`,
        { headers: authHeaders, timeout: 3000 },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            resolve([]);
            return;
          }
          let buf = '';
          res.on('data', (c) => { buf += c; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(buf);
              resolve(Array.isArray(parsed) ? parsed : []);
            } catch {
              resolve([]);
            }
          });
        }
      );
      req.on('error', () => resolve([]));
      req.on('timeout', () => { req.destroy(); resolve([]); });
    });
  };

  // Connect to real-time scan progress stream (SSE)
  let sseReq: http.ClientRequest | null = null;
  try {
    sseReq = http.get(
      `http://127.0.0.1:${port}/api/v1/scan/progress`,
      { headers: authHeaders, timeout: 180000 },
      (res) => {
        let sseBuffer = '';
        res.on('data', (chunk: Buffer) => {
          sseBuffer += chunk.toString('utf8');
          const blocks = sseBuffer.split('\n\n');
          sseBuffer = blocks.pop() || '';
          const realTimeBatch: LocalGame[] = [];
          for (const block of blocks) {
            const eventMatch = block.match(/^event:\s*([^\r\n]+)/m);
            const dataMatch = block.match(/^data:\s*([^\r\n]+)/m);
            if (eventMatch && dataMatch) {
              const eventName = eventMatch[1].trim();
              if (eventName === 'game_found' || eventName === 'file_indexed') {
                try {
                  const parsedFile = JSON.parse(dataMatch[1].trim());
                  const g = ingestFile(parsedFile);
                  if (g) realTimeBatch.push(g);
                } catch {}
              }
            }
          }
          if (realTimeBatch.length > 0) {
            handleDiscoveredBatch(realTimeBatch);
          }
        });
        res.on('error', () => {});
      }
    );
    sseReq.on('error', () => {});
  } catch {}

  let scanDone = false;
  let progressTimer: NodeJS.Timeout | null = null;

  progressTimer = setInterval(async () => {
    if (scanDone) return;
    try {
      const status: any = await new Promise((resolve) => {
        const sreq = http.get(
          `http://127.0.0.1:${port}/api/v1/scan/status`,
          { headers: authHeaders, timeout: 2000 },
          (res) => {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => {
              try { resolve(JSON.parse(buf)); } catch { resolve(null); }
            });
          }
        );
        sreq.on('error', () => resolve(null));
        sreq.on('timeout', () => { sreq.destroy(); resolve(null); });
      });
      if (status && status.phase === 'scanning') {
        const scanned = status.files_scanned || 0;
        const dirParts = (status.current_directory || '').split(/[\\/]/).filter(Boolean);
        const displayDir = dirParts.length > 0 ? dirParts[dirParts.length - 1] : 'libraries';
        sendSafeProgress(
          `Scanning ${displayDir} (${scanned} files)...`,
          Math.min(85, 30 + Math.floor(scanned / 50)),
        );
      }
    } catch {
      // ignore
    }
  }, 500);

  try {
    await new Promise<void>((resolve) => {
      const req = http.request(
        `http://127.0.0.1:${port}/api/v1/scan?wait=1`,
        { method: 'POST', headers: authHeaders, timeout: 120000 },
        (res) => {
          let buf = '';
          res.on('data', (c) => { buf += c; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              console.warn(`[scanner:scan-paths] Node scan returned HTTP ${res.statusCode}: ${buf}`);
            }
            resolve();
          });
        }
      );
      req.on('error', (e) => {
        console.warn('[scanner:scan-paths] Node scan request error:', e.message);
        resolve();
      });
      req.on('timeout', () => {
        req.destroy();
        resolve();
      });
      req.end();
    });
  } finally {
    scanDone = true;
    if (progressTimer) clearInterval(progressTimer);
    if (sseReq) {
      try { sseReq.destroy(); } catch {}
    }
  }

  // Single final fetch on scan completion to ensure any remaining files are ingested
  try {
    const finalFiles = await fetchCurrentFiles();
    if (Array.isArray(finalFiles) && finalFiles.length > 0) {
      const finalBatch: LocalGame[] = [];
      for (const f of finalFiles) {
        const g = ingestFile(f);
        if (g) finalBatch.push(g);
      }
      if (finalBatch.length > 0) {
        handleDiscoveredBatch(finalBatch);
      }
    }
  } catch (err) {
    console.warn('[node-scan-runner] Final files fetch error:', err);
  }
}

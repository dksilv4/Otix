import * as http from 'http';

export async function fetchNodeIndexedFiles(
  port: number,
  authHeaders: Record<string, string>,
  sendSafeProgress: (currentDir: string, progress: number) => void
): Promise<any[]> {
  try {
    return await new Promise<any[]>((resolve) => {
      let resolved = false;
      const safeResolve = (val: any[]) => {
        if (!resolved) {
          resolved = true;
          resolve(val);
        }
      };

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let lastProgressReportTime = Date.now();
      const MAX_RESPONSE_BYTES = 100 * 1024 * 1024; // 100MB safety limit
      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/files`,
        { headers: authHeaders, timeout: 10000 },
        (res) => {
          res.on('error', (err) => {
            req.destroy();
            console.warn('[scanner:scan-paths] Node files response stream error:', err.message);
            safeResolve([]);
          });
          res.on('close', () => {
            if (!resolved) {
              safeResolve([]);
            }
          });

          if (res.statusCode !== 200) {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => {
              console.warn(`[scanner:scan-paths] Node files returned HTTP ${res.statusCode}: ${buf}`);
              safeResolve([]);
            });
            return;
          }
          res.on('data', (chunk: Buffer) => {
            totalBytes += chunk.length;
            if (totalBytes > MAX_RESPONSE_BYTES) {
              req.destroy();
              console.warn('[scanner:scan-paths] Node files response exceeded 100MB, aborting');
              safeResolve([]);
              return;
            }
            chunks.push(chunk);
            const now = Date.now();
            if (now - lastProgressReportTime > 300) {
              lastProgressReportTime = now;
              const mb = (totalBytes / (1024 * 1024)).toFixed(1);
              sendSafeProgress(`Fetching indexed games (${mb} MB)...`, 89);
            }
          });
          res.on('end', async () => {
            try {
              sendSafeProgress('Processing indexed games...', 91);
              if (chunks.length === 0 || totalBytes === 0) {
                safeResolve([]);
                return;
              }
              // Yield to event loop so renderer updates can flush
              await new Promise<void>((r) => setImmediate(r));
              const rawString = chunks.length === 1 ? chunks[0].toString('utf8') : Buffer.concat(chunks, totalBytes).toString('utf8');
              chunks.length = 0;
              const parsed = JSON.parse(rawString);
              const result = Array.isArray(parsed) ? parsed : [];
              sendSafeProgress(`Loaded ${result.length} indexed files`, 93);
              safeResolve(result);
            } catch (parseErr: any) {
              console.warn('[scanner:scan-paths] Failed to parse node files response:', parseErr.message);
              safeResolve([]);
            }
          });
        }
      );
      req.on('error', (e) => {
        console.warn('[scanner:scan-paths] Node files fetch error:', e.message);
        safeResolve([]);
      });
      req.on('timeout', () => {
        req.destroy();
        console.warn('[scanner:scan-paths] Node files fetch timed out after 10s');
        safeResolve([]);
      });
    });
  } catch (fetchErr: any) {
    console.warn('[scanner:scan-paths] Node files fetch exception:', fetchErr);
    return [];
  }
}

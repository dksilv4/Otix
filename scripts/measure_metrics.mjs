import fs from 'node:fs';
import path from 'node:path';

const TARGET_URL = 'http://127.0.0.1:9222/json/list';

async function measure() {
  const res = await fetch(TARGET_URL);
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    console.error('No page target found on port 9222');
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let idCounter = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve } = pending.get(data.id);
      pending.delete(data.id);
      resolve(data);
    }
  };

  ws.onopen = async () => {
    try {
      await send('Runtime.enable');

      // 1. Measure LocalStorage & Memory
      const evalRes = await send('Runtime.evaluate', {
        expression: `(() => {
          let totalBytes = 0;
          let otixCacheBytes = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const val = localStorage.getItem(key) || '';
            const size = (key.length + val.length) * 2; // UTF-16
            totalBytes += size;
            if (key === 'otix_query_cache_v4' || key === 'otix_query_cache') {
              otixCacheBytes += size;
            }
          }

          const mem = performance?.memory ? {
            usedHeapMb: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
            totalHeapMb: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2),
            heapLimitMb: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2),
          } : null;

          return {
            totalLocalStorageKb: (totalBytes / 1024).toFixed(2),
            totalLocalStorageMb: (totalBytes / 1024 / 1024).toFixed(2),
            otixCacheMb: (otixCacheBytes / 1024 / 1024).toFixed(2),
            keysCount: localStorage.length,
            memory: mem,
          };
        })()`,
        returnByValue: true,
      });

      // 2. Measure Library Payload
      const libRes = await send('Runtime.evaluate', {
        expression: `(async () => {
          if (!window.desktopAPI?.getLibrary) return null;
          const t0 = performance.now();
          const lib = await window.desktopAPI.getLibrary();
          const tIpc = performance.now();
          const json = JSON.stringify(lib);
          const tJson = performance.now();

          let base64Bytes = 0;
          for (const g of lib) {
            for (const key of ['posterUrl', 'backdropUrl', 'iconUrl', 'localIconUrl', 'otixPosterUrl', 'otixBackdropUrl']) {
              if (typeof g[key] === 'string' && g[key].startsWith('data:')) base64Bytes += g[key].length;
            }
            if (g.data) {
              for (const key of ['posterUrl', 'backdropUrl', 'iconUrl', 'logoUrl']) {
                if (typeof g.data[key] === 'string' && g.data[key].startsWith('data:')) base64Bytes += g.data[key].length;
              }
            }
          }

          return {
            gamesCount: lib.length,
            ipcFetchDurationMs: (tIpc - t0).toFixed(2),
            jsonStringifyDurationMs: (tJson - tIpc).toFixed(2),
            totalPayloadMb: (json.length / 1024 / 1024).toFixed(2),
            base64Mb: (base64Bytes / 1024 / 1024).toFixed(2),
            base64Pct: ((base64Bytes / json.length) * 100).toFixed(1),
          };
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });

      // 3. Database size on disk
      let dbSizeMb = 'N/A';
      const appData = process.env.APPDATA || '';
      for (const sub of ['desktop', 'otix', 'Otix', 'otix-desktop']) {
        const candidate = path.join(appData, sub, 'otix.db');
        if (fs.existsSync(candidate)) {
          const stats = fs.statSync(candidate);
          dbSizeMb = (stats.size / 1024 / 1024).toFixed(2);
          break;
        }
      }

      const results = {
        timestamp: new Date().toISOString(),
        sqliteDbSizeMb: dbSizeMb,
        storage: evalRes.result.result.value,
        library: libRes.result.result.value,
      };

      console.log(JSON.stringify(results, null, 2));
      ws.close();
      process.exit(0);
    } catch (err) {
      console.error(err);
      ws.close();
      process.exit(1);
    }
  };
}

measure();

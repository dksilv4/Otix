const TARGET_URL = 'http://127.0.0.1:9222/json/list';

async function run() {
  const res = await fetch(TARGET_URL);
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page');
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

      const libRes = await send('Runtime.evaluate', {
        expression: `(async () => {
          const t0 = performance.now();
          const lib = await window.desktopAPI.getLibrary();
          const tIpc = performance.now();
          const json = JSON.stringify(lib);
          const tJson = performance.now();

          // Calculate breakdown of base64 vs normal text
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
            totalPayloadMb: (json.length / 1024 / 1024).toFixed(2) + ' MB',
            base64PortionMb: (base64Bytes / 1024 / 1024).toFixed(2) + ' MB',
            base64Percentage: ((base64Bytes / json.length) * 100).toFixed(1) + '%'
          };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('Library Payload Metrics:', JSON.stringify(libRes.result.result.value, null, 2));

      ws.close();
      process.exit(0);
    } catch (err) {
      console.error(err);
      ws.close();
      process.exit(1);
    }
  };
}

run();

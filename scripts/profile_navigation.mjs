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
      await send('Profiler.enable');

      console.log('Profiling interaction: navigating to Discover and back...');
      await send('Profiler.start');

      // Navigate to /discover
      await send('Runtime.evaluate', {
        expression: `window.location.hash = ''; window.history.pushState({}, '', '/discover'); window.dispatchEvent(new PopStateEvent('popstate'));`
      });

      await new Promise(r => setTimeout(r, 2000));

      // Navigate back to launcher
      await send('Runtime.evaluate', {
        expression: `window.history.pushState({}, '', '/launcher/pc_file_6ad6abd82277'); window.dispatchEvent(new PopStateEvent('popstate'));`
      });

      await new Promise(r => setTimeout(r, 2000));

      const profileRes = await send('Profiler.stop');
      const profile = profileRes.result.profile;
      const nodeMap = new Map();
      for (const node of profile.nodes) nodeMap.set(node.id, node);

      const samples = profile.samples || [];
      const timeDeltas = profile.timeDeltas || [];
      const hitCounts = new Map();
      const timePerNode = new Map();

      for (let i = 0; i < samples.length; i++) {
        const nodeId = samples[i];
        const dt = timeDeltas[i] || 0;
        hitCounts.set(nodeId, (hitCounts.get(nodeId) || 0) + 1);
        timePerNode.set(nodeId, (timePerNode.get(nodeId) || 0) + dt);
      }

      const sorted = Array.from(timePerNode.entries())
        .map(([id, timeUs]) => {
          const n = nodeMap.get(id);
          return {
            name: n.callFrame.functionName || '(anonymous)',
            url: n.callFrame.url ? n.callFrame.url.split('/').slice(-2).join('/') : '',
            line: n.callFrame.lineNumber,
            selfTimeMs: (timeUs / 1000).toFixed(1),
            timeUs,
            hits: hitCounts.get(id) || 0
          };
        })
        .sort((a, b) => b.timeUs - a.timeUs);

      console.log('\n=== TOP 25 CPU CONSUMING FUNCTIONS DURING NAVIGATION ===');
      console.log(sorted.slice(0, 25).map(s => 
        `${s.selfTimeMs.padStart(7)}ms (${String(s.hits).padStart(4)} hits) | ${s.name} @ ${s.url}:${s.line}`
      ).join('\n'));

      // Check current memory
      const memRes = await send('Runtime.evaluate', {
        expression: `({
          usedHeapMb: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1),
          totalHeapMb: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1)
        })`,
        returnByValue: true
      });
      console.log('\nCurrent Memory:', memRes.result.result.value);

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

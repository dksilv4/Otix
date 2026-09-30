package games

// WebOverlayHTML contains the self-contained HTML/CSS/JS page served at /api/v1/games/overlay
const WebOverlayHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Otix In-Game Overlay</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
    }
    body {
      background: transparent;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
    }
    .pos-top-left { align-items: flex-start; justify-content: flex-start; padding: 20px; }
    .pos-top-right { align-items: flex-start; justify-content: flex-end; padding: 20px; }
    .pos-bottom-left { align-items: flex-end; justify-content: flex-start; padding: 20px; }
    .pos-bottom-right { align-items: flex-end; justify-content: flex-end; padding: 20px; }

    .hud-card {
      background: rgba(15, 23, 42, 0.82);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      padding: 12px 18px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.2);
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 220px;
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .hud-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 6px;
    }
    .otix-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #38bdf8;
    }
    .otix-dot {
      width: 7px;
      height: 7px;
      background: #38bdf8;
      border-radius: 50%;
      box-shadow: 0 0 8px #38bdf8;
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.6; transform: scale(0.9); }
      50% { opacity: 1; transform: scale(1.2); }
    }
    .game-title {
      font-size: 12px;
      font-weight: 600;
      color: #cbd5e1;
      max-width: 140px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hud-main {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .fps-val {
      font-size: 38px;
      font-weight: 800;
      font-feature-settings: "tnum";
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .fps-good { color: #4ade80; text-shadow: 0 0 12px rgba(74, 222, 128, 0.4); }
    .fps-mid { color: #facc15; text-shadow: 0 0 12px rgba(250, 204, 21, 0.4); }
    .fps-low { color: #f87171; text-shadow: 0 0 12px rgba(248, 113, 113, 0.4); }
    .fps-label {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .hud-metrics {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px 12px;
      font-size: 11px;
      color: #94a3b8;
      background: rgba(0, 0, 0, 0.25);
      border-radius: 8px;
      padding: 6px 10px;
    }
    .hud-metrics div span {
      font-weight: 700;
      color: #e2e8f0;
      font-feature-settings: "tnum";
    }
    .hud-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .playtime-val {
      color: #cbd5e1;
      font-weight: 600;
      font-feature-settings: "tnum";
    }
    .sparkline {
      width: 100%;
      height: 24px;
      stroke: #38bdf8;
      fill: none;
      stroke-width: 1.5;
    }
  </style>
</head>
<body class="pos-top-left" id="hudContainer">
  <div class="hud-card" id="hudCard">
    <div class="hud-header">
      <div class="otix-badge">
        <span class="otix-dot"></span> OTIX
      </div>
      <div class="game-title" id="gameTitle">No Game Running</div>
    </div>
    <div class="hud-main">
      <div class="fps-val fps-good" id="fpsDisplay">--</div>
      <div class="fps-label">FPS</div>
    </div>
    <svg class="sparkline" id="sparklineSvg" viewBox="0 0 200 24" preserveAspectRatio="none">
      <polyline id="sparklinePoly" points="0,12 200,12" />
    </svg>
    <div class="hud-metrics">
      <div>1% Low: <span id="low1Display">--</span></div>
      <div>Avg: <span id="avgDisplay">--</span></div>
    </div>
    <div class="hud-footer">
      <span>Playtime</span>
      <span class="playtime-val" id="playtimeDisplay">00:00:00</span>
    </div>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    const pos = params.get('pos') || 'top-left';
    document.body.className = 'pos-' + pos;

    const fpsDisplay = document.getElementById('fpsDisplay');
    const low1Display = document.getElementById('low1Display');
    const avgDisplay = document.getElementById('avgDisplay');
    const gameTitle = document.getElementById('gameTitle');
    const playtimeDisplay = document.getElementById('playtimeDisplay');
    const poly = document.getElementById('sparklinePoly');

    const history = [];
    const maxHistory = 40;

    function formatTime(totalSec) {
      const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
      const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
      const s = Math.floor(totalSec % 60).toString().padStart(2, '0');
      return h + ':' + m + ':' + s;
    }

    function updateSparkline(fps) {
      history.push(fps);
      if (history.length > maxHistory) history.shift();
      const max = Math.max(120, ...history);
      const min = Math.min(30, ...history);
      const range = (max - min) || 1;

      const pts = history.map((val, idx) => {
        const x = (idx / (maxHistory - 1)) * 200;
        const norm = (val - min) / range;
        const y = 22 - (norm * 20);
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');

      poly.setAttribute('points', pts);
    }

    function applyFps(fps) {
      fpsDisplay.textContent = Math.round(fps);
      fpsDisplay.className = 'fps-val ' + (fps >= 60 ? 'fps-good' : (fps >= 30 ? 'fps-mid' : 'fps-low'));
    }

    // Connect to live SSE stream
    function connectSse() {
      const evtSource = new EventSource('/api/v1/games/fps/live');
      evtSource.onmessage = (e) => {
        try {
          const snap = JSON.parse(e.data);
          if (snap && snap.fps !== undefined) {
            applyFps(snap.fps);
            if (snap.low_1_percent) low1Display.textContent = Math.round(snap.low_1_percent);
            if (snap.avg_fps) avgDisplay.textContent = Math.round(snap.avg_fps);
            updateSparkline(snap.fps);
          }
        } catch (err) {}
      };
      evtSource.onerror = () => {
        evtSource.close();
        setTimeout(connectSse, 3000);
      };
    }

    // Poll running game metadata (playtime, title)
    function pollRunning() {
      fetch('/api/v1/games/running')
        .then(res => res.json())
        .then(data => {
          if (data && data.running && data.game) {
            gameTitle.textContent = data.game.title || data.game.process_name;
            playtimeDisplay.textContent = formatTime(data.game.current_duration_seconds || 0);
            if (data.game.fps_snapshot && data.game.fps_snapshot.fps) {
              applyFps(data.game.fps_snapshot.fps);
            }
          } else {
            gameTitle.textContent = 'No Game Running';
          }
        })
        .catch(() => {})
        .finally(() => setTimeout(pollRunning, 1000));
    }

    connectSse();
    pollRunning();
  </script>
</body>
</html>`

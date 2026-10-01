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
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
    }
    .pos-top-left { align-items: flex-start; justify-content: flex-start; padding: 20px; }
    .pos-top-right { align-items: flex-start; justify-content: flex-end; padding: 20px; }
    .pos-bottom-left { align-items: flex-end; justify-content: flex-start; padding: 20px; }
    .pos-bottom-right { align-items: flex-end; justify-content: flex-end; padding: 20px; }

    /* Otix Refined Glass Surface */
    .hud-card {
      background: rgba(14, 15, 19, 0.78);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border-radius: 14px;
      padding: 10px 14px;
      box-shadow:
        inset 0 1px 0 0 rgba(255, 255, 255, 0.08),
        0 16px 36px -6px rgba(0, 0, 0, 0.55),
        0 4px 12px -2px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-width: 195px;
      cursor: pointer;
      transition: opacity 0.2s ease, transform 0.2s ease, border-radius 0.2s ease;
    }
    .hud-card:hover {
      background: rgba(18, 19, 24, 0.84);
    }

    /* Main FPS */
    .hud-main {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }
    .fps-group {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .fps-val {
      font-size: 32px;
      font-weight: 700;
      font-feature-settings: "tnum";
      font-variant-numeric: tabular-nums;
      line-height: 1;
      letter-spacing: -0.03em;
      color: rgba(255, 255, 255, 0.95);
    }
    .fps-good { color: rgba(255, 255, 255, 0.95); }
    .fps-mid { color: #fde047; }
    .fps-low { color: #f87171; }
    .fps-label {
      font-size: 10px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.3);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .frametime-pill {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      font-feature-settings: "tnum";
      font-variant-numeric: tabular-nums;
    }

    /* Refined Sparkline */
    .sparkline-box {
      width: 100%;
      height: 20px;
      position: relative;
      margin: 1px 0;
    }
    .sparkline {
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    /* Metrics Strip */
    .hud-metrics {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-top: 5px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    .metric-item {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .metric-label {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.35);
    }
    .metric-value {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.8);
      font-feature-settings: "tnum";
      font-variant-numeric: tabular-nums;
    }

    /* Compact Pill Mode */
    .hud-card.compact {
      flex-direction: row;
      align-items: center;
      padding: 6px 14px;
      gap: 12px;
      border-radius: 9999px;
      min-width: auto;
    }
    .hud-card.compact .sparkline-box,
    .hud-card.compact .frametime-pill,
    .hud-card.compact .metric-label {
      display: none;
    }
    .hud-card.compact .hud-main {
      gap: 8px;
    }
    .hud-card.compact .fps-val {
      font-size: 15px;
      font-weight: 700;
    }
    .hud-card.compact .hud-metrics {
      padding-top: 0;
      border-top: none;
      gap: 10px;
    }
    .hud-card.compact .metric-item {
      flex-direction: row;
      gap: 4px;
      align-items: baseline;
    }
    .hud-card.compact .metric-item::before {
      content: "·";
      color: rgba(255, 255, 255, 0.25);
      margin-right: 4px;
    }
    .hud-card.compact .metric-value {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.7);
    }
  </style>
</head>
<body class="pos-top-left" id="hudContainer">
  <div class="hud-card" id="hudCard" title="Click or press M to toggle Compact Pill mode">
    <div class="hud-main">
      <div class="fps-group">
        <div class="fps-val fps-good" id="fpsDisplay">--</div>
        <div class="fps-label">FPS</div>
      </div>
      <div class="frametime-pill" id="frametimeDisplay">-- ms</div>
    </div>
    <div class="sparkline-box">
      <svg class="sparkline" id="sparklineSvg" viewBox="0 0 200 24" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <path id="sparklineArea" d="" fill="url(#spark-grad)" />
        <path id="sparklineLine" d="" fill="none" stroke="#38bdf8" stroke-width="1.2" stroke-opacity="0.8" />
      </svg>
    </div>
    <div class="hud-metrics">
      <div class="metric-item">
        <span class="metric-label">1% Low</span>
        <span class="metric-value" id="low1Display">--</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Avg</span>
        <span class="metric-value" id="avgDisplay">--</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Time</span>
        <span class="metric-value" id="playtimeDisplay">00:00:00</span>
      </div>
    </div>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    const pos = params.get('pos') || 'top-left';
    document.body.className = 'pos-' + pos;

    const hudCard = document.getElementById('hudCard');
    const fpsDisplay = document.getElementById('fpsDisplay');
    const frametimeDisplay = document.getElementById('frametimeDisplay');
    const low1Display = document.getElementById('low1Display');
    const avgDisplay = document.getElementById('avgDisplay');
    const playtimeDisplay = document.getElementById('playtimeDisplay');
    const sparkArea = document.getElementById('sparklineArea');
    const sparkLine = document.getElementById('sparklineLine');

    if (params.get('mode') === 'compact') {
      hudCard.classList.add('compact');
    }

    // Toggle compact on click or 'm' key
    hudCard.addEventListener('click', () => {
      hudCard.classList.toggle('compact');
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        hudCard.classList.toggle('compact');
      }
    });

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
      if (history.length < 2) return;

      const max = Math.max(120, ...history);
      const min = Math.min(30, ...history);
      const range = (max - min) || 1;

      const pts = history.map((val, idx) => {
        const x = (idx / (history.length - 1)) * 200;
        const norm = (val - min) / range;
        const y = 22 - (norm * 20);
        return [x.toFixed(1), y.toFixed(1)];
      });

      const lineD = 'M ' + pts.map(p => p[0] + ',' + p[1]).join(' L ');
      const areaD = lineD + ' L 200,24 L 0,24 Z';

      sparkLine.setAttribute('d', lineD);
      sparkArea.setAttribute('d', areaD);
    }

    function applyFps(fps) {
      const rounded = Math.round(fps);
      fpsDisplay.textContent = rounded > 0 ? rounded : '--';
      fpsDisplay.className = 'fps-val ' + (fps >= 60 ? 'fps-good' : (fps >= 35 ? 'fps-mid' : 'fps-low'));
      if (fps > 0) {
        frametimeDisplay.textContent = (1000 / fps).toFixed(1) + ' ms';
      } else {
        frametimeDisplay.textContent = '-- ms';
      }
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

    // Poll running game metadata (playtime, status)
    function pollRunning() {
      fetch('/api/v1/games/running')
        .then(res => res.json())
        .then(data => {
          if (data && data.running && data.game) {
            playtimeDisplay.textContent = formatTime(data.game.current_duration_seconds || 0);
            if (data.game.fps_snapshot && data.game.fps_snapshot.fps) {
              applyFps(data.game.fps_snapshot.fps);
            }
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

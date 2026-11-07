package webui

import (
	"fmt"
	"html"
	"strings"

	"github.com/dksilv4/otix/node/internal/indexer"
)

// renderDashboardFileRows generates HTML table rows for indexed hosted files.
func renderDashboardFileRows(files []indexer.HostedFile, authToken string) string {
	var sb strings.Builder
	for _, f := range files {
		sizeMB := float64(f.Filesize) / (1024 * 1024)
		sb.WriteString(fmt.Sprintf(`
        <tr class="game-row" data-title="%s" data-format="%s">
          <td style="padding: 14px 16px; font-weight: 600; color: #fff;">%s</td>
          <td style="padding: 14px 16px; color: #a1a1aa; font-family: 'JetBrains Mono', monospace; font-size: 12px;">%s</td>
          <td style="padding: 14px 16px;"><span class="badge-tag">%s</span></td>
          <td style="padding: 14px 16px; color: #a1a1aa; font-size: 13px;">%.2f MB</td>
          <td style="padding: 14px 16px; text-align: right;"><a href="/api/v1/files/%s/download?token=%s" class="btn-download">Download</a></td>
        </tr>`,
			strings.ToLower(html.EscapeString(f.GameTitle+" "+f.Filename)),
			strings.ToLower(html.EscapeString(f.FormatCategory)),
			html.EscapeString(f.GameTitle),
			html.EscapeString(f.Filename),
			html.EscapeString(f.FormatCategory),
			sizeMB,
			html.EscapeString(f.ID),
			html.EscapeString(authToken),
		))
	}
	return sb.String()
}

// renderDashboardCSS returns the CSS style definitions for the node dashboard.
func renderDashboardCSS() string {
	return `<style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0e0e11;
      background-image: 
        radial-gradient(ellipse 60% 50% at 50% -5%, rgba(249, 115, 22, 0.1), transparent 70%),
        radial-gradient(ellipse 50% 40% at 90% 90%, rgba(249, 115, 22, 0.04), transparent 60%);
      background-attachment: fixed;
      color: #f4f4f5;
      min-height: 100vh;
      padding-bottom: 4rem;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }

    /* Navbar */
    .top-nav {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(14, 14, 17, 0.8);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.5);
      padding: 0.85rem 1.5rem;
    }
    .nav-inner {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo-nav {
      width: 28px;
      height: 28px;
      color: #f97316;
      filter: drop-shadow(0 0 10px rgba(249, 115, 22, 0.35));
    }
    .brand-title {
      font-size: 0.95rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .node-pill {
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.06);
      padding: 3px 8px;
      border-radius: 6px;
      color: #d4d4d8;
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .nav-link {
      font-size: 0.8rem;
      font-weight: 600;
      color: #a1a1aa;
      padding: 6px 12px;
      border-radius: 8px;
      transition: all 0.2s;
    }
    .nav-link:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.05);
    }
    .btn-app {
      background: #f97316;
      color: #fff;
      font-size: 0.8rem;
      font-weight: 700;
      padding: 7px 15px;
      border-radius: 9px;
      box-shadow: 0 4px 14px rgba(249, 115, 22, 0.35);
      transition: all 0.2s;
    }
    .btn-app:hover {
      background: #ea580c;
      transform: translateY(-1px);
    }
    .btn-unclaim-nav {
      background: rgba(239, 68, 68, 0.1);
      border: none;
      color: #f87171;
      font-size: 0.8rem;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-unclaim-nav:hover {
      background: rgba(239, 68, 68, 0.2);
    }

    /* Main Layout */
    .main-wrap {
      max-width: 1100px;
      margin: 1.75rem auto 0;
      padding: 0 1.5rem;
    }

    /* Glass Cards */
    .glass-card {
      background: rgba(255, 255, 255, 0.025);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border-radius: 24px;
      padding: 1.75rem;
      margin-bottom: 1.5rem;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 20px 48px -15px rgba(0, 0, 0, 0.65);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .stat-card {
      background: rgba(255, 255, 255, 0.025);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 24px -8px rgba(0, 0, 0, 0.5);
      border-radius: 18px;
      padding: 1.25rem 1.35rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .stat-label {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #71717a;
    }
    .stat-val {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .stat-sub {
      font-size: 0.78rem;
      color: #a1a1aa;
    }

    /* Status badge */
    .badge-online {
      display: inline-flex;
      align-items: center;
      background: rgba(34, 197, 94, 0.12);
      color: #4ade80;
      padding: 3px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* Section Headers */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .section-title {
      font-size: 1.15rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .section-desc {
      font-size: 0.82rem;
      color: #a1a1aa;
      margin-top: 2px;
    }

    /* Controls & Buttons */
    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      border: none;
      color: #e4e4e7;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 7px 14px;
      border-radius: 9px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    .btn-primary-sm {
      background: #f97316;
      border: none;
      color: #fff;
      font-size: 0.78rem;
      font-weight: 700;
      padding: 7px 16px;
      border-radius: 9px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(249, 115, 22, 0.35);
      transition: all 0.2s;
    }
    .btn-primary-sm:hover {
      background: #ea580c;
    }
    .btn-download {
      background: rgba(249, 115, 22, 0.12);
      color: #f97316;
      padding: 5px 12px;
      border-radius: 7px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      transition: all 0.2s;
    }
    .btn-download:hover {
      background: rgba(249, 115, 22, 0.22);
      color: #fff;
    }

    /* Table */
    .table-container {
      overflow-x: auto;
      border-radius: 14px;
      background: rgba(0, 0, 0, 0.2);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.02);
      color: #71717a;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    tr.game-row {
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      transition: background 0.15s;
    }
    tr.game-row:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    .badge-tag {
      background: rgba(255, 255, 255, 0.06);
      color: #d4d4d8;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Search Input */
    .search-bar {
      width: 100%;
      max-width: 320px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      color: #f4f4f5;
      font-size: 0.8rem;
      padding: 8px 12px;
      outline: none;
      transition: all 0.2s;
    }
    .search-bar:focus {
      border-color: rgba(249, 115, 22, 0.6);
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
    }

    /* Settings Pods */
    .settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.25rem;
    }
    .settings-pod {
      background: rgba(0, 0, 0, 0.25);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
      border-radius: 16px;
      padding: 1.25rem;
    }
    .pod-title {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #71717a;
      margin-bottom: 0.85rem;
    }
    .field-label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      color: #d4d4d8;
      margin-bottom: 4px;
    }
    .field-input, .field-select {
      width: 100%;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      color: #f4f4f5;
      font-size: 0.85rem;
      padding: 8px 12px;
      outline: none;
      margin-bottom: 12px;
      transition: all 0.2s;
    }
    .field-input:focus, .field-select:focus {
      border-color: rgba(249, 115, 22, 0.6);
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
    }

    /* Switch */
    .switch-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 0.82rem;
      color: #d4d4d8;
      margin-bottom: 10px;
      cursor: pointer;
    }
    .switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
      flex-shrink: 0;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(255, 255, 255, 0.1);
      transition: 0.25s;
      border-radius: 20px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.25s;
      border-radius: 50%;
    }
    input:checked + .slider {
      background-color: #f97316;
    }
    input:checked + .slider:before {
      transform: translateX(16px);
    }

    /* Toast */
    #toast-msg {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #18181b;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
      color: #fff;
      padding: 10px 18px;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 600;
      display: none;
      z-index: 100;
    }
  </style>`
}

// renderDashboardBody formats the main HTML body content for the dashboard.
func renderDashboardBody(serverName, claimedText, claimedAccount, registryURL, rows string, totalFiles, hours, minutes, port int) string {
	return fmt.Sprintf(`  <!-- Navigation Header -->
  <nav class="top-nav">
    <div class="nav-inner">
      <div class="brand-wrap">
        <div class="brand-logo-nav">
          `+otixLogoSVG+`
        </div>
        <span class="brand-title">Otix Node</span>
        <span class="node-pill">%s</span>
      </div>

      <div class="nav-actions">
        <a href="#overview" class="nav-link">Overview</a>
        <a href="#games" class="nav-link">Games</a>
        <a href="#settings" class="nav-link">Settings</a>
        <a href="https://app.otix.io/settings/nodes" target="_blank" class="btn-app">Open in Otix</a>
        <button type="button" id="btn-unclaim-node" class="btn-unclaim-nav">Unclaim</button>
      </div>
    </div>
  </nav>

  <main class="main-wrap">
    <!-- Hero / Status Card -->
    <div class="glass-card" id="overview">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <h1 style="font-size: 1.65rem; font-weight: 800; letter-spacing: -0.03em;">%s</h1>
            <span class="badge-online">Online</span>
          </div>
          <p style="color: #a1a1aa; font-size: 0.85rem; line-height: 1.5;">
            Otix Go Companion Daemon &middot; %s &middot; Linked to %s
          </p>
        </div>
      </div>
    </div>

    <!-- Quick Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Hosted Games</span>
        <span class="stat-val">%d</span>
        <span class="stat-sub">Indexed across local folders</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Daemon Uptime</span>
        <span class="stat-val">%dh %dm</span>
        <span class="stat-sub">Running continuously</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Node Endpoint</span>
        <span class="stat-val" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; color: #f97316;">:%d</span>
        <span class="stat-sub">http://127.0.0.1:%d</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Registry Backend</span>
        <span class="stat-val" style="font-size: 0.95rem; font-family: 'JetBrains Mono', monospace; color: #d4d4d8; word-break: break-all;">%s</span>
        <span class="stat-sub">Heartbeat target</span>
      </div>
    </div>

    <!-- Hosted Games Card -->
    <div class="glass-card" id="games">
      <div class="section-header">
        <div>
          <h2 class="section-title">Hosted Game Installers &amp; ISOs</h2>
          <p class="section-desc">Local game archives indexed and served by this Otix companion daemon.</p>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="game-search" class="search-bar" placeholder="Search games..." oninput="filterGames()" />
          <button type="button" id="btn-clear-scan" class="btn-secondary">Clear</button>
          <button type="button" id="btn-rescan" class="btn-primary-sm">Rescan Library</button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Filename</th>
              <th>Format</th>
              <th>Size</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody id="games-tbody">
            %s
          </tbody>
        </table>
      </div>
    </div>

    <!-- Settings & Configuration Card -->
    <div class="glass-card" id="settings">
      <div class="section-header">
        <div>
          <h2 class="section-title">Node Configuration</h2>
          <p class="section-desc">Manage daemon identity, directories, and in-game HUD overlay preferences.</p>
        </div>
        <button type="button" id="btn-save-settings" class="btn-primary-sm" style="padding: 8px 20px;">Save Changes</button>
      </div>

      <form id="settings-form" class="settings-grid" onsubmit="return false;">
        <!-- Node Identity & Network -->
        <div class="settings-pod">
          <div class="pod-title">Identity &amp; Network</div>
          <label class="field-label" for="set-name">Server / Node Name</label>
          <input type="text" id="set-name" class="field-input" value="%s" />

          <div style="font-size: 0.78rem; color: #71717a; margin-top: 4px;">
            Listening Port: <strong style="color: #f97316;">%d</strong> <span style="font-size: 0.72rem;">(Static)</span>
          </div>

          <div style="margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span class="field-label" style="margin-bottom:0;">Access Token</span>
              <div style="display: flex; gap: 6px;">
                <button type="button" id="btn-toggle-token" style="background: none; border: none; color: #a1a1aa; font-size: 11px; cursor: pointer;">Show</button>
                <button type="button" id="btn-copy-token" style="background: none; border: none; color: #f97316; font-size: 11px; cursor: pointer; font-weight: 600;">Copy</button>
              </div>
            </div>
            <div id="token-display" data-shown="0" style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: #71717a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">••••••••••••••••••••••••</div>
          </div>
        </div>

        <!-- Directories & Paths -->
        <div class="settings-pod">
          <div class="pod-title">Directories &amp; Paths</div>
          <label class="field-label" for="set-games-inst">Games Install Path</label>
          <input type="text" id="set-games-inst" class="field-input" placeholder="e.g. C:\Games" />

          <label class="field-label" for="set-games-dl">Games Download Path</label>
          <input type="text" id="set-games-dl" class="field-input" placeholder="e.g. C:\Games\Downloads" />
        </div>

        <!-- In-Game HUD Overlay -->
        <div class="settings-pod">
          <div class="pod-title">In-Game HUD Overlay</div>
          <label class="switch-label">
            <span>Enable Transparent HUD</span>
            <span class="switch">
              <input type="checkbox" id="set-overlay-enabled" />
              <span class="slider"></span>
            </span>
          </label>

          <label class="field-label" for="set-overlay-corner">Corner Position</label>
          <select id="set-overlay-corner" class="field-select">
            <option value="top-wide">Top Wide (Bar HUD)</option>
            <option value="bottom-wide">Bottom Wide (Bar HUD)</option>
            <option value="top-right">Top Right (Compact)</option>
            <option value="top-left">Top Left (Compact)</option>
            <option value="bottom-right">Bottom Right (Compact)</option>
            <option value="bottom-left">Bottom Left (Compact)</option>
          </select>

          <label class="field-label" for="set-overlay-monitor">Display Monitor</label>
          <select id="set-overlay-monitor" class="field-select">
            <option value="auto">Auto (Follow Active Game)</option>
          </select>
        </div>

        <!-- Desktop & Automation -->
        <div class="settings-pod">
          <div class="pod-title">Desktop &amp; Automation</div>
          <label class="switch-label">
            <span>Minimize to Taskbar Tray</span>
            <span class="switch">
              <input type="checkbox" id="set-min-tray" />
              <span class="slider"></span>
            </span>
          </label>

          <label class="switch-label">
            <span>Close to Taskbar Tray</span>
            <span class="switch">
              <input type="checkbox" id="set-close-tray" />
              <span class="slider"></span>
            </span>
          </label>

          <label class="switch-label">
            <span>Auto-backup Saves on Exit</span>
            <span class="switch">
              <input type="checkbox" id="set-auto-backup" />
              <span class="slider"></span>
            </span>
          </label>
        </div>
      </form>
    </div>
  </main>`, serverName, serverName, claimedText, claimedAccount, totalFiles, hours, minutes, port, port, registryURL, rows, serverName, port)
}

// renderDashboardJS returns the client-side JavaScript for the node dashboard.
func renderDashboardJS(authToken string) string {
	return fmt.Sprintf(`  <script>
    const TOKEN = %q;

    function showToast(text) {
      const el = document.getElementById('toast-msg');
      if (!el) return;
      el.textContent = text;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 3000);
    }

    async function authed(path, method, body) {
      const opts = { method };
      if (body) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN), opts);
      if (!res.ok) throw new Error(await res.text());
      return res.json().catch(() => ({}));
    }

    function filterGames() {
      const q = (document.getElementById('game-search')?.value || '').toLowerCase().trim();
      const rows = document.querySelectorAll('.game-row');
      rows.forEach(r => {
        const title = r.dataset.title || '';
        r.style.display = (!q || title.includes(q)) ? '' : 'none';
      });
    }

    async function loadSettings() {
      try {
        const data = await authed('/api/v1/desktop/settings', 'GET');
        if (!data) return;
        if (data.serverName) document.getElementById('set-name').value = data.serverName;
        document.getElementById('set-overlay-enabled').checked = !!data.overlayEnabled;
        if (data.overlayCorner) document.getElementById('set-overlay-corner').value = data.overlayCorner;
        if (data.gamesDownloadPath) document.getElementById('set-games-dl').value = data.gamesDownloadPath;
        if (data.gamesInstallPath) document.getElementById('set-games-inst').value = data.gamesInstallPath;
        document.getElementById('set-min-tray').checked = !!data.minimizeToTray;
        document.getElementById('set-close-tray').checked = !!data.closeToTray;
        document.getElementById('set-auto-backup').checked = !!data.autoBackupOnExit;

        const monSelect = document.getElementById('set-overlay-monitor');
        if (Array.isArray(data.overlayMonitors) && data.overlayMonitors.length > 0) {
          monSelect.innerHTML = '';
          data.overlayMonitors.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            if (m.id === data.overlayMonitor) opt.selected = true;
            monSelect.appendChild(opt);
          });
        }
      } catch (e) {
        console.error('Failed to load desktop settings:', e);
      }
    }
    loadSettings();

    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-save-settings');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        const payload = {
          server_name: document.getElementById('set-name').value,
          overlay_enabled: document.getElementById('set-overlay-enabled').checked,
          overlay_corner: document.getElementById('set-overlay-corner').value,
          overlay_monitor: document.getElementById('set-overlay-monitor').value,
          games_download_path: document.getElementById('set-games-dl').value,
          games_install_path: document.getElementById('set-games-inst').value,
          minimize_to_tray: document.getElementById('set-min-tray').checked,
          close_to_tray: document.getElementById('set-close-tray').checked,
          auto_backup_on_exit: document.getElementById('set-auto-backup').checked,
        };
        await authed('/api/v1/desktop/settings', 'POST', payload);
        showToast('Settings saved successfully');
      } catch (err) {
        showToast('Failed to save settings: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
      }
    });

    document.getElementById('btn-clear-scan')?.addEventListener('click', async () => {
      if (!confirm('Clear the indexed hosted file list? Files on disk are not deleted.')) return;
      try {
        await authed('/api/v1/scan/clear', 'POST');
        window.location.reload();
      } catch (e) { showToast('Clear failed: ' + e.message); }
    });

    document.getElementById('btn-rescan')?.addEventListener('click', async () => {
      try {
        await authed('/api/v1/scan', 'POST');
        showToast('Library scan started...');
        setTimeout(() => window.location.reload(), 1500);
      } catch (e) { showToast('Scan failed: ' + e.message); }
    });

    document.getElementById('btn-unclaim-node')?.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to unclaim this node? It will disconnect from your account and generate a new claim PIN.')) return;
      try {
        await authed('/api/v1/claim/unclaim', 'POST');
        window.location.reload();
      } catch (e) { showToast('Unclaim failed: ' + e.message); }
    });

    document.getElementById('btn-toggle-token')?.addEventListener('click', () => {
      const el = document.getElementById('token-display');
      const btn = document.getElementById('btn-toggle-token');
      if (!el || !btn) return;
      if (el.dataset.shown === '1') {
        el.textContent = '••••••••••••••••••••••••';
        el.dataset.shown = '0';
        btn.textContent = 'Show';
      } else {
        el.textContent = TOKEN;
        el.dataset.shown = '1';
        btn.textContent = 'Hide';
      }
    });

    document.getElementById('btn-copy-token')?.addEventListener('click', () => {
      navigator.clipboard.writeText(TOKEN).then(() => {
        showToast('Access token copied to clipboard');
      }).catch(() => prompt('Copy token:', TOKEN));
    });
  </script>`, authToken)
}

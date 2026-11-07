package webui

import (
	"fmt"
	"html"
	"strings"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/indexer"
)

const otixLogoSVG = `<svg viewBox="0 0 2048 2048" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="1024" cy="1024" r="484" stroke="currentColor" stroke-width="140"/>
  <path d="M1024 1024 C800 652 460 652 420 1024 C460 1396 800 1396 1024 1024 C1248 652 1588 652 1628 1024 C1588 1396 1248 1396 1024 1024" stroke="currentColor" stroke-width="120" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

func RenderHome(cfg *config.AppConfig, claimMgr *claim.ClaimManager, idx *indexer.StorageIndexer, uptimeSeconds int) string {
	status := claimMgr.Status()
	if !status.Claimed {
		return renderClaimWizard(cfg, status)
	}
	return renderDashboard(cfg, idx, uptimeSeconds, status.Username)
}

func renderClaimWizard(cfg *config.AppConfig, status claim.ClaimStatus) string {
	serverName := html.EscapeString(cfg.Server.Name)
	claimCode := html.EscapeString(status.ClaimCode)
	registryURL := html.EscapeString(cfg.Server.RegistryURL)
	if registryURL == "" {
		registryURL = "https://otix.app/api"
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>%s — Otix Node Setup</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0e0e11;
      background-image: 
        radial-gradient(ellipse 60%% 50%% at 50%% -5%%, rgba(249, 115, 22, 0.12), transparent 70%%),
        radial-gradient(ellipse 50%% 40%% at 85%% 90%%, rgba(249, 115, 22, 0.04), transparent 60%%);
      background-attachment: fixed;
      color: #f4f4f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      width: 100%%;
      max-width: 520px;
    }
    .glass-card {
      background: rgba(255, 255, 255, 0.025);
      backdrop-filter: blur(28px) saturate(180%%);
      -webkit-backdrop-filter: blur(28px) saturate(180%%);
      border-radius: 28px;
      padding: 2.5rem 2.25rem;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 60px -15px rgba(0, 0, 0, 0.75);
      text-align: center;
    }
    .brand-logo-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 1.25rem;
      color: #f97316;
      background: rgba(249, 115, 22, 0.1);
      border-radius: 18px;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 24px -4px rgba(249, 115, 22, 0.35);
    }
    .badge-status {
      display: inline-flex;
      align-items: center;
      background: rgba(249, 115, 22, 0.12);
      color: #f97316;
      padding: 4px 14px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.85rem;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 0.35rem;
      color: #fff;
    }
    p.subtitle {
      color: #a1a1aa;
      font-size: 0.88rem;
      line-height: 1.5;
      margin-bottom: 1.75rem;
    }
    .backend-pod {
      background: rgba(0, 0, 0, 0.28);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.03);
      border-radius: 16px;
      padding: 1rem 1.15rem;
      margin-bottom: 1.5rem;
      text-align: left;
    }
    .backend-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.65rem;
    }
    .backend-label {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #71717a;
    }
    .preset-group {
      display: flex;
      gap: 6px;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }
    .preset-pill {
      background: rgba(255, 255, 255, 0.04);
      color: #d4d4d8;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 5px 11px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .preset-pill:hover {
      background: rgba(255, 255, 255, 0.09);
      color: #fff;
    }
    .backend-input-row {
      display: flex;
      gap: 6px;
    }
    .input-clean {
      flex: 1;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      color: #f4f4f5;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      padding: 8px 12px;
      outline: none;
      transition: all 0.2s;
    }
    .input-clean:focus {
      border-color: rgba(249, 115, 22, 0.6);
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
    }
    .btn-apply {
      background: rgba(255, 255, 255, 0.06);
      border: none;
      color: #fff;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 8px 14px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-apply:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    .tabs-bar {
      display: flex;
      background: rgba(0, 0, 0, 0.35);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
      border-radius: 14px;
      padding: 4px;
      margin-bottom: 1.5rem;
      gap: 4px;
    }
    .tab-item {
      flex: 1;
      background: transparent;
      border: none;
      color: #71717a;
      font-size: 0.82rem;
      font-weight: 600;
      padding: 9px 12px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tab-item.active {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    .form-group {
      text-align: left;
      margin-bottom: 1rem;
    }
    .form-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: #a1a1aa;
      margin-bottom: 6px;
    }
    .form-input {
      width: 100%%;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      color: #f4f4f5;
      font-size: 0.88rem;
      padding: 10px 14px;
      outline: none;
      transition: all 0.2s;
    }
    .form-input:focus {
      border-color: rgba(249, 115, 22, 0.6);
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
    }
    .btn-primary {
      width: 100%%;
      background: #f97316;
      border: none;
      color: #fff;
      font-size: 0.88rem;
      font-weight: 700;
      padding: 11px 18px;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 8px 20px -4px rgba(249, 115, 22, 0.38);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      margin-top: 0.5rem;
    }
    .btn-primary:hover {
      background: #ea580c;
      box-shadow: 0 10px 24px -4px rgba(249, 115, 22, 0.48);
      transform: translateY(-1px);
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .pin-card {
      background: rgba(0, 0, 0, 0.3);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 1.25rem;
      position: relative;
    }
    .pin-label {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #71717a;
      margin-bottom: 0.5rem;
    }
    .pin-code-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 0.75rem;
    }
    .pin-digits {
      font-family: 'JetBrains Mono', monospace;
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      color: #f97316;
      text-shadow: 0 0 28px rgba(249, 115, 22, 0.4);
    }
    .btn-copy {
      background: rgba(255, 255, 255, 0.06);
      border: none;
      color: #e4e4e7;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-copy:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    .pin-timer {
      font-size: 0.75rem;
      color: #71717a;
    }
    .alert-box {
      border-radius: 12px;
      padding: 0.75rem 1rem;
      font-size: 0.8rem;
      font-weight: 500;
      margin-bottom: 1rem;
      text-align: left;
    }
    .alert-error {
      background: rgba(239, 68, 68, 0.12);
      color: #fca5a5;
    }
    .alert-success {
      background: rgba(34, 197, 94, 0.12);
      color: #86efac;
    }
    .info-callout {
      background: rgba(255, 255, 255, 0.02);
      border-radius: 12px;
      padding: 0.85rem 1rem;
      font-size: 0.78rem;
      color: #71717a;
      line-height: 1.5;
      text-align: left;
      margin-top: 1rem;
    }
    .instructions-list {
      text-align: left;
      margin-bottom: 1.25rem;
      font-size: 0.82rem;
      color: #a1a1aa;
      line-height: 1.6;
      padding-left: 1.2rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="glass-card">
      <div class="brand-logo-icon">
        ` + otixLogoSVG + `
      </div>

      <div class="badge-status">Unclaimed Server</div>
      <h1>%s</h1>
      <p class="subtitle">Otix Companion Node &middot; Link this daemon to host your game libraries, streams, and downloads.</p>

      <!-- Backend Target Pod -->
      <div class="backend-pod">
        <div class="backend-header">
          <span class="backend-label">Otix Backend Instance</span>
          <span id="backendStatus" style="color: #f97316; font-size: 0.72rem; font-weight: 700; display: none;">Saved!</span>
        </div>
        <div class="preset-group">
          <button type="button" class="preset-pill" onclick="selectPreset('https://otix.app/api')">Otix Cloud</button>
          <button type="button" class="preset-pill" onclick="selectPreset('http://127.0.0.1:8000/api')">Localhost (8000)</button>
          <button type="button" class="preset-pill" onclick="document.getElementById('backendInput').focus()">Custom</button>
        </div>
        <div class="backend-input-row">
          <input type="text" id="backendInput" class="input-clean" value="%s" placeholder="https://otix.app/api" />
          <button type="button" class="btn-apply" onclick="applyBackend()">Update</button>
        </div>
      </div>

      <!-- Claim Mode Tabs -->
      <div class="tabs-bar">
        <button type="button" class="tab-item active" id="tabLoginBtn" onclick="switchTab('login')">Account Login</button>
        <button type="button" class="tab-item" id="tabPinBtn" onclick="switchTab('pin')">Claim with PIN</button>
      </div>

      <!-- Tab 1: Account Login -->
      <div id="loginSection">
        <form id="claimForm" onsubmit="handleLoginClaim(event)">
          <div id="loginAlert" style="display:none;"></div>
          <div class="form-group">
            <label class="form-label" for="loginUser">Otix Email or Username</label>
            <input class="form-input" type="text" id="loginUser" autocomplete="username" placeholder="gamer@example.com" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="loginPass">Password</label>
            <input class="form-input" type="password" id="loginPass" autocomplete="current-password" placeholder="••••••••" required />
          </div>
          <button type="submit" id="loginBtn" class="btn-primary">Log In &amp; Link Node</button>
        </form>
        <div class="info-callout">
          <strong style="color: #f97316;">Seamless Pairing:</strong> Logs into your Otix account and links this node immediately. No router port forwarding required.
        </div>
      </div>

      <!-- Tab 2: PIN Claim -->
      <div id="pinSection" style="display: none;">
        <div class="pin-card">
          <div class="pin-label">Your Claim PIN</div>
          <div class="pin-code-wrap">
            <div class="pin-digits" id="claimCodeDisplay">%s</div>
            <button type="button" class="btn-copy" onclick="copyPin()">Copy</button>
          </div>
          <div class="pin-timer">Code refreshes in %d seconds</div>
        </div>

        <ol class="instructions-list">
          <li>Open your <strong>Otix App</strong> or Web client at <strong id="pinAnnounceLabel" style="color: #f97316;">%s</strong></li>
          <li>Go to <strong>Settings &rarr; Nodes</strong></li>
          <li>Enter PIN <strong style="color: #f97316;">%s</strong> to link this machine</li>
        </ol>

        <a id="openOtixBtn" href="https://app.otix.io/settings/nodes" target="_blank" class="btn-primary" style="display: block; text-decoration: none; text-align: center;">Open Otix Web to Claim &rarr;</a>

        <div class="info-callout">
          <strong style="color: #f97316;">Live Pairing:</strong> This page automatically detects when you enter the PIN in Otix and transitions to your dashboard.
        </div>
      </div>
    </div>
  </div>

  <script>
    function selectPreset(url) {
      document.getElementById('backendInput').value = url;
      applyBackend();
    }

    async function applyBackend() {
      const url = document.getElementById('backendInput').value.trim();
      const statusEl = document.getElementById('backendStatus');
      try {
        const res = await fetch('/api/v1/claim/backend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registry_url: url })
        });
        const data = await res.json();
        if (res.ok) {
          statusEl.textContent = 'Updated!';
          statusEl.style.display = 'inline';
          document.getElementById('pinAnnounceLabel').textContent = data.registry_url || url;
          setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
        }
      } catch (e) {
        document.getElementById('pinAnnounceLabel').textContent = url;
      }
    }

    function switchTab(name) {
      const isLogin = name === 'login';
      document.getElementById('loginSection').style.display = isLogin ? 'block' : 'none';
      document.getElementById('pinSection').style.display = isLogin ? 'none' : 'block';
      document.getElementById('tabLoginBtn').classList.toggle('active', isLogin);
      document.getElementById('tabPinBtn').classList.toggle('active', !isLogin);
    }

    function copyPin() {
      const code = document.getElementById('claimCodeDisplay').textContent.trim();
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector('.btn-copy');
        if (btn) {
          const old = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = old; }, 2000);
        }
      }).catch(() => prompt('Copy PIN:', code));
    }

    async function handleLoginClaim(e) {
      e.preventDefault();
      const btn = document.getElementById('loginBtn');
      const alertEl = document.getElementById('loginAlert');
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      const registryUrl = document.getElementById('backendInput').value.trim();

      alertEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Linking Node...';

      try {
        const res = await fetch('/api/v1/claim/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username,
            password: password,
            registry_url: registryUrl,
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Claiming failed');

        alertEl.className = 'alert-box alert-success';
        alertEl.textContent = 'Success! Node claimed. Loading dashboard...';
        alertEl.style.display = 'block';
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        alertEl.className = 'alert-box alert-error';
        alertEl.textContent = err.message || 'An error occurred during claim.';
        alertEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Log In & Link Node';
      }
    }

    setInterval(async () => {
      try {
        const res = await fetch('/api/v1/claim/status');
        const data = await res.json();
        if (data.claimed) window.location.reload();
      } catch (e) {}
    }, 2000);
  </script>
</body>
</html>`, serverName, serverName, registryURL, claimCode, status.ExpiresIn, registryURL, claimCode)
}

func renderDashboard(cfg *config.AppConfig, idx *indexer.StorageIndexer, uptimeSeconds int, username string) string {
	serverName := html.EscapeString(cfg.Server.Name)
	registryURL := html.EscapeString(cfg.Server.RegistryURL)
	if registryURL == "" {
		registryURL = "https://otix.app/api"
	}
	files := idx.Files()
	hours := uptimeSeconds / 3600
	minutes := (uptimeSeconds % 3600) / 60

	claimedText := "Claimed &amp; Linked"
	claimedAccount := "your Otix account"
	if strings.TrimSpace(username) != "" {
		claimedText = fmt.Sprintf("Claimed by <strong>%s</strong>", html.EscapeString(username))
		claimedAccount = fmt.Sprintf("account: <strong>%s</strong>", html.EscapeString(username))
	}

	rows := renderDashboardFileRows(files, cfg.Server.AuthToken)
	css := renderDashboardCSS()
	body := renderDashboardBody(serverName, claimedText, claimedAccount, registryURL, rows, len(files), hours, minutes, cfg.Server.Port)
	js := renderDashboardJS(cfg.Server.AuthToken)

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>%s — Otix Node</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet">
%s
</head>
<body>
%s
  <div id="toast-msg"></div>
%s
</body>
</html>`, serverName, css, body, js)
}

func CleanPath(path string) string {
	return strings.TrimSpace(path)
}

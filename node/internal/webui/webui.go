package webui

import (
	"fmt"
	"html"
	"strings"

	"github.com/dksilv4/otix/node/internal/claim"
	"github.com/dksilv4/otix/node/internal/config"
	"github.com/dksilv4/otix/node/internal/indexer"
)

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

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>%s — Setup &amp; Claim</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #09090b;
      color: #f4f4f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 520px;
      width: 100%%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(234, 179, 8, 0.15);
      color: #facc15;
      border: 1px solid rgba(234, 179, 8, 0.3);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1.25rem;
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%%;
      background: #facc15;
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes pulse { 0%%, 100%% { opacity: 1; } 50%% { opacity: .4; } }
    h1 {
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
    }
    p.subtitle {
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 2rem;
    }
    .pin-container {
      background: #09090b;
      border: 2px dashed #3f3f46;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.75rem;
    }
    .pin-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #71717a;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .pin-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 2.75rem;
      font-weight: 900;
      letter-spacing: 0.15em;
      color: #38bdf8;
    }
    .pin-expiry {
      font-size: 0.8rem;
      color: #71717a;
      margin-top: 0.5rem;
    }
    .btn {
      display: inline-block;
      width: 100%%;
      padding: 0.875rem 1.5rem;
      background: #0284c7;
      color: #ffffff;
      font-weight: 700;
      font-size: 1rem;
      border-radius: 10px;
      text-decoration: none;
      transition: background 0.15s ease;
      cursor: pointer;
      border: none;
    }
    .btn:hover { background: #0369a1; }
    .instructions {
      margin-top: 1.5rem;
      font-size: 0.85rem;
      color: #71717a;
      line-height: 1.5;
      text-align: left;
      background: rgba(255, 255, 255, 0.02);
      padding: 1rem;
      border-radius: 8px;
    }
    .instructions ol { padding-left: 1.25rem; }
    .instructions li { margin-bottom: 0.35rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <span class="badge-dot"></span> Unclaimed Server
    </div>
    <h1>%s</h1>
    <p class="subtitle">Claim this node to automatically connect it to your Otix account like Plex.</p>

    <div class="pin-container">
      <div class="pin-label">Your Claim PIN</div>
      <div class="pin-code" id="claimCode">%s</div>
      <div class="pin-expiry">Code expires in %d seconds</div>
    </div>

    <a href="https://app.otix.io/settings/nodes" target="_blank" class="btn">Open Otix Web to Claim</a>

    <div class="instructions">
      <ol>
        <li>Open your <strong>Otix App</strong> or Web client.</li>
        <li>Go to <strong>Settings &rarr; Nodes &rarr; Claim Node</strong>.</li>
        <li>Enter PIN <strong>%s</strong> to link this server instantly.</li>
      </ol>
    </div>

    <div style="margin-top: 1.25rem; font-size: 0.8rem; color: #a1a1aa; line-height: 1.4; text-align: left; background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.15); border-radius: 8px; padding: 0.75rem 1rem;">
      <strong style="color: #38bdf8;">Already claimed this node before?</strong> If this node is already claimed, the user must log in to their Otix account at <a href="https://app.otix.io" target="_blank" style="color: #38bdf8; text-decoration: underline;">app.otix.io</a> or in the Otix Desktop App to automatically reconnect.
    </div>
  </div>
  <script>
    // Poll every 3 seconds to auto-refresh if claimed
    setInterval(async () => {
      try {
        const res = await fetch('/api/v1/claim/status');
        const data = await res.json();
        if (data.claimed) {
          window.location.reload();
        }
      } catch (e) {}
    }, 3000);
  </script>
</body>
</html>`, serverName, serverName, claimCode, status.ExpiresIn, claimCode)
}

func renderDashboard(cfg *config.AppConfig, idx *indexer.StorageIndexer, uptimeSeconds int, username string) string {
	serverName := html.EscapeString(cfg.Server.Name)
	files := idx.Files()
	hours := uptimeSeconds / 3600
	minutes := (uptimeSeconds % 3600) / 60

	claimedText := "Claimed &amp; Linked"
	claimedAccount := "your Otix account"
	if strings.TrimSpace(username) != "" {
		claimedText = fmt.Sprintf("Claimed by <strong>%s</strong>", html.EscapeString(username))
		claimedAccount = fmt.Sprintf("account: <strong>%s</strong>", html.EscapeString(username))
	}

	rows := ""
	for _, f := range files {
		sizeMB := float64(f.Filesize) / (1024 * 1024)
		rows += fmt.Sprintf(`
        <tr style="border-bottom: 1px solid #27272a;">
          <td style="padding: 10px 12px; font-weight: 600;">%s</td>
          <td style="padding: 10px 12px; color: #a1a1aa; font-family: monospace; font-size: 12px;">%s</td>
          <td style="padding: 10px 12px;"><span style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase;">%s</span></td>
          <td style="padding: 10px 12px; color: #a1a1aa;">%.2f MB</td>
          <td style="padding: 10px 12px;"><a href="/api/v1/files/%s/download?token=%s" style="background: #10b981; color: #000; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-decoration: none;">Download</a></td>
        </tr>`,
			html.EscapeString(f.GameTitle),
			html.EscapeString(f.Filename),
			html.EscapeString(f.FormatCategory),
			sizeMB,
			html.EscapeString(f.ID),
			html.EscapeString(cfg.Server.AuthToken),
		)
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>%s — Otix Node</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; margin: 0; padding: 2rem; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .dot { width: 8px; height: 8px; border-radius: 50%%; background: #34d399; }
    table { width: 100%%; border-collapse: collapse; text-align: left; }
    th { padding: 10px 12px; border-bottom: 1px solid #3f3f46; color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <div>
        <h1 style="font-size: 1.5rem; font-weight: 800; margin: 0 0 4px 0;">%s</h1>
        <p style="color: #a1a1aa; margin: 0; font-size: 0.9rem;">Otix Go Companion Daemon &middot; %s</p>
      </div>
      <div class="badge"><span class="dot"></span> Online</div>
    </div>
    <div style="display: flex; gap: 2rem; color: #a1a1aa; font-size: 0.85rem; border-top: 1px solid #27272a; padding-top: 1rem;">
      <div>Indexed Files: <strong style="color: #f4f4f5;">%d</strong></div>
      <div>Uptime: <strong style="color: #f4f4f5;">%dh %dm</strong></div>
      <div>Port: <strong style="color: #f4f4f5;">%d</strong></div>
    </div>
  </div>

  <!-- Reconnect & Account Linking Section -->
  <div class="card" style="border-left: 4px solid #38bdf8;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.25); padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem;">
          Already Claimed &bull; Account Linked
        </div>
        <h2 style="font-size: 1.25rem; font-weight: 800; margin: 0 0 6px 0;">How to Reconnect to this Node</h2>
        <p style="color: #a1a1aa; margin: 0; font-size: 0.9rem; line-height: 1.5;">
          This node is already claimed. If disconnected or switching devices, <strong>the user must log in</strong> to their Otix account to automatically reconnect to it.
        </p>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
        <a href="https://app.otix.io/settings/nodes" target="_blank" style="background: #0284c7; color: #fff; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
          Open Otix Web &rarr;
        </a>
        <button type="button" id="btn-unclaim-node" style="background: transparent; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
          Unclaim Node
        </button>
      </div>
    </div>

    <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid #27272a; border-radius: 10px; padding: 1.25rem; margin-bottom: 1.25rem;">
      <h3 style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin: 0 0 0.75rem 0; font-weight: 700;">Reconnection Instructions</h3>
      <ol style="padding-left: 1.25rem; margin: 0; color: #d4d4d8; font-size: 0.9rem; line-height: 1.7;">
        <li>
          <strong>Log In to Your Otix Account:</strong> The node is permanently registered to %s. If your session expired or you are on another device, <strong>the user must log in</strong> with this account at <a href="https://app.otix.io" target="_blank" style="color: #38bdf8; text-decoration: underline;">app.otix.io</a> or inside the Otix Desktop App.
        </li>
        <li>
          <strong>Automatic Discovery:</strong> Once logged in, your Otix client automatically rediscovers and connects to this node. No new claim PIN is needed.
        </li>
        <li>
          <strong>Verify Node in Settings:</strong> Navigate to <strong>Settings &rarr; Nodes</strong> in your Otix client to confirm this node is connected and online.
        </li>
      </ol>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; font-size: 0.85rem;">
      <div style="background: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 0.875rem;">
        <div style="color: #71717a; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Node Address</div>
        <div style="font-family: monospace; color: #38bdf8; font-weight: 600;">http://127.0.0.1:%d</div>
        <div style="color: #71717a; font-size: 0.75rem; margin-top: 4px;">Local daemon endpoint for downloads and streaming</div>
      </div>
      <div style="background: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 0.875rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="color: #71717a; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Manual Access Token</span>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-toggle-token" style="background: none; border: none; color: #a1a1aa; font-size: 11px; cursor: pointer; padding: 0; text-decoration: underline;">Show</button>
            <button type="button" id="btn-copy-token" style="background: none; border: none; color: #38bdf8; font-size: 11px; cursor: pointer; padding: 0; font-weight: 600;">Copy Token</button>
          </div>
        </div>
        <div id="token-display" data-shown="0" style="font-family: monospace; color: #a1a1aa; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">••••••••••••••••••••••••</div>
        <div style="color: #71717a; font-size: 0.75rem; margin-top: 4px;">Use if adding manually under Settings &rarr; Nodes &rarr; Manual</div>
      </div>
    </div>
  </div>

	<div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; gap: 1rem; flex-wrap: wrap;">
      <h2 style="font-size: 1.1rem; font-weight: 700; margin: 0;">Hosted Game Installers &amp; ISOs</h2>
      <div style="display: flex; gap: 0.5rem;">
        <button type="button" id="btn-clear-scan" style="background: transparent; color: #f4f4f5; border: 1px solid #3f3f46; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">Clear list</button>
        <button type="button" id="btn-rescan" style="background: #0284c7; color: #fff; border: none; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">Rescan</button>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Filename</th>
          <th>Type</th>
          <th>Size</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        %s
      </tbody>
    </table>
  </div>
  <script>
    const TOKEN = %q;
    async function authed(path, method) {
      const res = await fetch(path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN), { method });
      if (!res.ok) throw new Error(await res.text());
      return res.json().catch(() => ({}));
    }
    document.getElementById('btn-clear-scan')?.addEventListener('click', async () => {
      if (!confirm('Clear the indexed hosted file list? Files on disk are not deleted.')) return;
      try {
        await authed('/api/v1/scan/clear', 'POST');
        window.location.reload();
      } catch (e) { alert('Clear failed: ' + e.message); }
    });
    document.getElementById('btn-rescan')?.addEventListener('click', async () => {
      try {
        await authed('/api/v1/scan', 'POST');
        alert('Scan started. Refresh in a moment.');
        setTimeout(() => window.location.reload(), 1500);
      } catch (e) { alert('Scan failed: ' + e.message); }
    });
    document.getElementById('btn-unclaim-node')?.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to unclaim this node? It will disconnect from your account and generate a new claim PIN.')) return;
      try {
        await authed('/api/v1/claim/unclaim', 'POST');
        window.location.reload();
      } catch (e) { alert('Unclaim failed: ' + e.message); }
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
        const btn = document.getElementById('btn-copy-token');
        if (btn) {
          const oldText = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = oldText; }, 2000);
        }
      }).catch(() => {
        prompt('Copy your node access token:', TOKEN);
      });
    });
  </script>
</body>
</html>`, serverName, serverName, claimedText, len(files), hours, minutes, cfg.Server.Port, claimedAccount, cfg.Server.Port, rows, cfg.Server.AuthToken)
}

func CleanPath(path string) string {
	return strings.TrimSpace(path)
}

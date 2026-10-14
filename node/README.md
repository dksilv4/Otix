# Otix Node (`otix-node`)

A lightweight, high-performance Go daemon for hosting game installer files (`.iso`, `.exe`, `.dmg`, `.pkg`, setup packages, repacks, ROMs), managing cloud save backups, and integrating game downloaders (SABnzbd, Prowlarr, Radarr, Sonarr, Epic Games).

---

## Features
- **Zero-Dependency Native Binary**: Single static executable in Go for macOS (Universal 2 DMG), Windows (`.zip`), Linux (x64 / ARM64), Docker, and Unraid.
- **Plex-Style Web Claiming**: Double-clicking the app launches a local browser prompt displaying a 6-character claim PIN for instant 1-click binding to your Otix account.
- **Multi-Threaded HTTP/2 File Server**: Chunked range-request streaming with resume support for large ISO and installer images.
- **Background LaunchAgent & Systemd**: Native background daemons on macOS (`com.otix.node.plist`) and Linux (`otix-node.service`).
- **Cloud Save File Backups**: Versioned game save snapshots with automatic upload on game exit and cross-device restore.
- **Automated Usenet & Arr Services**: Direct node-managed SABnzbd, Prowlarr, Radarr, Sonarr, and Epic Games library sync.

---

## Quick Start

### 1. Run Binary
```bash
# Simply run the executable or double-click on macOS / Windows
./otix-node
```
The node automatically opens your default browser at `http://127.0.0.1:8090/` with your 6-digit claim PIN.

### 2. Headless Mode (Servers / NAS)
```bash
./otix-node -headless -config /path/to/config.yaml
```

### 3. Reconnecting an Already Claimed Node
If the node is already claimed, the claim PIN is no longer displayed. To reconnect to it:
- **Log in to Otix:** The user must log in to the Otix account that claimed the node in the Otix Desktop App or at `https://app.otix.io`.
- **Automatic Reconnection:** Your Otix client will automatically rediscover and link to the node on your network.
- **Manual / Remote Linking:** Use the node's local address and access token found on the node dashboard (`http://127.0.0.1:8090/`).
- **Unclaim / Transfer:** Click **Unclaim Node** on the dashboard to reset ownership and generate a fresh claim PIN.

---

## Docker & Unraid Deployment

```bash
docker run -d \
  --name otix-node \
  -p 8090:8090 \
  -v /mnt/user/appdata/otix-node/config.yaml:/app/config.yaml \
  -v /mnt/user/games:/storage/games \
  ghcr.io/dksilv4/otix-node:latest
```
Unraid users can also install using `node/unraid/my-otix-server.xml`.

---

## Local Development with Auto-Reload

For hot-reloading development on Otix Node with automatic recompilation on file changes:

### Windows (PowerShell)
```powershell
# From repo root:
.\scripts\dev_node.ps1

# Or from inside node/ directory:
.\scripts\dev.ps1

# Custom port or headless (no auto-browser popup):
.\scripts\dev_node.ps1 -Port 8090 -Headless
```

### macOS / Linux (Bash)
```bash
# From repo root:
./scripts/dev_node.sh

# Or from inside node/ directory:
./scripts/dev.sh
```

The auto-reloader detects changes to `.go`, `.yaml`, `.json`, and template files, recompiles incrementally (sub-second using native Go or cached Docker toolchain), and seamlessly restarts the node while streaming logs in real time.


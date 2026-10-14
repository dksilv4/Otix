# Otix Setup & Packaging Guide

A comprehensive guide to downloading, installing, configuring, and packaging the Otix ecosystem—from prebuilt binaries to the interactive in-app introduction setup.

---

## 🏗 System Components

The Otix platform consists of two primary binaries:

| Binary | Description | Primary Role |
| :--- | :--- | :--- |
| **Otix Desktop** (`Otix`) | Cross-platform desktop client (Electron, React, SQLite) with embedded Node sidecar | Local launcher, game library scanner, telemetry tracking, and unified media hub. Includes embedded Otix Node companion out-of-the-box. |
| **Otix Node** (`otix-node`) | Standalone Go daemon (zero external runtime dependencies) | Self-hosted storage server, high-performance range streaming, cloud save backups, and Arr/Usenet download orchestrator for NAS, Unraid, Docker, or standalone servers. |

---

## 🚀 Getting Started: Installing the Binaries

Prebuilt binaries are published with each release under [GitHub Releases](https://github.com/dksilv4/Otix/releases).

### 🍎 macOS (Apple Silicon & Intel)

#### 1. Otix Desktop
- Download `Otix-<version>-arm64.dmg` (Apple Silicon) or `Otix-<version>-x64.dmg` (Intel).
- Open the DMG and drag **Otix.app** to your `/Applications` folder.
- *Developer Note (Unsigned Gatekeeper):* If macOS warns about an unidentified developer, right-click the app and choose **Open**, or run:
  ```bash
  xattr -cr /Applications/Otix.app
  ```

#### 2. Otix Node (Optional Companion)
- Download `Otix-Node.dmg`.
- Drag **Otix Node.app** to `/Applications` and launch it.
- Otix Node runs in the background and opens your browser at `http://127.0.0.1:8090/` displaying your **6-digit Claim PIN**.

---

### 🪟 Windows (x64)

#### 1. Otix Desktop
- Download `Otix-Setup-<version>.exe` (NSIS installer) or `Otix-Setup-<version>-portable.exe`.
- Run the installer. It will create Desktop and Start Menu shortcuts and register the `otix://` custom URL protocol.
- *Developer Note (SmartScreen):* If Windows SmartScreen appears, click **More info** → **Run anyway**.

#### 2. Otix Node (Optional Companion)
- Download `Otix-Node-Windows-x64.zip`.
- Extract to a folder of your choice (e.g. `C:\OtixNode\`) and double-click `otix-node-windows-amd64.exe`.
- It will automatically launch your browser to `http://127.0.0.1:8090/` with your Claim PIN.

---

### 🐧 Linux (x64 & ARM64)

#### 1. Otix Desktop
- Download `Otix-<version>-x64.AppImage` or `Otix-<version>-x64.deb`.
- For AppImage:
  ```bash
  chmod +x Otix-*.AppImage
  ./Otix-*.AppImage
  ```
- For Debian/Ubuntu `.deb`:
  ```bash
  sudo dpkg -i Otix-*.deb
  ```

#### 2. Otix Node (Optional Companion)
- Download `Otix-Node-Linux-x64.tar.gz` (or `arm64`).
- Extract and run `./otix-node`.
- To register as a background systemd service:
  ```bash
  sudo cp otix-node.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now otix-node
  ```

---

### 🐳 Docker & Unraid (Otix Node)

```bash
docker run -d \
  --name otix-node \
  -p 8090:8090 \
  -v /mnt/user/appdata/otix-node/config.yaml:/app/config.yaml \
  -v /mnt/user/games:/storage/games \
  ghcr.io/dksilv4/otix-node:latest
```

Unraid templates are available in [`node/unraid/my-otix-server.xml`](../node/unraid/my-otix-server.xml).

---

## 🪄 In-App Introduction Setup Wizard

When you launch Otix Desktop for the first time, or whenever you want to reconfigure your setup, the interactive **Setup Wizard** walks you through 5 simple steps:

```text
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Mode Selection (Desktop All-In-One / Node / Cloud) │
│                            │                                │
│ Step 2: Otix Node Auto-Discovery (Live probe + PIN Claim)   │
│                            │                                │
│ Step 3: Game Directories (Folder selection + Auto-scanner)  │
│                            │                                │
│ Step 4: Preferences (Command Palette, Telemetry, Free Games)│
│                            │                                │
│ Step 5: Completed (+150 XP Welcome Bonus & Launch)          │
└─────────────────────────────────────────────────────────────┘
```

### Accessing the Setup Wizard:
- **Discover Feed Greeting**: Click the **Setup Wizard** button directly in the welcome card banner.
- **Welcome Page**: Navigate to `/welcome` or click **Welcome Guide** in the navigation sidebar, then click **Launch Setup Wizard**.
- **Settings**: Go to **Settings → General → Welcome & Feature Guide** and click **Run Setup Wizard**.

---

## 🛠 Building & Packaging from Source

To package the binaries locally on your development machine:

### Prerequisites
- Node.js 20+ (Node 22 recommended) & npm
- Go 1.23+ (for Otix Node)
- Python 3.12+ (for Backend)

### Quick Packaging Commands

| Command | Platform | Description |
| :--- | :--- | :--- |
| `npm run package:desktop` | macOS / Linux | Builds frontend, compiles desktop TypeScript, and packages desktop (`.dmg` / `.AppImage`). |
| `npm run package:desktop:win` | Windows | Builds frontend, compiles desktop TypeScript, and packages Windows installer (`.exe`). |
| `npm run package:node` | macOS / Linux | Compiles Otix Node for macOS (DMG/Universal), Windows (zip), and Linux (tarballs). |
| `npm run package:node:win` | Windows | Compiles Otix Node executable and zip package on Windows. |
| `npm run package:all` | macOS / Linux | One-shot builds both Otix Node and Otix Desktop into release directories. |
| `npm run package:all:win` | Windows | One-shot builds all Windows binaries. |

### Generated Artifacts Locations
- **Desktop Installers:** `desktop/release/`
- **Node Binaries & Archives:** `node/dist/`
- **Frontend Dist Bundle:** `frontend/dist/`

---

## 🤖 Continuous Integration & Releases (GitHub Actions)

Otix uses `.github/workflows/release-images.yml` to automate all release packaging. When a release tag (`v*`) is pushed or manually triggered via `workflow_dispatch`:

1. **`frontend` job**: Compiles and verifies the static bundle.
2. **`desktop-packages` matrix job**:
   - Runs on `macos-latest` to build macOS Universal DMGs and ZIPs.
   - Runs on `windows-latest` to build Windows NSIS Setup EXEs.
   - Runs on `ubuntu-latest` to build Linux AppImage and DEB packages.
   - Reuses the cached frontend artifact from step 1 for maximum build speed.
3. **`node-packages` job**: Cross-compiles Otix Node binaries for all operating systems.
4. **`node-docker` & `backend` jobs**: Multi-arch Docker images published to GitHub Container Registry (`ghcr.io`).
5. **GitHub Release**: All compiled binaries and installers are automatically attached to the GitHub release.

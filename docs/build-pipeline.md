# Otix Centralized Root Distribution & Build Pipeline

## 1. Overview & Architecture

Otix employs a unified, deterministic root distribution pipeline. All production compilation, bundling, and packaging artifacts across the platform's multi-tier architecture are consolidated under a single, central root directory:

```
c:\Users\diogo\Documents\GitHub\Otix\dist\
```

This replaces legacy fragmented output directories (`desktop/release/`, `node/dist/`, `frontend/dist/`, loose root tarballs) with a clean hierarchy that guarantees reproducible builds, prevents repository pollution, and aligns with Otix repository hygiene standards.

---

## 2. Directory Hierarchy (`dist/` Topology)

When build and packaging pipelines run, outputs are written into dedicated subdirectories within root `dist/`:

```
Otix/
├── dist/
│   ├── desktop/                               # Electron Desktop Application Distribution
│   │   ├── Otix-Setup-*.exe                   # Portable Windows executable
│   │   ├── Otix-Legacy-Setup-*.exe            # Full NSIS installer
│   │   ├── win-unpacked/                      # Unpacked application bundle (when directory target is requested)
│   │   └── builder-effective-config.yaml      # electron-builder packaging metadata
│   │
│   ├── frontend/                              # Vite Production Web Bundle
│   │   ├── index.html                         # Single-page application entry point
│   │   ├── assets/                            # Bundled JavaScript, CSS, and media assets
│   │   ├── favicon.ico
│   │   └── manifest.json
│   │
│   └── node/                                  # Go Companion Daemon Binaries & Archives
│       ├── otix-node-windows-amd64.exe        # Windows x64 native binary
│       ├── Otix-Node-Windows-x64.zip          # Packaged Windows zip archive with documentation
│       ├── otix-node-linux-amd64              # Linux x64 ELF binary
│       ├── otix-node-linux-arm64              # Linux ARM64 ELF binary
│       ├── Otix-Node-Linux-x64.tar.gz         # Linux release archive
│       ├── otix-node-darwin-universal         # macOS Universal 2 binary (ARM64 + Intel x86_64)
│       └── Otix Node.app                      # macOS application bundle
```

---

## 3. Tier Build Specifications

### 3.1 Desktop (`dist/desktop/`)
- **Configuration:** `desktop/electron-builder.json5` configures `"directories": { "output": "../dist/desktop" }`.
- **Packaging Scripts:**
  - Windows: `scripts/package-desktop.ps1`
  - POSIX / macOS: `scripts/package-desktop.sh`
- **Output:** Builds Vite frontend into `frontend/dist/`, compiles TypeScript into `desktop/dist/`, embeds native dependencies, resolves companion node daemon, and packages into `dist/desktop/`.

### 3.2 Frontend (`dist/frontend/`)
- **Configuration:** `frontend/package.json` script `package:dist`.
- **Command:** `npm --prefix frontend run package:dist` (or `npm run package:frontend` from repo root).
- **Behavior:** Executes `vite build` into `frontend/dist/`, then copies static assets directly into `dist/frontend/`. Loose root tarballs (`otix-frontend-dist.tar.gz`) are strictly eliminated.

### 3.3 Node Companion Daemon (`dist/node/`)
- **Packaging Scripts:**
  - Windows: `node/scripts/build-windows.ps1` (parameter `-PackageZip` generates zip distribution).
  - Multi-platform: `node/scripts/build-all.sh`.
  - macOS: `node/scripts/build-macos.sh`.
- **Output:** Compiles optimized, standalone binaries with linker flags (`-s -w`), embedded icons, and PE metadata directly into `dist/node/`.

---

## 4. Desktop Daemon Sidecar Resolution

The Electron desktop client (`desktop/node-daemon.ts`) resolves companion node binaries dynamically in priority order:

1. **Packaged Application Resources:** `resourcesPath/bin/otix-node.exe` (production installer/bundle).
2. **Local Desktop Binary:** `desktop/bin/otix-node.exe` (developer local copy).
3. **Central Root Distribution:** `dist/node/` (evaluates `otix-node-windows-amd64.exe`, `otix-node.exe`, or platform equivalents).
4. **Legacy Fallback:** `node/dist/` (backward compatibility).

This ensures developers can run desktop in development against freshly compiled `dist/node/` binaries without manual copying.

---

## 5. Command Reference

All build, package, and clean commands are orchestrated from root `package.json`:

| Command | Action | Output Location |
|---|---|---|
| `npm run build:frontend` | Compiles Vite frontend | `frontend/dist/` |
| `npm run package:frontend` | Compiles and publishes frontend | `dist/frontend/` |
| `npm run package:desktop:win` | Packages Windows desktop app | `dist/desktop/` |
| `npm run package:desktop` | Packages desktop app (bash) | `dist/desktop/` |
| `npm run package:node:win` | Builds Windows Go daemon & zip | `dist/node/` |
| `npm run package:node` | Builds all Go daemon platforms | `dist/node/` |
| `npm run package:all:win` | Full suite (frontend, node, desktop) | `dist/` (desktop, frontend, node) |
| `npm run package:all` | Full suite (bash) | `dist/` (desktop, frontend, node) |
| `npm run clean` | Cleans root `dist/` and legacy directories | Removes `dist/`, `desktop/release/`, etc. |
| `npm run clean:dist` | Cleans only root `dist/` | Removes `dist/` |

---

## 6. Repository Hygiene & Git Ignore Rules

To maintain a clean repository root:
- **No root scripts:** Standalone execution scripts (`.ps1`, `.sh`, `.py`, `.js`, `.mjs`) must never reside in the repository root. All scripts live in `scripts/`, `node/scripts/`, etc.
- **Git ignore:** Root `.gitignore` explicitly ignores:
  - `/dist/`
  - `/desktop/release/`
  - `/desktop/dist/`
  - `/frontend/dist/`
  - `/node/dist/`
  - `*.tar.gz` and legacy archive files.

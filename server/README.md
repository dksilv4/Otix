# Otix Standalone Game & Save Server (`otix-server`)

A lightweight, standalone, headless server daemon for hosting game installer files (`.iso`, `.exe`, setup packages, repacks, ROMs) and managing personal cloud save file backups.

---

## Features
- **Standalone Headless Executable**: Runs on Linux, macOS, Windows, NAS, or Docker with zero mandatory UI.
- **Steam-Style Game Installer Node**: Multi-threaded HTTP/2 Range Request file server with full pause/resume support.
- **SHA-256 Chunk Hashing & IGDB Matching**: Automatic installer metadata indexing and file integrity verification.
- **Cloud Save File Backups**: Versioned game save snapshots with automatic upload on game exit and cross-device restore.
- **Plex-Style Server Discovery**: Automatic WAN IP heartbeat announcement and smart LAN/WAN connection auto-select.

---

## Quick Start

### 1. Installation
```bash
cd server
pip install -e .
```

### 2. Configuration
Copy `config.example.yaml` to `config.yaml` and configure your installer directories:
```bash
cp config.example.yaml config.yaml
```

### 3. Run Server
```bash
otix-server start --config config.yaml
```

---

## Docker Deployment
```bash
docker build -t otix-server .
docker run -d -p 8000:8000 -v /path/to/config.yaml:/app/config.yaml -v /path/to/games:/storage/games otix-server
```

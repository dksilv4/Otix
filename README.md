# Otix

Otix is an all-in-one multi-platform media, game, and entertainment tracking suite. It connects your personal libraries, external providers, download clients, and tracking services into a single unified interface.

---

## 🏗 Architecture Overview

| Component | Path | Tech Stack | Description | Default Port |
| :--- | :--- | :--- | :--- | :--- |
| **API Backend** | [`backend/`](backend/) | Python 3.12, Django REST Framework, Celery | Public production SaaS API: user authentication, global media catalog, social features, and remote node registry. | `8000` |
| **Web UI** | [`frontend/`](frontend/) | React 18, Vite, TypeScript, Tailwind CSS, TanStack Query | Web interface with hot module replacement and desktop IPC bridge. | `5173` |
| **Desktop Client** | [`desktop/`](desktop/) | Electron, TypeScript, Better-SQLite3 | Native desktop launcher, local game detection, and sandboxed plugin runtime. | — |
| **Otix Node** | [`node/`](node/) | Go (native binary / Docker) | Lightweight user-hosted daemon for all self-hosting features: file storage, range streaming, cloud saves, SABnzbd, Prowlarr, Radarr, Sonarr, and Epic sync. | `8090` |
| **Plugins** | [`extensions/plugins/`](extensions/plugins/) | JavaScript (CommonJS) | Community extensions for store integrations (Steam, Epic), Arr tools (Radarr, Sonarr, Prowlarr), and downloaders (SABnzbd). | — |

For a complete map of all plugin-related subsystems across backend, desktop, and extensions, see [**`PLUGINS.md`**](PLUGINS.md).

---

## 🚀 Quick Start (Development)

The entire local stack runs via Docker Compose with volume-mounted hot reloading.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Compose V2)
- Node.js 20+ & Python 3.12+ (if running host linting or desktop app)

### Running All Services
Using PowerShell (Windows):
```powershell
./run.ps1
```

Using Bash (macOS/Linux):
```bash
./run.sh
# or
make dev
```

### Service Map
Once started, the following local services are available:
- **Frontend App:** [http://localhost:5173](http://localhost:5173)
- **Backend REST API:** [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
- **Otix Node:** [http://localhost:8090/api/v1/status](http://localhost:8090/api/v1/status)
- **PostgreSQL (pgvector):** `localhost:5433` (`otix_dev`)
- **Redis:** `localhost:6380`

To stop all services:
```bash
docker compose down
```

---

## 📁 Repository Structure

```text
Otix/
├── backend/               # Django REST API
│   ├── apps/              # Domain apps (library, media, social, search, etc.)
│   ├── plugin_framework/  # Server-side plugin host, registry, and IPC gateway
│   └── scripts/           # Management, data hydration, and admin utilities
├── frontend/              # React / Vite web interface
├── desktop/               # Electron client
│   └── plugin-runtime/    # Sandboxed worker runtime for executing extensions
├── node/                  # User-hosted Go daemon for self-hosted files, downloads, and cloud saves
├── extensions/
│   └── plugins/           # Canonical community JS extensions
├── deploy/                # Deployment configurations and VM provisioning scripts
│   └── plugin-host/       # Systemd and Supervisor service units
├── docs/                  # Architecture specs and feature implementation plans
│   ├── plans/
│   └── specs/
├── sample_data/           # Provider mock JSON payloads (IGDB, TMDB, Steam, etc.)
├── scripts/               # Developer environment setup scripts
├── store-assets/          # App store listing assets and application icons
├── docker-compose.yml     # Local dev compose stack
├── docker-compose.prod.yml# Production compose stack (PgBouncer + Nginx)
└── PLUGINS.md             # Guide to Otix's plugin architecture
```

---

## 🛠 Useful Commands

```bash
# Code checks (run from repo root)
make lint         # Run ruff check on backend
make test         # Run backend test battery (in-memory SQLite)
make parity       # Verify Django route parity against frozen contract (263/263)

# Desktop tests
npm test --prefix desktop

# Frontend tests
npm test --prefix frontend
```

---

## 📖 Further Documentation
- [**`PLUGINS.md`**](PLUGINS.md) — Explains the separation between plugin framework, runtime, and packages.
- [**`backend/ARCHITECTURE.md`**](backend/ARCHITECTURE.md) — Canonical backend conventions, casing contracts, and database architecture.
- [**`deploy/README.md`**](deploy/README.md) — Production deployment with Docker Compose, PgBouncer, or cloud VMs.
- [**`extensions/README.md`**](extensions/README.md) — Comprehensive guide to authoring new Otix plugins.

# Project: Otix Nodes Full-Stack Architecture Overhaul

## Architecture
- **Daemon (`node/`):** Go 1.24 companion daemon. Persistent UUID `NodeID`, hybrid file change detection (debounced fsnotify on local SSDs vs periodic polling/mtime on network shares/ROMs), modular file reorganization (<300 LOC per subsystem, dry-run safety tokens, zero hardcoded IPs), unified parser package, SSE progress streaming, and zero `.otix` sidecar writeback.
- **Backend (`backend/`):** Django 5.2 / DRF 3.16. Clean-break unification to `UserNode` model and `/api/v1/nodes/*` namespace (purging all `/api/v1/servers/*` legacy routes). Relational multi-source schema: canonical `UserGame` with 1-to-many `NodeGameSource` records. Database-only metadata persistence via manifest ingest. Multi-node emulation platform models and bidirectional cloud save snapshotting.
- **Desktop Companion (`desktop/`):** Electron 35/42, TypeScript IPC bridge. Local emulator detection and launch argument interpolation (%ROM%, %BIOS%), process tracking hooks, save directory snapshotting on process exit, and zero reliance on legacy `/servers/*` endpoints.
- **Frontend (`frontend/`):** React 18/19, Vite 5, Tailwind CSS. Pure camelCase client code via automated `apiClient` casing interceptors. Multi-source library cards with availability badges ("Installed on Desktop", "Archived on NAS", "Network Share") and contextual actions (direct launch vs 1-click download & install). Overhauled Node Settings with soft glassmorphism, semantic theme tokens, arrow functions only, zero non-component helpers in `.tsx` files, and zero arbitrary dot bubbles.
- **Shared Parser Specification (`fixtures/`):** 105+ shared JSON test fixtures (`fixtures/parser_fixtures.json`) establishing 100% parser output parity across Go, TypeScript, and Python.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Shared Parser Test Fixtures (105+ cases) | Shared JSON test fixtures covering PC releases, scene tags, multi-part repacks, updates/DLCs, and 11 console platforms | M4 / E2E | ORIGINAL_REQUEST §R4 |
| F2 | UserNode Model & Namespace Unification | Unify server/node models into `UserNode` with immutable UUID, network interface classification (loopback, LAN, Tailscale, Docker), and purge `/api/v1/servers/*` | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Daemon Persistent NodeID & Interface Detection | Go daemon persistent UUID in `config.yaml`, smart interface detection avoiding loopback broadcasting, update heartbeat to `/api/v1/nodes/*` | M1 | ORIGINAL_REQUEST §R1 |
| F4 | Desktop & Frontend Legacy Route Purge | Purge `LOCAL_DESKTOP_NODE_ID`, `otix:cached-servers`, and all `/api/v1/servers/*` calls across Desktop and Frontend | M1 | ORIGINAL_REQUEST §R1, §R10 |
| F5 | Relational Multi-Source Backend Schema | Implement canonical `UserGame` with 1-to-many `NodeGameSource` records (node, path, share, state, size, reachability) | M2 | ORIGINAL_REQUEST §R2 |
| F6 | Multi-Source Query Aggregation & Serialization | Backend queries and serializers aggregating sources into canonical game envelope in pure snake_case | M2 | ORIGINAL_REQUEST §R2 |
| F7 | Database-Only Metadata Persistence | Eliminate `.otix` sidecar writing across backend and daemon; route scan manifests directly to DB (`POST /api/v1/nodes/<node_id>/manifest`) | M2 | ORIGINAL_REQUEST §R5 |
| F8 | Daemon Hybrid File Change Detection | Debounced fsnotify for local SSDs; lightweight periodic mtime/size polling for network shares & ROMs; prevent handle exhaustion | M3 | ORIGINAL_REQUEST §R3 |
| F9 | Daemon Incremental Rescan & SSE Streaming | Targeted `ScanFolder(path)` incremental rescan without full library reload; stream scan progress via SSE | M3 | ORIGINAL_REQUEST §R3 |
| F10 | Go Unified Parser Implementation | Consolidate `indexer.go` and `organize/parser.go` into `node/internal/parser/` passing 100% of shared fixtures | M4 | ORIGINAL_REQUEST §R4 |
| F11 | TypeScript Parser Parity | Align `desktop/game/parser.ts` to pass 100% of shared fixtures with normalized attributes (`region`, `releaseGroup`) | M4 | ORIGINAL_REQUEST §R4 |
| F12 | Python Parser Parity | Implement `ParsedRelease` and parser parity in `backend/apps/library/services/server_catalog.py` passing 100% of shared fixtures | M4 | ORIGINAL_REQUEST §R4 |
| F13 | Organize IP Purge & Static Map Removal | Completely excise hardcoded IP `192.168.1.58` and static lookup maps from `node/internal/organize/` | M5 | ORIGINAL_REQUEST §R9 |
| F14 | Modular Organize Engine Decomposition | Decouple `organize.go` into 5 single-responsibility modules (<300 LOC): `planning.go`, `execution.go`, `cleanup.go`, `unc.go`, `classify.go` | M5 | ORIGINAL_REQUEST §R9 |
| F15 | Zero-Data-Loss Organize Safety Guardrails | Mandatory dry-run preview tokens, atomic moves, collision skipping, non-empty directory pruning protection | M5 | ORIGINAL_REQUEST §R9 |
| F16 | First-Class Emulation Backend Models | Backend models and configs for console platforms, emulator launch templates, ROM cue sheets, and BIOS requirements | M6 | ORIGINAL_REQUEST §R7 |
| F17 | Desktop Emulator Detection & CLI Launch Templates | Detect 13 emulator profiles, interpolate CLI templates (%ROM%, %BIOS%), hybrid execution (SMB direct launch vs WAN caching) | M6 | ORIGINAL_REQUEST §R7 |
| F18 | Automated Process Tracking & Save Snapshotting | Track game and emulator execution, detect process exit, snapshot save directories with checksums | M6 | ORIGINAL_REQUEST §R8 |
| F19 | Bidirectional Cloud Save Sync Engine | Cloud save sync with newest-timestamp conflict resolution (HTTP 409 Conflict with head metadata) | M6 | ORIGINAL_REQUEST §R8 |
| F20 | Contextual Path Rendering & Multi-Source Cards | Aggregate multi-source games into a single card with availability badges ("Installed on Desktop", "Archived on NAS", "Network Share") | M7 | ORIGINAL_REQUEST §R6 |
| F21 | Contextual Launch & 1-Click Install Actions | Contextual action buttons: direct "Play", 1-click "Download & Install to PC" for remote packages, or hybrid emulation | M7 | ORIGINAL_REQUEST §R6 |
| F22 | Node Settings & Management UI Overhaul | Overhaul Node connection health, storage share configuration, node file browsing, and emulated platform libraries | M7 | ORIGINAL_REQUEST §R10 |
| F23 | Frontend Design Rules & Glassmorphism Enforcement | Strict arrow functions, zero helpers in component files, semantic theme tokens, soft glassmorphism, no arbitrary dot bubbles | M7 | ORIGINAL_REQUEST §R10, AGENTS.md |
| F24 | E2E Integration Suite & Tier 1-4 Verification | 100% pass across Go daemon tests, Desktop Vitest, Frontend Vitest, and Django pytest | M8 | ORIGINAL_REQUEST Acceptance Criteria |
| F25 | Adversarial Coverage Hardening & Forensic Audit | Adversarial stress testing (Tier 5) and forensic integrity audit (zero mock data, zero hardcoded strings) | M8 | ORIGINAL_REQUEST Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Clean-Break Node Lifecycle & Legacy Purge | F2, F3, F4 (Backend UserNode migration, Go daemon NodeID & interface classification, Desktop/Frontend /servers/* purge) | None | DONE |
| M2 | Relational Multi-Source Architecture & DB Persistence | F5, F6, F7 (Canonical UserGame + NodeGameSource schema, manifest ingest, zero .otix sidecar writeback) | M1 | DONE |
| M3 | Hybrid File Change Detection & SSE Streaming | F8, F9 (Go daemon debounced fsnotify on local SSDs, periodic polling on network shares/ROMs, SSE progress) | M1 | DONE |
| M4 | Specification-Driven Cross-Language Parser Parity | F1, F10, F11, F12 (105+ shared JSON fixtures, Go/TS/Python deterministic parser implementations) | None | DONE |
| M5 | Zero-Data-Loss Modular Organize Engine | F13, F14, F15 (Decouple organize.go into <300 LOC modules, purge 192.168.1.58, dry-run safety tokens, atomic moves) | M1 | DONE |
| M6 | Multi-Node Emulation, Process Tracking & Save Sync | F16, F17, F18, F19 (Backend emulator models, desktop emulator detection & CLI templates, save sync with conflict resolution) | M2 | DONE |
| M7 | Multi-Source Cards, Contextual Actions & Settings UI | F20, F21, F22, F23 (Multi-source library cards, availability badges, contextual launch/download, Node settings overhaul) | M2, M6 | DONE |
| M8 | Full-Stack E2E Verification, Adversarial Hardening & Audit | F24, F25 (Pass 100% tests across all 4 tiers, Tier 5 adversarial stress testing, clean forensic audit) | M1-M7 | DONE |

## Interface Contracts
### Unified Node REST API (`/api/v1/nodes/*`)
- `GET /api/v1/nodes/`: List user nodes with availability, interface classifications, and storage shares.
- `POST /api/v1/nodes/claim-pin/` & `POST /api/v1/nodes/claim-direct/`: Pair node via PIN or token; assigns permanent UUID `machine_id`.
- `POST /api/v1/nodes/<node_id>/heartbeat/`: Daemon heartbeat reporting status, CPU, memory, and classified IP endpoints.
- `POST /api/v1/nodes/<node_id>/manifest/`: Ingest discovered file records and matches directly into database without disk sidecars.
- `POST /api/v1/nodes/<node_id>/unclaim/`: Graceful node unpairing without orphaned records.
- All endpoints emit pure `snake_case` JSON; frontend `apiClient` converts automatically to `camelCase`.

### Relational Multi-Source Schema Contract
- `UserGame`: Canonical game representation (`user_id`, `media_item_id`, `clean_title`, `platform`, `cover_image_url`).
- `NodeGameSource`: Physical representation (`user_game_id`, `node_id`, `canonical_path`, `storage_share`, `source_state` [installed/installer/iso/rom/archive], `file_size`, `sha256_head`, `is_available`, `format_details`).
- Serialized output groups all physical sources under `sources: NodeGameSource[]` on the canonical game card.

### Cross-Language Parser Parity Specification
- Fixture path: `fixtures/parser_fixtures.json`.
- Structure: `{ "cases": [ { "input": string, "ext_hint"?: string, "parent_dir"?: string, "expected": { "title": string, "clean_title": string, "year"?: string, "edition"?: string, "platform"?: string, "release_group"?: string, "region"?: string, "version"?: string, "title_id"?: string, "is_scene": boolean } } ] }`.
- Deterministic behavior: Go, TypeScript, and Python must yield identical normalized outputs for all cases.

### Organize Engine Safety Contract
- Two-phase execution: `POST /api/v1/organize/preview` returns a cryptographic preview token and plan; `POST /api/v1/organize/apply` requires the valid token.
- Atomic moves: file copy-then-verify before source deletion, or atomic rename on same volume.
- Collisions: skip existing destination files; never overwrite without explicit collision strategy.
- Directory cleanup: verify directory is strictly empty before pruning; never prune non-empty paths.
- Zero hardcoded network IPs: dynamic node IP and UNC path resolution exclusively.

## Code Layout
- `fixtures/`: Shared cross-platform test fixtures (`fixtures/parser_fixtures.json`).
- `backend/apps/library/models/user_node.py`: Unified `UserNode` model.
- `backend/apps/library/models/game_source.py`: `UserGame` and `NodeGameSource` models.
- `backend/apps/library/views/nodes.py`: Unified `/api/v1/nodes/*` endpoints.
- `backend/apps/library/services/server_catalog.py`: Python catalog matching and parser.
- `node/cmd/`: Go companion daemon entrypoints.
- `node/internal/indexer/`: Go indexing, watcher, mtime polling, SSE progress.
- `node/internal/parser/`: Consolidated Go title and release parser.
- `node/internal/organize/`: Modular organize engine (`planning.go`, `execution.go`, `cleanup.go`, `unc.go`, `classify.go`).
- `node/internal/process/`: Process tracking and save synchronization.
- `desktop/src/main/`: Electron main process & IPC handlers.
- `desktop/game/`: Desktop scanner, emulator detection, CLI templates, Vitest suites.
- `frontend/src/features/library/`: Multi-source library cards and contextual launch actions.
- `frontend/src/features/settings/`: Overhauled Node settings, connection health, and storage shares.
- `frontend/src/features/downloads/`: Download manager consuming `/api/v1/nodes/*`.

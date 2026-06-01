# SABnzbd + NZBPlanet Integration — Game ISO Auto-Download

**Date:** 2026-06-01
**Approach:** A — Full Provider Pattern
**Scope:** Backend providers, domain models, API routes, Celery tasks, frontend settings, download queue UI

## Summary

Add SABnzbd (download client) and NZBPlanet (Usenet indexer) integrations to Otix. Users configure both services in Settings. From a game's media detail page they can search NZBPlanet, pick an NZB, and send it to SABnzbd. A scheduled Celery task auto-scans wishlist-type `UserList` items for games and auto-downloads them. Otix monitors SABnzbd queue progress and post-processes completed downloads (moves ISO to target folder, sends notification).

## Data Model

### `downloads` table
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | FK→users.id | |
| media_item_id | FK→media_items.id | |
| sabnzbd_nzo_id | str | SABnzbd internal ID |
| status | str | queued / downloading / completed / failed |
| nzb_name | str | filename from NZBPlanet |
| nzb_size | int? | bytes |
| nzb_url | str | source NZB URL |
| iso_path | str? | final path after post-processing |
| error_message | str? | |
| completed_at | datetime? | |
| created_at | datetime | |
| updated_at | datetime | |

### `download_configs` table
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | FK→users.id | unique |
| sabnzbd_host | str | e.g. 192.168.1.58 |
| sabnzbd_port | int | e.g. 8080 |
| sabnzbd_api_key | str | |
| sabnzbd_use_ssl | bool | |
| nzbplanet_api_key | str | |
| download_path | str | ISO destination |
| auto_search_wishlist | bool | |
| wishlist_interval_hours | int | default 12 |

### `wishlist_download_tracking` table
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | FK→users.id | |
| media_item_id | FK→media_items.id | |
| last_searched_at | datetime | |
| last_download_id | FK→downloads.id? | |
| attempts | int | |
| skipped | bool | user can skip auto-download for specific games |

## Providers

### NZBPlanetProvider (`backend/otix/providers/nzbplanet/`)
- Extends `BaseProvider`
- API: `https://api.nzbplanet.net/api`
- Rate: 10 req/min, burst 20 (shared API limits)
- Methods: `search(query, category_ids)` → `list[NZBResult]`, `get_nzb_url(guid)` → `str`

### SABnzbdProvider (`backend/otix/providers/sabnzbd/`)
- Extends `BaseProvider`
- API: `http(s)://{host}:{port}/api`
- Rate: 60 req/min, burst 120 (local network)
- Methods: `add_by_url`, `get_queue`, `get_history`, `get_status`, `delete`, `pause`, `resume`, `test_connection`

## Services

### DownloadConfigService
- `get_config(user_id)` / `save_config(user_id, data)`
- `test_sabnzbd(config)` / `test_nzbplanet(config)`

### DownloadService
- `search_for_game(game_name, platforms, config)` → `list[NZBResult]`
- `auto_pick_best(results)` → `NZBResult` — prefers scene releases, largest files
- `send_to_sabnzbd(nzb_result, media_item_id, user_id, config)` → `Download`
- `get_download_status(download_id)` → `Download`
- `list_user_downloads(user_id, status_filter)` → `list[Download]`
- `cancel_download(download_id)` → `bool`

### WishlistDownloadService
- `scan_wishlists(user_id=None)` → `int` (new downloads queued)
- Skips already-attempted/skipped items
- Records attempts in `wishlist_download_tracking`

## API Routes (`backend/otix/api/download.py`)

| Method | Path | Description |
|---|---|---|
| GET | /api/downloads | List user's downloads |
| POST | /api/downloads/search/{media_item_id} | Search NZBPlanet for game |
| POST | /api/downloads/send/{media_item_id} | Auto-search + send best |
| POST | /api/downloads/send/{media_item_id}/{guid} | Send specific NZB |
| GET | /api/downloads/{id}/status | Download status + progress |
| DELETE | /api/downloads/{id} | Cancel download |
| GET | /api/downloads/config | Get user config |
| PUT | /api/downloads/config | Save config |
| POST | /api/downloads/config/test-sabnzbd | Test SABnzbd connection |
| POST | /api/downloads/config/test-nzbplanet | Test NZBPlanet API key |
| POST | /api/downloads/wishlist/scan | Manual wishlist scan |
| GET | /api/downloads/wishlist/status | Last scan info |

## Celery Tasks

| Task | Schedule |
|---|---|
| `download_scan_wishlists` | Every N hours (configurable, default 12) |
| `download_poll_queue` | Every 2 minutes |
| `download_post_process` | Triggered on completion |

## Frontend

### Settings → Integrations
- SABnzbd card: Host, Port, API Key, SSL toggle, Test Connection
- NZBPlanet card: API Key, Test API Key

### Media Detail Page
- "Download" button on game-type media items
- Shows `NzDownloadSelector` molecule: best match highlighted + "use different release" dropdown
- SSE or polling for status updates

### Download Queue Page (`frontend/src/features/downloads/`)
- `download-queue.tsx` — full page with active/completed downloads
- `download-card.tsx` — progress bar, status badge, cancel button, open folder
- `download-config-form.tsx` — reused in settings
- `queries.ts` — TanStack Query hooks

### Wishlist Integration
- Auto-search indicator on wishlist view
- Manual "Scan Now" button

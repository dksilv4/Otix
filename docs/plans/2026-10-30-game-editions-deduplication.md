# Game Editions Identification, Deduplication & Management Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an autonomous, cross-stack system to identify games that are duplicate editions (e.g., *GOTY*, *Deluxe*, *Ultimate*, *Definitive*, *Complete*, *Gold*, *Director's Cut*, *Anniversary*) rather than separate base games, model them via a dedicated `GameEdition` table, eliminate duplicate cards across Catalog, Search, and Discover, and provide an interactive edition switcher and downloader/request workflow in the frontend UI.

---

## 🏗️ Architecture & Technical Decisions

### 1. Scope & Primary Subsystem: Unified Catalog & Search / Discover
- **The Problem:** Ingesting games from IGDB and external sources often creates separate `MediaItem` rows for the base game (e.g., *The Witcher 3: Wild Hunt*) and its editions (e.g., *The Witcher 3: Wild Hunt - Game of the Year Edition* or *Cyberpunk 2077 Ultimate Edition*). This clutters the catalog, fragments user watchlists/favorites, creates duplicate cards in search results, and divides user reviews and activity.
- **The Solution:** The canonical `MediaItem` (with `media_type="game"`) represents the base game. All duplicate editions are modeled as child entities under the base game, collapsed out of top-level discovery/search, and exposed as selectable variants on the base game's detail page and request workflow.

### 2. Hybrid Identification Engine
- **IGDB Metadata First:**
  - Check IGDB's `version_parent` (primary pointer to the base game IGDB ID for alternate editions).
  - Check IGDB's `parent_game` when `game_type` is `10` (`expanded_game`) or `3` (`bundle`).
- **Heuristic Title Parsing Fallback:**
  - When IGDB metadata is missing or loose (e.g., tagged as `game_type=0` main game or standalone), run title heuristic normalization (`_strip_edition_markers` in `backend/apps/media/services/game_matcher.py`).
  - Recognized edition patterns: `Game of the Year`, `GOTY`, `Deluxe`, `Digital Deluxe`, `Ultimate`, `Complete`, `Definitive`, `Gold`, `Collector's`, `Special`, `Anniversary`, `Enhanced`, `Director's Cut`, `Premium`, `Day One`, `Royal Edition`.
  - When the stripped title matches a canonical base game in the catalog (or within the same franchise/developer), classify it as an edition.

### 3. Classification Boundaries
- **Duplicate Editions (Collapsed into `GameEdition`):**
  - Content bundles, DLC bundles, and light re-releases (*GOTY*, *Deluxe*, *Complete*, *Gold*, *Ultimate*, *Director's Cut*, *Expanded Game*).
- **Standalone Games (Retained as Independent `MediaItem`s):**
  - Full Remakes (IGDB `game_type=8`, e.g., *Resident Evil 4 (2023)*, *Final Fantasy VII Remake*, *Demon's Souls*).
  - Standalone Expansions (IGDB `game_type=4`, e.g., *Spider-Man: Miles Morales*, *Dishonored: Death of the Outsider*).
  - Standalone Sequel Releases (*Overwatch 2*, *Counter-Strike 2*).

### 4. Data Modeling: Dedicated `GameEdition` Model
- Create `GameEdition` in `backend/apps/media/models/game_edition.py`:
  - `game`: ForeignKey to `media.Game` (`related_name="editions"`).
  - `name`: Clean edition name (e.g., `"Game of the Year Edition"`, `"Deluxe Edition"`).
  - `raw_title`: Original raw title string (e.g., `"The Witcher 3: Wild Hunt - Game of the Year Edition"`).
  - `igdb_id`: Integer/string IGDB ID for the edition if distinct from base game.
  - `release_date`: Date of the edition release.
  - `external_ids`: JSON field storing store identifiers (`{"steam": 12345, "gog": 67890, "epic": "..."}`).
  - `cover_image_id`: Optional IGDB image ID if the edition has distinct box art.
  - `summary`: Optional summary notes or list of bundled DLC items.
  - `is_default`: Boolean indicating whether this edition is the default release (base game default).

### 5. Automated Data Migration & Cleanup Command
- Provide `python manage.py deduplicate_game_editions` (and an automated data migration):
  1. Identifies existing `MediaItem` rows with `media_type="game"` that are duplicate editions.
  2. Resolves each to its canonical base game `MediaItem`.
  3. Creates corresponding `GameEdition` records with all store IDs and metadata transferred.
  4. Repoints any referencing records (`UserLocalGame`, `GameMatchRecord`, `UserMediaRequest`, `MediaAsset`) to the canonical base game.
  5. Deletes the duplicate `MediaItem` rows.

### 6. Search & Scanner Integration
- **Search API (`/search` & `/search/media`):**
  - Search queries match against both `MediaItem.title` and `GameEdition.name`.
  - When an edition matches (e.g., searching `"Cyberpunk 2077 Ultimate"`), the base game is returned in the search results with a `matched_edition` descriptor.
- **Scanner (`GameMatchRecord` / `UserLocalGame`):**
  - Scanned game folders (e.g., `/Games/The Witcher 3 Wild Hunt GOTY`) match to the canonical base `MediaItem` with `edition = "Game of the Year Edition"` recorded on the match record.

### 7. Frontend UI / UX
- **Design System Rules Compliance:**
  - Soft glassmorphism (`var(--dk-surface-glass)`, `backdrop-blur-xl`).
  - No harsh borders or outlines (`border-white/[0.04]` to `border-white/[0.06]`).
  - No hardcoded hex or Tailwind palette colors (use semantic CSS tokens `bg-primary`, `text-primary-foreground`, `text-muted-foreground`).
  - Arrow functions only for all React components.
  - All non-component helpers and hooks in dedicated utility/hook files.
- **Game Hero Header:**
  - Interactive edition selector pill/dropdown in the action area allowing instant switching between `"Standard Edition"`, `"Game of the Year Edition"`, etc.
  - Dynamically updates active store URLs (Steam/GOG) and configures the Request/Download action with the selected edition parameter.
- **Editions Section:**
  - Glassmorphic card pod below the hero displaying available editions, release dates, bundled DLCs, and status.

---

## 📁 File Map

### New Files

| File | Responsibility |
| :--- | :--- |
| `backend/apps/media/models/game_edition.py` | Django model for `GameEdition` linking editions to `Game` / `MediaItem`. |
| `backend/apps/media/serializers/game_edition.py` | DRF serializers for `GameEdition` (output strictly in `snake_case`). |
| `backend/apps/media/services/game_edition.py` | Core service for detecting, creating, and resolving duplicate editions. |
| `backend/apps/media/management/commands/deduplicate_game_editions.py` | Management command to migrate and clean existing duplicate `MediaItem` records into `GameEdition`s. |
| `backend/apps/media/tests/test_game_editions.py` | Unit and integration tests for edition detection, ingestion, and deduplication. |
| `frontend/src/features/media/game/components/atoms/game-edition-selector.tsx` | Glassmorphic interactive edition selector dropdown/pills in game hero. |
| `frontend/src/features/media/game/components/organisms/game-editions-section.tsx` | Section below game hero listing available editions and details. |
| `frontend/src/features/media/game/hooks/use-game-editions.ts` | Custom hook for managing active selected edition and edition state. |
| `frontend/src/features/media/game/utils/game-editions.ts` | Utility helpers for sorting and formatting game editions. |

### Modified Files

| File | Responsibility |
| :--- | :--- |
| `backend/apps/media/models/__init__.py` | Export `GameEdition`. |
| `backend/apps/media/models/media_item.py` | Add reverse relation or helper methods on `Game` for `editions`. |
| `backend/apps/media/serializers/catalog.py` | Add `editions` field to `GameDetailSerializer` and `MediaItemDetailSerializer`. |
| `backend/apps/media/services/igdb_ingest.py` | Route editions identified via `version_parent` or heuristics into `GameEdition`. |
| `backend/apps/search/services/search.py` | Include `GameEdition` matches in game search queries; annotate `matched_edition`. |
| `backend/apps/library/services/server_catalog.py` | Resolve scanned edition folders to the canonical base game and record matched edition. |
| `frontend/src/features/media/components/organisms/media-hero-library-actions.tsx` | Integrate edition selector with request/download buttons. |
| `frontend/src/features/media/game/components/organisms/media-download-game-button.tsx` | Pass selected `edition` to autonomous game request modal. |
| `frontend/src/features/media/types/index.ts` | Define TypeScript interfaces for `GameEdition`. |

---

## 📋 Task Breakdown

### Phase 1: Backend Data Model & Django Migration

- [ ] **Task 1.1: Create `GameEdition` Model**
  - Define `GameEdition` in `backend/apps/media/models/game_edition.py`:
    - `game = models.ForeignKey("media.Game", on_delete=models.CASCADE, related_name="editions")`
    - `name = models.CharField(max_length=255)`
    - `raw_title = models.CharField(max_length=1000)`
    - `igdb_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)`
    - `release_date = models.DateField(null=True, blank=True)`
    - `external_ids = models.JSONField(default=dict, blank=True)`
    - `cover_image_id = models.CharField(max_length=255, null=True, blank=True)`
    - `summary = models.TextField(null=True, blank=True)`
    - `is_default = models.BooleanField(default=False)`
  - Add `GameEdition` to `backend/apps/media/models/__init__.py`.
  - Generate and run Django migration: `python manage.py makemigrations media`.

- [ ] **Task 1.2: Add Serializers for `GameEdition`**
  - Create `backend/apps/media/serializers/game_edition.py`:
    - `GameEditionOutSerializer` emitting: `id`, `name`, `raw_title`, `igdb_id`, `release_date`, `external_ids`, `cover_image_id`, `summary`, `is_default`.
  - Update `MediaItemDetailSerializer` in `backend/apps/media/serializers/catalog.py`:
    - In `get_game()`, serialize `obj.game.editions.all()` as `editions`.
  - Ensure strict `snake_case` output contract.

---

### Phase 2: Ingestion & Identification Engine

- [ ] **Task 2.1: Implement Edition Detection Service**
  - Create `backend/apps/media/services/game_edition.py`:
    - `is_duplicate_edition(title: str, igdb_category: int | None = None, parent_name: str | None = None) -> tuple[bool, str]`:
      - Return `(True, edition_name)` if the game matches duplicate edition criteria.
      - Return `(False, "")` for full remakes (category 8) and standalone expansions (category 4).
    - `resolve_or_create_game_edition(parent_media_item: MediaItem, edition_data: dict) -> GameEdition`.
    - `find_canonical_base_game(title: str, igdb_id: int | None, version_parent_id: int | None) -> MediaItem | None`.

- [ ] **Task 2.2: Update IGDB Ingestion Pipeline**
  - In `backend/apps/media/services/igdb_ingest.py`:
    - Request `version_parent.id,version_parent.name` in IGDB game hydration queries.
    - Before creating a new `MediaItem`, check if the game has `version_parent` or matches edition criteria.
    - If it is an edition, resolve or seed the base game first, then attach the edition as a `GameEdition` row under `base_game.game`.
    - Ingest edition-specific external IDs (Steam, GOG, Epic) directly onto the `GameEdition.external_ids` map.

---

### Phase 3: Catalog Deduplication Management Command

- [ ] **Task 3.1: Build `deduplicate_game_editions` Command**
  - Create `backend/apps/media/management/commands/deduplicate_game_editions.py`:
    - Query all `MediaItem` rows with `media_type="game"`.
    - Detect candidate duplicates using title heuristics (`_strip_edition_markers`) and existing `parent_game_title`.
    - For each duplicate:
      1. Locate or verify canonical base game.
      2. Transfer external IDs, assets, and metadata into a `GameEdition` record.
      3. Update foreign keys in `UserLocalGame`, `GameMatchRecord`, and `UserMediaRequest` pointing to the duplicate `MediaItem` to point to the base game.
      4. Delete the duplicate `MediaItem`.
    - Support `--dry-run` flag for previewing changes.

- [ ] **Task 3.2: Write Comprehensive Backend Tests**
  - Create `backend/apps/media/tests/test_game_editions.py`:
    - Test detection of Witcher 3 GOTY, Cyberpunk Ultimate, Skyrim Special Edition.
    - Test exclusion of Resident Evil 4 Remake and standalone expansions.
    - Test deduplication command and relation repointing.

---

### Phase 4: Search & Scanner Integration

- [ ] **Task 4.1: Update Search Service for Editions**
  - In `backend/apps/search/services/search.py`:
    - Extend game search queries: match `MediaItem.title` OR `game__editions__name__icontains=q` OR `game__editions__raw_title__icontains=q`.
    - Deduplicate results so only the base `MediaItem` is returned once.
    - If matched via an edition, annotate `matched_edition: edition.name`.

- [ ] **Task 4.2: Update Local Scanner & Matcher**
  - In `backend/apps/library/services/server_catalog.py`:
    - When scanning local files (e.g., `The Witcher 3 Wild Hunt GOTY`), match against base games and attach the detected edition name to `GameMatchRecord.cleaned_title` / candidates.

---

### Phase 5: Frontend Game Hero & Editions UI

- [ ] **Task 5.1: Create TypeScript Types & Hook**
  - Update `frontend/src/features/media/types/index.ts` with `GameEdition`:
    ```ts
    export interface GameEdition {
      id: number
      name: string
      rawTitle: string
      igdbId?: string | null
      releaseDate?: string | null
      externalIds?: Record<string, string | number>
      coverImageId?: string | null
      summary?: string | null
      isDefault: boolean
    }
    ```
  - Create `frontend/src/features/media/game/hooks/use-game-editions.ts`:
    - Manages `selectedEdition` state, defaults to base game / default edition, provides helpers to access active store links and release date.

- [ ] **Task 5.2: Build `GameEditionSelector` Molecule**
  - Create `frontend/src/features/media/game/components/atoms/game-edition-selector.tsx`:
    - Arrow function component: `export const GameEditionSelector = (...) => { ... }`.
    - Uses Radix dropdown or glassmorphic tab pills styled with CSS theme variables (`var(--dk-surface-glass)`, `text-primary`, `bg-primary/10`).
    - No hardcoded hex or Tailwind palette colors; no arbitrary dots before text.

- [ ] **Task 5.3: Build `GameEditionsSection` Organism**
  - Create `frontend/src/features/media/game/components/organisms/game-editions-section.tsx`:
    - Displays all available editions in a responsive soft glassmorphic grid.
    - Highlights currently active edition.
    - Shows included DLC/content tags if present.

- [ ] **Task 5.4: Wire into Game Detail Page & Hero Actions**
  - Integrate `GameEditionSelector` into `frontend/src/features/media/components/organisms/media-hero-library-actions.tsx`.
  - Add `GameEditionsSection` to the game detail page layout in `frontend/src/features/media/pages/`.

---

### Phase 6: Autonomous Downloader & Request Modal Integration

- [ ] **Task 6.1: Connect Selected Edition to Request Flow**
  - In `frontend/src/features/media/game/components/organisms/media-download-game-button.tsx`:
    - Pass active `selectedEdition` name to the `MediaRequestConfirmModal`.
  - In `frontend/src/features/downloads/game-auto-match.ts`:
    - Enhance `scoreGameRelease` to award matching bonuses when release title matches the requested edition.

---

### Phase 7: Verification & Regression Testing

- [ ] **Task 7.1: Run Full Backend Test Suite**
  - Execute `python manage.py test apps.media apps.search apps.library`.
  - Verify zero regressions.

- [ ] **Task 7.2: Run Full Frontend & Desktop Test Suites**
  - Run `npm test` and `npm run typecheck` in `frontend/`.
  - Run `npm test` in `desktop/`.
  - Verify clean linting (`npm run lint`).

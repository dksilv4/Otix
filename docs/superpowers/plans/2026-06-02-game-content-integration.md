# Game Content Integration Plan

**Date:** 2026-06-02
**Scope:** Better model games in Otix, including DLC, expansions, editions, seasonal/live content, platform releases, and store ownership.
**Recommendation:** Extend the existing `game` media type instead of adding a separate catalog. IGDB stays the canonical game metadata source; Steam and local scanner data stay user/store ownership signals; SteamGridDB stays artwork.

## Current State

Otix already supports games as first-class media:

- `media_items.media_type` includes `game`, with a one-to-one `games` table.
- `Game` stores status, website, Steam app ID through `external_ids`, Steam stats, pricing JSON, review summary, multiplayer flag, and franchise link.
- `Platform`, `MediaPlatform`, `GameMode`, and `MediaGameMode` already model platform and mode metadata.
- `ExternalID` is the cross-provider identity spine for IGDB, Steam, SteamGridDB, and other store IDs.
- IGDB sync currently hydrates game metadata, genres, themes, platforms, modes, companies, ratings, franchise links, media assets, store IDs from websites, and then queues Steam/SteamGridDB enrichment.
- Steam integration currently handles user library, wishlist, playtime, current players, store details, reviews, pricing, and unmatched-game resolution through IGDB `external_games`.
- SteamGridDB integration already resolves artwork by platform/store ID and should remain an asset provider.
- Frontend detail pages expose games as a flat `GameDetail` section: platforms, game modes, Steam stats, Steam playtime, website, play/install/download actions.
- There is no game equivalent to TV `Season`/`Episode` or music `Track`. DLC, expansions, editions, seasonal content, updates, and bundles are not represented as structured children.

Key local files:

- `backend/otix/domain/media.py`
- `backend/otix/tasks/sync/igdb.py`
- `backend/otix/providers/igdb/client.py`
- `backend/otix/providers/igdb/transformer.py`
- `backend/otix/providers/steam/client.py`
- `backend/otix/tasks/sync/steam.py`
- `backend/otix/providers/steamgrid/client.py`
- `backend/otix/services/steam_library_service.py`
- `frontend/src/features/media/media-queries.ts`
- `frontend/src/features/media/organisms/game-section.tsx`
- `frontend/src/features/media/organisms/media-detail.tsx`
- `frontend/src/features/library/platforms/steam.tsx`
- `frontend/src/features/game-scanner/types.ts`

## External API Findings

### IGDB

Use as the canonical source for game-to-game relationships.

Relevant docs: https://api-docs.igdb.com/

Useful fields already in IGDB but not fully consumed by Otix:

- `game_type` and `game_status` replace deprecated `category` and `status`.
- `parent_game` identifies the main game for DLC, expansion, bundle parts, and related child entries.
- `version_parent` and `version_title` identify editions/versions.
- `dlcs`, `expansions`, `standalone_expansions`, `expanded_games`, `bundles`, `ports`, `remakes`, `remasters`, `forks`, and `similar_games` expose explicit game relationships.
- `release_dates` expose platform/region/status/date data that is richer than Otix's current single `release_date`.
- `game_time_to_beats` exposes main/extra/completion timings through IGDB.
- `language_supports`, `player_perspectives`, `multiplayer_modes`, and `game_engines` are useful detail-page enrichments.
- `external_games` supports mapping Steam and other platform IDs back to IGDB.

Otix should update IGDB queries from deprecated `status` to `game_status` and from deprecated `category` to `game_type`, then add the relationship fields above.

### Steam

Use for user ownership, playtime, wishlist, current players, price/review snapshots, and Steam-specific DLC/store packaging.

Relevant docs:

- Valve Web API overview: https://developer.valvesoftware.com/wiki/Steam_Web_API
- Steam Web API mirror used by the project: https://steamapi.xpaw.me/

Notes:

- `IPlayerService/GetOwnedGames` is good for owned apps and playtime but does not reliably answer catalog semantics.
- `ISteamUserStats/GetNumberOfCurrentPlayers` is appropriate for current-player counts.
- Store endpoints such as `appdetails`, `appreviews`, and wishlist data are useful but not officially documented by Valve in the same way as Web API endpoints. Treat them as enrichment, cache aggressively, and avoid making them the source of truth.
- Steam app details can expose app `type`, `dlc`, packages, release date, platforms, price, reviews, achievements, screenshots, movies, and recommendations. Use this data to annotate Steam availability, not to define canonical relationships.

### SteamGridDB

Use only for artwork resolution.

Relevant docs: https://www.steamgriddb.com/api/v2

Notes:

- It supports lookup by external platform ID and returns grids, heroes, logos, and icons.
- Otix already uses it well: platform/store IDs first, name search fallback second.
- Do not model SteamGridDB games as catalog entities unless there is no canonical source and the result is user-confirmed.

### RAWG

Use as a secondary source only if IGDB data is missing or for user-facing "related additions" cross-checks.

Relevant docs: https://api.rawg.io/docs/

Notes:

- RAWG exposes `/games/{game_pk}/additions` for DLC, GOTY editions, companion apps, and other editions.
- It also exposes stores, platforms, creators, tags, screenshots, trailers, Metacritic, and system requirements.
- This is useful as a fallback or validation provider, but adding another catalog source increases identity merge complexity.

### MobyGames

Use only if Otix wants historical release/platform precision.

Relevant docs: https://www.mobygames.com/info/api/

Notes:

- MobyGames exposes games, platforms, groups, platform-specific release data, screenshots, covers, genres, and attributes.
- Its non-commercial rate limit is low enough that it should be offline/backfill only, not interactive enrichment.

### Giant Bomb

Do not prioritize for the current goal.

Relevant docs: https://giantbomb.com/api

Notes:

- Useful for wiki-style content, concepts, and editorial metadata.
- Less directly useful than IGDB for game-to-game relationships and store IDs.

## Proposed Domain Model

Do not reuse `Season` for games. TV seasons are ordered episodic content with watched-state semantics. Game seasons, DLC, editions, ports, and expansions are relationship/content-package concepts with different interaction semantics.

### `game_content_items`

Represents structured children or variants of a game.

| Column | Notes |
|---|---|
| `id` | Otix ID |
| `parent_media_item_id` | FK to base game `media_items.id` |
| `media_item_id` | Optional FK if this content is also a full catalog game entry |
| `content_type` | `dlc`, `expansion`, `standalone_expansion`, `edition`, `bundle`, `port`, `remake`, `remaster`, `season`, `event`, `update`, `mod`, `soundtrack`, `other` |
| `title` | Child/variant title |
| `slug` | Stable slug scoped to parent |
| `overview` | Optional description |
| `release_date` | Optional date |
| `end_date` | For seasons/events |
| `status` | `announced`, `active`, `ended`, `released`, `delisted`, `cancelled`, `unknown` |
| `sort_order` | Display order |
| `metadata` | JSONB for provider-specific details |

### `game_relationships`

Represents relationship edges between two catalog games.

| Column | Notes |
|---|---|
| `source_media_item_id` | FK to game |
| `target_media_item_id` | FK to game |
| `relationship_type` | `dlc`, `expansion`, `standalone_expansion`, `bundle_member`, `version`, `port`, `remake`, `remaster`, `fork`, `similar`, `parent` |
| `provider` | `igdb`, `steam`, `rawg`, `manual` |
| `provider_relationship_id` | Optional external relationship key |
| `confidence` | Float, default 1.0 for explicit provider edges |
| `metadata` | JSONB |

This table lets a DLC be its own `media_item` when IGDB has a full game entry, while `game_content_items` lets Otix represent smaller or seasonal content that should not become a top-level catalog item.

### `game_releases`

Platform/region/store-specific release facts.

| Column | Notes |
|---|---|
| `media_item_id` | FK to game |
| `platform_id` | FK to `platforms` |
| `region_code` | Optional region |
| `release_date` | Optional date |
| `release_status` | IGDB release date status |
| `format` | Digital, physical, bundle, subscription, etc. |
| `provider` | Source |
| `external_id` | Source release ID |

This should complement existing `MediaRelease`, not replace it immediately. If `MediaRelease` is already used for age certifications, `game_releases` keeps platform availability separate.

### `game_store_offers`

Store availability, price, packages, and ownership metadata.

| Column | Notes |
|---|---|
| `media_item_id` | FK to game |
| `provider` | `steam`, `gog`, `epic`, etc. |
| `external_id` | Store ID |
| `url` | Store URL |
| `price_json` | Provider price blob |
| `is_free` | Boolean |
| `is_dlc` | Boolean |
| `parent_external_id` | Store parent app/product ID when available |
| `last_seen_at` | Freshness |

This removes pressure from the one-row `games.price_json` field and prepares for non-Steam stores.

## Provider Changes

### IGDB

- Expand `GAME_FIELDS` with `game_type`, `game_status`, `parent_game`, `version_parent`, `version_title`, `dlcs`, `expansions`, `standalone_expansions`, `expanded_games`, `bundles`, `ports`, `remakes`, `remasters`, `forks`, `release_dates`, `game_time_to_beats`, `multiplayer_modes`, `player_perspectives`, `language_supports`, and `external_games`.
- Add `IGDBProvider.get_related_games(igdb_id)` or hydrate related IDs from the main `get_game` response.
- Persist explicit game relationships from IGDB into `game_relationships`.
- Persist DLC/edition/season-like non-catalog rows into `game_content_items` only when they are not suitable as top-level games.
- Keep `get_games_offset` defaulting to `version_parent = null` for main catalog seeding, but allow child syncs by ID when discovered from relationships.
- Use `ExternalIDService` for every related IGDB ID so child entities can be linked, stubbed, or synced later.

### Steam

- Add a structured Steam store transformer that extracts `type`, `dlc`, `packages`, `platforms`, `price_overview`, `release_date`, `categories`, `genres`, `screenshots`, `movies`, and `recommendations`.
- Persist store data to `game_store_offers` and relationship candidates to `game_relationships` with lower confidence if not backed by IGDB.
- Keep user library and wishlist tables user-specific; do not promote a Steam wishlist item to catalog unless IGDB or manual matching confirms identity.
- Add a resolver path for Steam DLC app IDs: Steam app ID -> IGDB external_games -> catalog item or relationship candidate.

### RAWG

- Add later as `providers/rawg/` only if we need fallback DLC/edition coverage after IGDB expansion.
- Store RAWG IDs in `external_ids`.
- Use RAWG `/games/{id}/additions` as a secondary relationship source, not as primary catalog truth.

## API Changes

Add these read endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/media/{id}/game-content` | DLC, expansions, editions, seasons/events, releases |
| `GET` | `/media/{id}/game-relationships` | Related catalog games grouped by relationship type |
| `GET` | `/media/{id}/game-offers` | Store availability and price snapshots |

Update `MediaItemDetail` to include:

- `game.contentItems`
- `game.relationships`
- `game.releases`
- `game.storeOffers`
- Optional `game.timeToBeat`

Keep the detail endpoint backwards compatible by defaulting each collection to an empty list.

## Frontend Changes

### Game Detail Page

Replace the single flat `GameSection` with game-specific subsections:

- `GameOverviewSection`: modes, platforms, status, website, playtime, current players.
- `GameContentSection`: DLC, expansions, editions, seasons/events, and updates grouped by type.
- `GameEditionsSection`: editions/versions with clear parent-child labeling.
- `GameReleasesSection`: platform and region releases.
- `GameStoreOffersSection`: Steam and future store availability.
- `RelatedGamesSection`: ports, remakes, remasters, similar games, franchise entries.

### Library

- Keep Steam and Local Games as user-library tabs.
- Add filters for `Base games`, `DLC`, `Expansions`, `Editions`, and `Installed`.
- Use explicit relationships to avoid local scanner matching DLC/update folders to base games incorrectly.

### Interactions

- Base game interactions stay as existing `liked`, `watchlisted`, `played`, `started`.
- Do not mark DLC/season content as `played` until there is a separate content interaction model.
- Add optional `UserGameContentInteraction` later with states like `owned`, `installed`, `completed`, `skipped`.

## Implementation Plan

### Phase 1: IGDB relationship foundation

- [ ] Add `game_relationships`, `game_content_items`, `game_releases`, and `game_store_offers` models.
- [ ] Create Alembic migration and indexes on parent/source/target/provider/external ID.
- [ ] Add schemas for game content, relationships, releases, and offers.
- [ ] Expand IGDB `GAME_FIELDS` and transformer helpers.
- [ ] Persist IGDB relationship IDs without recursively syncing every child immediately.
- [ ] Add backend tests for IGDB transform and hydrator relationship persistence.

### Phase 2: Detail API and frontend display

- [ ] Load game content/relationships/releases/offers in `MediaService.get_media_item` or a dedicated game detail service.
- [ ] Add response fields to `GameDetail`.
- [ ] Split `GameSection` into focused game subsections.
- [ ] Add tabs or grouped rows for DLC, expansions, editions, and seasonal/live content.
- [ ] Add frontend tests for game detail rendering with empty and populated relationship data.

### Phase 3: Steam store enrichment

- [ ] Move Steam store details into a transformer.
- [ ] Persist Steam offers and DLC candidates.
- [ ] Resolve Steam DLC app IDs through IGDB `external_games`.
- [ ] Link user-owned DLC/wishlist apps to `game_content_items` or related media items where possible.
- [ ] Add tests for Steam DLC/edition extraction and merge behavior.

### Phase 4: Local scanner and downloads alignment

- [ ] Update local game matching to consider explicit base-game/content relationships.
- [ ] Prevent ISO/update filenames from auto-linking to the wrong DLC when the base game is more likely.
- [ ] Show installed base game and installed DLC/updates separately when local scan can identify both.
- [ ] Feed richer title/version parsing from the ISO organizer into `game_content_items`.

### Phase 5: Optional RAWG fallback

- [ ] Add RAWG provider only if IGDB coverage proves insufficient.
- [ ] Store RAWG IDs in `external_ids`.
- [ ] Use RAWG additions as low-priority relationship hints.
- [ ] Add a merge review/admin workflow for conflicts.

## Risks

- IGDB child relationships can create large sync fan-out. Queue child syncs lazily and cap recursion depth.
- Store APIs can drift or break, especially undocumented Steam store endpoints. Treat Steam as enrichment only.
- DLC and editions are ambiguous. Some should be top-level media items; others should be child rows. Use IGDB IDs and manual override tools to correct bad classification.
- Seasonal/live content is inconsistently represented by public APIs. `game_content_items` needs manual/provider metadata support rather than assuming IGDB has all seasons.
- Frontend clutter is likely if all relationship types are shown equally. Group and collapse lower-priority sections.

## Decision

Build the first version around IGDB relationship fields and Otix's existing `ExternalID` identity model. Add explicit game relationship/content tables, expose them on game detail pages, then use Steam and local scanner data to enrich user-specific availability and ownership.


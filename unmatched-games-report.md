# Unmatched Games Report

**Generated:** 2026-08-02 · **Source:** desktop `getLocalGames()`
**Library:** 377 games · **Matched:** 371 (98.4%) · **Unmatched:** 6

---

## Summary

Six games are not linked to an Otix media item. Of these:

| Category | Count | Games |
|---|---|---|
| Recovered by upgraded matcher (confirmed) | 2 | For The King, Tomb Raider I-III Remastered |
| Content packages (not real games) | 2 | Fortnite_JunoContent, Fortnite_StWContent |
| DLC with un-matchable Epic title | 2 | Civilization VI : Aztec DLC, LEGO® Star Wars™: Classic Obi-Wan |

---

## Per-game breakdown

### 1. For The King — *main_game* — **✅ RECOVERED (confirmed)**

- **Platform:** epic · **contentType:** main_game · no developer/publisher/year metadata
- **Root cause:** IGDB's relevance `search "For The King"` down-weights the common words "for"/"the", so the exact-title entry was entirely absent from search results. The game exists on IGDB (id 20331, IronOak Games, 2018).
- **Fix (universal):** new `search_games_by_name` provider method issues a `where name ~ *"..."*` substring filter, which reliably returns the exact-title entry. Added as a fallback in `_search_igdb_one` whenever the relevance search comes up empty.
- **Result (verified in container):** `FINAL: 'For the King' (id=20331) exact=True`.

### 2. Tomb Raider I-III Remastered Starring Lara Croft — *main_game* — **✅ RECOVERED (confirmed)**

- **Platform:** epic · **contentType:** main_game
- **Root cause (two layers):** (a) IGDB omits the "Starring Lara Croft" subtitle; (b) IGDB's canonical title spells the range as `I•II•III` (bullet list) while Epic uses `I-III` (hyphen range) — so the raw strings never collided.
- **Fix (universal):** `_igdb_search_query` strips `Starring`/`Featuring` subtitle clauses; `_canonical_numeral_seq` expands numeral ranges and bullet lists to a shared sequence — `I-III` → `N1 N2 N3`, `I•II•III` → `N1 N2 N3`.
- **Result (verified in container):** `FINAL: 'Tomb Raider I•II•III Remastered' (id=266683) exact=True`.

### 3. Fortnite_JunoContent — *dlc_addon* — **correctly unmatchable**

- **Platform:** epic · **contentType:** dlc_addon · `dlcOf: Fortnite`
- **Root cause:** Epic internal content package (Juno = Fortnite's build/content bundle). Not a real, user-facing game title; nothing on IGDB corresponds to it.
- **Recommendation:** suppress from matching entirely (or group under the base `Fortnite` entry). No algorithm change will ever match an internal package name.

### 4. Fortnite_StWContent — *dlc_addon* — **correctly unmatchable**

- **Platform:** epic · **contentType:** dlc_addon · `dlcOf: Fortnite`
- **Root cause:** Same as above — `StW` = "Save the World" content package. Internal Epic package name, not a game.
- **Recommendation:** suppress from matching entirely.

### 5. Civilization VI : Aztec DLC — *dlc_addon* — **needs DLC-aware matching**

- **Platform:** epic · **contentType:** dlc_addon · `dlcOf: Kinglet` (Civ VI internal codename)
- **Root cause:** Epic's DLC title is truncated/renamed (`Aztec DLC`) while IGDB names the DLC `Sid Meier's Civilization VI: Aztec Civilization Pack`. Even the universal key differs (`civilization n6 aztec dlc` vs `sid meier's civilization n6 aztec civilization pack` — not exact, not contained).
- **Recommendation:** this requires a DLC-parent heuristic: resolve `dlcOf` to the base game (Kinglet → Civilization VI), then match the DLC within the base game's DLC set. Out of scope for the current title-cleanliness upgrade.

### 6. LEGO® Star Wars™: Classic Obi-Wan — *dlc_addon* — **DLC not distinct on IGDB**

- **Platform:** epic · **contentType:** dlc_addon · `dlcOf: c390e582…` (LEGO Star Wars: The Skywalker Saga)
- **Root cause:** character-pack DLC. IGDB has no separate entry; the only IGDB candidate is the parent game `LEGO Star Wars: The Skywalker Saga - Classic Obi-Wan Kenobi` (id 388997), which must not be auto-assigned to a DLC.
- **Recommendation:** leave as unmatched / surface for manual review. Do not auto-assign to the parent game.

---

## Upgrade status

The universal matching upgrade is **ACTIVE and confirmed** (backend restarted, matcher verified in container):

- `backend/otix/services/game_matcher.py` now uses a cross-source comparison key (`_comparison_key`) that normalizes ™/®/© symbols, edition suffixes (`Game of the Year Edition`, `Starter Access`, …), roman↔arabic numerals (`Shenmue 3` ↔ `Shenmue III`, `40K` ↔ `40,000`), **numeral ranges & bullet lists** (`I-III` ↔ `I•II•III` → `N1 N2 N3`), **`Starring`/`Featuring` subtitle clauses**, hyphen↔colon subtitles, and trailing parentheticals — in phase-2 exact matching, IGDB search, and IGDB/SteamGrid scoring.
- New `IGDBProvider.search_games_by_name` fallback (`where name ~ *"..."*` substring filter) recovers titles the relevance `search` endpoint down-weights entirely (e.g. `For The King`).
- Verified live in the API container: For The King → id 20331 (exact), Tomb Raider I-III Remastered → id 266683 (exact).

### Result after restart (confirmed)

| Game | Before | After |
|---|---|---|
| For The King | unmatched (0 candidates) | **matched (exact)** |
| Tomb Raider I-III Remastered | unmatched | **matched (exact)** |
| Fortnite_JunoContent / StWContent | unmatched | still unmatched (suppress) |
| Civilization VI : Aztec DLC | unmatched | still unmatched (needs DLC heuristic) |
| LEGO® Star Wars™: Classic Obi-Wan | unmatched | still unmatched (only IGDB hit is the parent game) |

---

## Regenerating this report

The report is produced from the live desktop library via CDP:

```bash
# /tmp/unmatched_report.js queries window.desktopAPI.getLocalGames()
python3 /tmp/cdp_eval.py "$(cat /tmp/unmatched_report.js)" 20
```

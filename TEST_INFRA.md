# TEST_INFRA — Otix Nodes Architecture Overhaul Test Infrastructure

## Overview
This document defines the 5-tier test architecture, test philosophy, feature inventory coverage matrix (F1–F25), and cross-language parser parity specifications for the Otix Nodes Architecture Overhaul across all four tiers:
- **Go Daemon (`node/`):** Companion daemon, indexing, watchers, periodic polling, modular file reorganization, process tracking, cloud save sync.
- **Backend Service (`backend/`):** Django 5.2 / DRF 3.16, unified `UserNode` model and `/api/v1/nodes/*` namespace, relational multi-source schema (`UserGame` to `NodeGameSource`), database-only manifest ingest, emulation platform catalog.
- **Desktop Companion (`desktop/`):** Electron 35/42, TypeScript IPC bridge, emulator detection and CLI argument templating (%ROM%, %BIOS%), process execution monitoring, save snapshotting.
- **Frontend Client (`frontend/`):** React 18/19, Vite 5, Tailwind CSS, multi-source library cards with availability badges ("Installed on Desktop", "Archived on NAS", "Network Share"), contextual launch/download actions, overhauled Node Settings.

---

## 1. Test Philosophy

Otix testing adheres to four foundational principles:

1. **Opaque-Box Testing:**
   Tests treat components as opaque execution boundaries, exercising public interfaces (REST API endpoints, IPC handlers, CLI execution templates, filesystem side-effects, database state transitions) rather than asserting against private internal methods or transient variables.

2. **Requirement-Driven & Traced:**
   Every test case directly references an authoritative requirement from `ORIGINAL_REQUEST.md` (§ 2026-11-03T01:47:54Z) and a feature specification from `PROJECT.md` (F1–F25). Facade tests that pass vacuously without exercising real business logic are strictly prohibited.

3. **Deterministic Cross-Language Parity:**
   Otix parses file and release metadata across three different languages:
   - **Go** in `node/internal/parser/` (companion daemon filesystem indexer)
   - **TypeScript** in `desktop/game/parser.ts` (desktop scanner & local matcher)
   - **Python** in `backend/apps/library/services/server_catalog.py` (backend catalog ingest)
   All three parsers consume the identical shared test fixture suite (`fixtures/parser_fixtures.json`) and must yield 100% deterministic, normalized output for titles, clean titles, editions, release groups, platforms, regions, versions, and title IDs.

4. **Zero Mock Data in Test Fixtures:**
   Test fixtures are derived directly from authoritative real-world sources: scene release standards (SceneRules, NFOs), repacker naming patterns (FitGirl, DODI, ElAmigos), digital platform naming (GOG, Steam, Epic), and retro console preservation database standards (No-Intro, Redump, TOSEC).

---

## 2. 5-Tier Test Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│             Tier 5: Adversarial, Fuzzing & Stress Testing              │
│  Corrupt ROM Headers • Unclosed File Handles • 5,000+ File Libraries    │
│  Race Conditions • Network Drops • Malformed JSON • Unsafe Moves       │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 4: End-to-End System & Workflow Workloads             │
│  Full Scan -> Manifest Ingest -> Relational Library Card -> Play/DL   │
│  Emulator Detection -> Launch CLI Interpolation -> Save Sync Loop      │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 3: Specification-Driven Parser Parity                 │
│  Shared 105+ JSON Fixtures across Go, TypeScript & Python Parsers     │
│  PC Standalone • Multi-Part Repacks • Updates/DLCs • 11 Console Types  │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 2: Subsystem Integration & Contract Gates             │
│  Unified /api/v1/nodes/* REST API • Multi-Source Relational Aggregation│
│  Daemon SSE Progress • Desktop IPC Handlers • DB-Only Manifest Ingest  │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 1: Fast Unit & Component Isolation                    │
│  Go Unit Tests (`go test ./...`) • Desktop Vitest • Frontend Vitest    │
│  Django Model & Serializer Tests • Organize Module Safety Contracts    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Feature Inventory & Coverage Matrix (F1–F25)

| Feature | Description | Primary Tier | Verification Tool / Command |
|---|---|---|---|
| **F1** | Shared Parser Test Fixtures (105+ cases) | Tier 3 | `scripts/verify-fixtures.mjs`, Go/TS/Python test runners |
| **F2** | `UserNode` Model & Namespace Unification | Tier 1/2 | `pytest backend/apps/library/tests/test_nodes_api.py` |
| **F3** | Daemon Persistent NodeID & Interface Detection | Tier 1/2 | `go test ./internal/config ./internal/heartbeat` |
| **F4** | Desktop & Frontend Legacy Route Purge | Tier 1/2 | `npm --prefix desktop test`, `npm --prefix frontend test` |
| **F5** | Relational Multi-Source Backend Schema | Tier 1/2 | `pytest backend/apps/library/tests/test_game_sources.py` |
| **F6** | Multi-Source Query Aggregation & Serialization | Tier 2 | `pytest backend/apps/library/tests/test_multi_source_api.py` |
| **F7** | Database-Only Metadata Persistence | Tier 2/4 | Manifest ingest tests; verify zero `.otix` sidecar files written |
| **F8** | Daemon Hybrid File Change Detection | Tier 1/2 | `go test ./internal/indexer` (fsnotify vs polling benchmark) |
| **F9** | Daemon Incremental Rescan & SSE Streaming | Tier 2/4 | `go test -run TestScanFolderSSE ./internal/indexer` |
| **F10** | Go Unified Parser Implementation | Tier 3 | `go test ./internal/parser/...` |
| **F11** | TypeScript Parser Parity | Tier 3 | `npm --prefix desktop test -- desktop/tests/parser-parity.test.ts` |
| **F12** | Python Parser Parity | Tier 3 | `pytest backend/apps/library/tests/test_parser_parity.py` |
| **F13** | Organize IP Purge & Static Map Removal | Tier 1 | Ripgrep audit for `192.168.1.58`; `go test ./internal/organize` |
| **F14** | Modular Organize Engine Decomposition | Tier 1/2 | Subsystem isolation tests (`planning`, `execution`, `cleanup`) |
| **F15** | Zero-Data-Loss Organize Safety Guardrails | Tier 1/5 | Dry-run tokens, collision skip, atomic move, prune safety |
| **F16** | First-Class Emulation Backend Models | Tier 1/2 | `pytest backend/apps/library/tests/test_emulation_models.py` |
| **F17** | Desktop Emulator Detection & CLI Templates | Tier 1/2 | `npm --prefix desktop test -- desktop/tests/emulator.test.ts` |
| **F18** | Automated Process Tracking & Save Snapshot | Tier 2/4 | Process start/exit listener and directory snapshotting tests |
| **F19** | Bidirectional Cloud Save Sync Engine | Tier 2/4 | Conflict resolution tests (newest timestamp, HTTP 409) |
| **F20** | Contextual Path Rendering & Multi-Source Cards| Tier 1/4 | `npm --prefix frontend test -- MultiSourceCard.test.tsx` |
| **F21** | Contextual Launch & 1-Click Install Actions | Tier 1/4 | Direct launch vs download-install action tests |
| **F22** | Node Settings & Management UI Overhaul | Tier 1/4 | Node settings organism tests; health badge rendering |
| **F23** | Frontend Design Rules & Glassmorphism | Tier 1 | Lint & AST checker (arrow functions only, no component helpers) |
| **F24** | E2E Integration Suite & Tier 1-4 Verification | Tier 4 | Complete cross-tier integration test execution |
| **F25** | Adversarial Coverage Hardening & Forensic Audit | Tier 5 | Stress suite, fuzzing, path traversal, memory leak checks |

---

## 4. Shared Parser Fixture Specification

### 4.1. File Location & Format
The shared fixture file is committed at:
```
fixtures/parser_fixtures.json
```
It is a JSON document strictly conforming to the following structure:
```json
{
  "cases": [
    {
      "input": "The.Witcher.3.Wild.Hunt.v1.31-GOG",
      "ext_hint": "",
      "parent_dir": "",
      "expected": {
        "title": "The Witcher 3: Wild Hunt",
        "clean_title": "the witcher 3 wild hunt",
        "year": "2015",
        "edition": "",
        "platform": "PC",
        "release_group": "GOG",
        "region": "World",
        "version": "1.31",
        "title_id": "",
        "is_scene": false
      }
    }
  ]
}
```

### 4.2. Schema Field Definitions

| Field | Type | Description |
|---|---|---|
| `input` | string | Raw filename or release directory name being parsed. |
| `ext_hint` | string | Optional file extension without leading dot (e.g. `"nsp"`, `"iso"`, `"sfc"`). Empty string `""` if not provided. |
| `parent_dir` | string | Optional parent directory name for multi-disc, repack, or folder-based titles. Empty string `""` if not provided. |
| `expected.title` | string | Normalized title formatted with proper capitalization and subtitle delimiters (`:`, `-`). |
| `expected.clean_title` | string | Lowercase, alphanumeric + single-spaced search key used for catalog matching. |
| `expected.year` | string | 4-digit release year (e.g. `"2015"`) or empty string `""` if unknown/absent. |
| `expected.edition` | string | Normalized edition string (e.g. `"GOTY Edition"`, `"Director's Cut"`, `"Complete Edition"`) or empty string `""`. |
| `expected.platform` | string | Standardized platform name: `"PC"`, `"NES"`, `"SNES"`, `"N64"`, `"GameCube"`, `"Wii"`, `"Switch"`, `"PS1"`, `"PS2"`, `"PS3"`, `"PSP"`, `"Dreamcast"`. |
| `expected.release_group` | string | Recognized scene or P2P release group (e.g. `"CODEX"`, `"SKIDROW"`, `"FLT"`, `"EMPRESS"`, `"RUNE"`, `"FitGirl"`, `"DODI"`, `"ElAmigos"`, `"GOG"`) or empty string `""`. |
| `expected.region` | string | Geographic region if detectable (e.g. `"USA"`, `"Europe"`, `"Japan"`, `"World"`) or empty string `""`. |
| `expected.version` | string | Semantic or build version string (e.g. `"1.31"`, `"1.0.4"`, `"4.04"`) or empty string `""`. |
| `expected.title_id` | string | Platform-specific media identifier (e.g. Switch hex `0100F2C0115B6000`, PS2 `SLUS-20062`, PS3 `BCUS98174`, PSP `ULUS-10336`) or empty string `""`. |
| `expected.is_scene` | boolean | `true` if adhering to standard scene naming rules (`<Title>-<GROUP>`), `false` for P2P repacks, digital extras, or retro ROM files. |

### 4.3. Test Coverage Breakdown (>= 105 Cases)
The fixture suite comprises:
- **PC Standalone Releases & Scene Tags (25 cases):** CODEX, SKIDROW, FLT, EMPRESS, PROPHET, ELAMIGOS, DODI, FITGIRL, MULTI12, GOG, STEAM, build numbers, and versions.
- **Multi-Part Repacks, Archives, Bin Sets & ISOs (25 cases):** Multi-part `.rar` / `.part01.rar`, `.part1.rar`, `.bin`/`.cue` multi-bin, multi-disc ISOs (`Disc 1`, `CD1`), FitGirl multi-bin folders, DODI selective downloads.
- **Updates, DLCs, Patches & Hotfixes (15 cases):** Updates (`Update.v1.2.3-CODEX`), standalone DLC packs (`DLC.Pack`), Day One patches, hotfixes, and crackfixes.
- **Retro Console Preservation Titles (44 cases across 11 platforms):**
  - **NES** (4 cases): `.nes` ROMs, revision tags, No-Intro region formatting.
  - **SNES** (4 cases): `.sfc`, `.smc` ROMs, multi-region releases.
  - **N64** (4 cases): `.z64`, `.n64`, `.v64` byte-swapped and big-endian ROMs.
  - **GameCube** (4 cases): `.iso`, `.gcm`, `.rvz` dumps.
  - **Wii** (4 cases): `.wbfs`, `.iso`, `.rvz` disc images.
  - **Switch** (4 cases): `.nsp`, `.xci`, 16-hex Title IDs (`0100F2C0115B6000`), version increments (`v0`, `v65536`).
  - **PS1** (4 cases): `.cue`/`.bin`, `.chd`, `.pbp` multi-disc titles.
  - **PS2** (4 cases): `.iso`, `.chd`, serial Title IDs (`SLUS-20062`, `SLES-50361`).
  - **PS3** (4 cases): `.iso`, `PS3_GAME` structures, serial Title IDs (`BCUS98174`, `BLES00909`).
  - **PSP** (4 cases): `.iso`, `.cso`, `.pbp` eboot files, serial IDs (`ULUS-10336`).
  - **Dreamcast** (4 cases): `.gdi`, `.cdi`, `.chd` multi-track dumps.

---

## 5. Cross-Language Runner Specifications

### 5.1. Go Test Runner (`node/internal/parser/parser_parity_test.go`)
```go
package parser_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"otix-node/internal/parser"
)

type FixtureFile struct {
	Cases []TestCase `json:"cases"`
}

type TestCase struct {
	Input     string           `json:"input"`
	ExtHint   string           `json:"ext_hint"`
	ParentDir string           `json:"parent_dir"`
	Expected  ExpectedMetadata `json:"expected"`
}

type ExpectedMetadata struct {
	Title        string `json:"title"`
	CleanTitle   string `json:"clean_title"`
	Year         string `json:"year"`
	Edition      string `json:"edition"`
	Platform     string `json:"platform"`
	ReleaseGroup string `json:"release_group"`
	Region       string `json:"region"`
	Version      string `json:"version"`
	TitleId      string `json:"title_id"`
	IsScene      bool   `json:"is_scene"`
}

func TestParserParityWithSharedFixtures(t *testing.T) {
	fixturePath := filepath.Join("..", "..", "..", "fixtures", "parser_fixtures.json")
	data, err := os.ReadFile(fixturePath)
	require.NoError(t, err, "Failed to read parser_fixtures.json")

	var ff FixtureFile
	err = json.Unmarshal(data, &ff)
	require.NoError(t, err, "Failed to unmarshal parser_fixtures.json")
	require.GreaterOrEqual(t, len(ff.Cases), 105, "Must contain at least 105 test cases")

	for _, tc := range ff.Cases {
		t.Run(tc.Input, func(t *testing.T) {
			opts := parser.ParseOptions{
				ExtHint:   tc.ExtHint,
				ParentDir: tc.ParentDir,
			}
			actual := parser.Parse(tc.Input, opts)

			assert.Equal(t, tc.Expected.Title, actual.Title, "Title mismatch")
			assert.Equal(t, tc.Expected.CleanTitle, actual.CleanTitle, "CleanTitle mismatch")
			assert.Equal(t, tc.Expected.Platform, actual.Platform, "Platform mismatch")
			assert.Equal(t, tc.Expected.ReleaseGroup, actual.ReleaseGroup, "ReleaseGroup mismatch")
			assert.Equal(t, tc.Expected.Year, actual.Year, "Year mismatch")
			assert.Equal(t, tc.Expected.Edition, actual.Edition, "Edition mismatch")
			assert.Equal(t, tc.Expected.Region, actual.Region, "Region mismatch")
			assert.Equal(t, tc.Expected.Version, actual.Version, "Version mismatch")
			assert.Equal(t, tc.Expected.TitleId, actual.TitleId, "TitleId mismatch")
			assert.Equal(t, tc.Expected.IsScene, actual.IsScene, "IsScene mismatch")
		})
	}
}
```

### 5.2. TypeScript Test Runner (`desktop/tests/parser-parity.test.ts`)
```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseRelease } from '../game/parser';

interface TestCase {
  input: string;
  ext_hint: string;
  parent_dir: string;
  expected: {
    title: string;
    clean_title: string;
    year: string;
    edition: string;
    platform: string;
    release_group: string;
    region: string;
    version: string;
    title_id: string;
    is_scene: boolean;
  };
}

describe('Specification-Driven Parser Parity (fixtures/parser_fixtures.json)', () => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/parser_fixtures.json');
  const rawData = fs.readFileSync(fixturePath, 'utf-8');
  const { cases } = JSON.parse(rawData) as { cases: TestCase[] };

  it('contains at least 105 test cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(105);
  });

  cases.forEach((tc) => {
    it(`parses: ${tc.input}`, () => {
      const actual = parseRelease(tc.input, {
        extHint: tc.ext_hint,
        parentDir: tc.parent_dir,
      });

      expect(actual.title).toBe(tc.expected.title);
      expect(actual.cleanTitle).toBe(tc.expected.clean_title);
      expect(actual.platform).toBe(tc.expected.platform);
      expect(actual.group ?? '').toBe(tc.expected.release_group);
      expect(actual.year ?? '').toBe(tc.expected.year);
      expect(actual.edition ?? '').toBe(tc.expected.edition);
      expect(actual.region ?? '').toBe(tc.expected.region);
      expect(actual.version ?? '').toBe(tc.expected.version);
      expect(actual.titleId ?? '').toBe(tc.expected.title_id);
      expect(actual.isScene).toBe(tc.expected.is_scene);
    });
  });
});
```

### 5.3. Python Test Runner (`backend/apps/library/tests/test_parser_parity.py`)
```python
import json
from pathlib import Path
import pytest
from apps.library.services.server_catalog import parse_release_name

FIXTURE_PATH = Path(__file__).resolve().parents[4] / "fixtures" / "parser_fixtures.json"

def load_fixtures():
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["cases"]

FIXTURE_CASES = load_fixtures()

def test_fixture_count():
    assert len(FIXTURE_CASES) >= 105

@pytest.mark.parametrize("case", FIXTURE_CASES, ids=[c["input"] for c in FIXTURE_CASES])
def test_parser_parity(case):
    actual = parse_release_name(
        case["input"],
        ext_hint=case["ext_hint"],
        parent_dir=case["parent_dir"]
    )
    expected = case["expected"]

    assert actual.title == expected["title"]
    assert actual.clean_title == expected["clean_title"]
    assert actual.platform == expected["platform"]
    assert (actual.release_group or "") == expected["release_group"]
    assert (actual.year or "") == expected["year"]
    assert (actual.edition or "") == expected["edition"]
    assert (actual.region or "") == expected["region"]
    assert (actual.version or "") == expected["version"]
    assert (actual.title_id or "") == expected["title_id"]
    assert actual.is_scene == expected["is_scene"]
```

---

## 6. Execution & Verification Commands

| Scope | Command | Purpose |
|---|---|---|
| Fixture Validation | `node scripts/verify-fixtures.mjs` | Validates JSON integrity, schema compliance, >= 105 count |
| Go Daemon Suite | `cd node && go test -v ./...` | Unit, integration & parser tests for daemon |
| Desktop Vitest | `npm --prefix desktop test` | Desktop companion, IPC bridge, Vitest parser parity |
| Frontend Vitest | `npm --prefix frontend test` | Frontend UI components, stores, hooks |
| Backend Pytest | `pytest backend/apps/library` | Django REST API, nodes endpoints, catalog matching |

---

## 7. Pass/Fail Gates

1. **Schema & Count Gate:** `fixtures/parser_fixtures.json` must be strictly valid JSON containing >= 105 entries with all required keys.
2. **Deterministic Parity Gate:** 100% of fixtures must yield identical output attributes across Go, TypeScript, and Python test runners.
3. **Zero Sidecar Gate:** No `.otix` sidecar file may be created or modified on any filesystem during scanning or matching.
4. **Zero Regression Gate:** All existing unit and integration suites in `node/`, `backend/`, `desktop/`, and `frontend/` must pass cleanly.

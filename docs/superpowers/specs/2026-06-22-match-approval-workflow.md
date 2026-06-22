# Match Approval Workflow

**Date:** 2026-06-22
**Status:** Proposal
**Driver:** Match quality assurance — auto-matches need admin verification before creating canonical external_id mappings

---

## Problem

Auto-matches from the game matching pipeline create `external_ids` mappings immediately. Wrong matches pollute the shared database, affecting all users. `confirmed_count` becomes misleading because it counts automated confirmations, not human-verified ones.

## Proposal

Auto-matches enter a **"pending"** state. Admins review and approve/reject them through a dedicated panel. Only approved matches create canonical `external_ids` entries and increment `confirmed_count`.

---

## 1. Data Model

### 1.1 New column on `game_matches` (desktop SQLite)

```sql
ALTER TABLE game_matches ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
-- Values: 'pending' | 'approved' | 'rejected'
```

### 1.2 New table on backend (PostgreSQL)

```sql
CREATE TABLE match_proposals (
  id TEXT PRIMARY KEY DEFAULT gen_otix_id(),
  source TEXT NOT NULL,         -- 'epic', 'gog', etc.
  source_game_id TEXT NOT NULL, -- plugin-local game ID
  source_title TEXT NOT NULL,   -- original title from scanner
  developer TEXT,
  release_year INT,
  poster_url TEXT,
  otix_media_id TEXT NOT NULL REFERENCES media_items(id),
  otix_title TEXT NOT NULL,
  otix_confidence REAL NOT NULL,
  match_type TEXT NOT NULL,     -- 'direct', 'exact_title', 'ilike', 'igdb_crossref', 'igdb_search'
  proposed_by TEXT NOT NULL,    -- 'auto' | user_id
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by TEXT,             -- admin user_id
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source, source_game_id)
);
```

---

## 2. Flow

```
Scan
  │
  ├─ Auto-match found (confidence ≥ threshold)
  │   │
  │   ├─ Desktop: INSERT INTO game_matches (status='pending')
  │   ├─ Desktop: POST /match/propose  →  backend match_proposals (status='pending')
  │   └─ Frontend: shows "Pending Approval" badge (amber)
  │
  ├─ Candidates found
  │   └─ User manually accepts → Desktop: INSERT game_matches (status='approved')
  │                          → Desktop: POST /match/confirm (creates external_id + proposal='approved')
  │
  └─ Admin panel
      │
      ├─ GET /admin/match-proposals?status=pending
      ├─ Side-by-side comparison: original game ↔ Otix match
      ├─ [Approve] → POST /admin/match-proposals/{id}/approve
      │              → Creates external_id mapping
      │              → Increments confirmed_count on external_ids
      │
      └─ [Reject]  → POST /admin/match-proposals/{id}/reject
                     → Deletes game_matches entry
                     → Adds to match_skips
```

---

## 3. Confidence-Driven Auto-Approval

Not all matches need manual review. High-confidence matches can auto-approve:

| Confidence | Match Type | Action |
|-----------|------------|--------|
| 1.0 | DIRECT (3+ confirms) | Auto-approve |
| ≥ 0.98 | DIRECT (1+ confirm) | Auto-approve |
| ≥ 0.95 | EXACT_TITLE | Auto-approve |
| ≥ 0.90 | DIRECT (0 confirms) | Pending review |
| ≥ 0.85 | IGDB_CROSSREF | Pending review |
| ≥ 0.80 | IGDB_SEARCH | Pending review |
| < 0.80 | Any | Pending review |

Auto-approved matches skip the admin queue and create external_id mappings immediately.

---

## 4. Admin Panel UI

```
┌─────────────────────────────────────────────────────────────┐
│  Match Proposals                             23 pending     │
│                                                             │
│  Filters: [All] [Pending] [Approved] [Rejected]             │
│                                                             │
│  ┌─ Grand Theft Auto V ─────────────────────────────────┐   │
│  │  Source: Epic Games  │  Match: GTA V (0.90)          │   │
│  │  Developer: R*       │  Developer: Rockstar Games    │   │
│  │  Year: 2013          │  Year: 2013                   │   │
│  │  [Poster]            │  [Poster]                     │   │
│  │  [✓ Approve] [✗ Reject]                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Alien: Isolation ───────────────────────────────────┐   │
│  │  ...                                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/match/propose` | Desktop submits auto-match proposal |
| `GET` | `/admin/match-proposals` | List proposals (paginated, filterable by status/source) |
| `GET` | `/admin/match-proposals/{id}` | Get proposal detail with both game data |
| `POST` | `/admin/match-proposals/{id}/approve` | Admin approves — creates external_id + increments confirmed_count |
| `POST` | `/admin/match-proposals/{id}/reject` | Admin rejects — adds to match_skips |

---

## 6. Backward Compatibility

- Desktop single-user mode: all matches auto-approved (user is admin)
- Existing `POST /match/confirm` endpoint unchanged — manual user confirmations still create external_ids directly
- Existing `game_matches` table preserved — `status` column defaults to 'approved' for existing rows

---

## 7. Implementation Order

| Step | What |
|------|------|
| 1 | Add `status` column to `game_matches` (desktop) |
| 2 | Create `match_proposals` table + migration (backend) |
| 3 | Replace `confirmOnBackend` with `POST /match/propose` in orchestrator |
| 4 | Add auto-approval logic based on confidence tiers |
| 5 | Build admin endpoints (`/admin/match-proposals`) |
| 6 | Build admin UI panel |
| 7 | Add "Pending Approval" badge to frontend game cards |

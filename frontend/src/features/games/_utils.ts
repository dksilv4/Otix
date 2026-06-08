import type { CatalogGame, LocalGame, GamesTab, ShelfRow } from "./types"

// ── Filtering ────────────────────────────────────────────────────────

export function filterGamesByTab(
  games: LocalGame[],
  tab: GamesTab,
  searchQuery: string,
): LocalGame[] {
  let result = games
  if (tab === "matched") result = result.filter((g) => g.data?.id)
  if (tab === "unmatched") result = result.filter((g) => !g.data?.id)
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    result = result.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.platform.toLowerCase().includes(q) ||
        g.installDir.toLowerCase().includes(q),
    )
  }
  return result
}

// ── Shelves ──────────────────────────────────────────────────────────

export function buildGameShelves(
  matchedGames: LocalGame[],
  unmatchedGames: LocalGame[],
  localGames: LocalGame[],
  popularGames: CatalogGame[],
): ShelfRow[] {
  const rows: ShelfRow[] = []

  if (matchedGames.length > 0) {
    rows.push({
      id: "matched",
      label: "Installed Games",
      icon: "✓",
      games: matchedGames.slice(0, 12),
    })
  }

  const suggested = localGames.filter((g) => g.matchSuggestion)
  if (suggested.length > 0) {
    rows.push({
      id: "suggested",
      label: "Suggested Matches",
      icon: "🔗",
      games: suggested.slice(0, 8),
    })
  }

  const unmatched = unmatchedGames.filter((g) => !g.matchSuggestion)
  if (unmatched.length > 0) {
    rows.push({
      id: "unmatched",
      label: "Unmatched Games",
      icon: "🔍",
      games: unmatched.slice(0, 8),
    })
  }

  if (popularGames.length > 0) {
    rows.push({
      id: "popular",
      label: "Popular on Otix",
      icon: "🔥",
      games: [],
      catalogGames: popularGames.slice(0, 12),
    })
  }

  return rows
}

// ── Scan merge ───────────────────────────────────────────────────────

/**
 * Preserve previous match/suggestion data on rescanned games
 * so user doesn't lose accepted matches or pending suggestions.
 */
export function carryOverExistingMatches(
  scanned: LocalGame[],
  previousGames: LocalGame[],
): LocalGame[] {
  const carryOver = new Map<string, LocalGame>()
  for (const g of previousGames) {
    if (g.data?.id || g.matchSuggestion) carryOver.set(g.id, g)
  }
  return scanned.map((g) => {
    if (g.data?.id || g.matchSuggestion) return g
    const prev = carryOver.get(g.id)
    if (!prev) return g
    return { ...g, ...prev }
  })
}

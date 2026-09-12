import type { LocalGame } from "../types";

// ── Title normalization ───────────────────────────────────────────

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[-.\s](goty|game of the year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|vr|directors? cut)\s*edition/gi, "")
    .replace(/\bii\b/g, '2')
    .replace(/\biii\b/g, '3')
    .replace(/\biv\b/g, '4')
    .replace(/\bv\b/g, '5')
    .replace(/\bvi\b/g, '6')
    .replace(/\bvii\b/g, '7')
    .replace(/\bviii\b/g, '8')
    .replace(/\bix\b/g, '9')
    .replace(/\bx\b/g, '10')
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// ── Dedup ─────────────────────────────────────────────────────────

/** Titles that mark a row as a DLC/beta/trial/edition sideline of a parent game. */
const SIDELINE_RE = /\b(dlc|betas?|test|testing|trial|prelude|demo|playtest)\b/i

/**
 * Merge rows that resolve to the same game — by catalog id when matched
 * (so a game's DLC/beta/trial entries collapse into its parent), otherwise by
 * normalized title. Keeps the most representative row as the winner.
 */
export function mergeDuplicateGames(games: LocalGame[]): LocalGame[] {
  const groups = new Map<string, LocalGame[]>();
  const keyFor = (g: LocalGame) =>
    g.otixMediaId || g.data?.id || `t:${normalizeTitle(g.title)}`;

  for (const g of games) {
    const key = keyFor(g);
    const existing = groups.get(key);
    if (existing) existing.push(g);
    else groups.set(key, [g]);
  }

  const merged: LocalGame[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    const catalogTitle = group[0].otixMediaTitle || group[0].data?.title;

    const best = [...group].sort((a, b) => {
      // Prefer the row whose title matches the catalog title exactly (the parent).
      if (catalogTitle) {
        const aExact = normalizeTitle(a.title) === normalizeTitle(catalogTitle) ? 1 : 0;
        const bExact = normalizeTitle(b.title) === normalizeTitle(catalogTitle) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }
      // Prefer non-DLC / non-beta / non-trial rows.
      const aNoise = SIDELINE_RE.test(a.title) ? 1 : 0;
      const bNoise = SIDELINE_RE.test(b.title) ? 1 : 0;
      if (aNoise !== bNoise) return aNoise - bNoise;
      // Prefer matched data.
      if (a.data?.id && !b.data?.id) return -1;
      if (!a.data?.id && b.data?.id) return 1;
      // Shorter title wins (fewer edition suffixes).
      if (a.title.length !== b.title.length) return a.title.length - b.title.length;
      return 0;
    })[0];

    const sources = [...new Set(group.map((g) => g.platform))];

    merged.push({
      ...best,
      sources: sources.length > 1 ? sources : undefined,
      exePath: group.find((g) => g.platform === 'steam')?.exePath ?? best.exePath,
      installDir: best.installDir,
    });
  }

  return merged;
}

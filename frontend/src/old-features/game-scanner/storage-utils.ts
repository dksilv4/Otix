import type { LocalGame } from "./types";

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

/** Merge games with the same normalized title, keeping the highest-priority source. */
export function mergeDuplicateGames(games: LocalGame[]): LocalGame[] {
  const groups = new Map<string, LocalGame[]>();
  for (const g of games) {
    const key = normalizeTitle(g.title);
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

    const getPriority = (g: LocalGame) => {
      if (g.platform === 'steam') return 4;
      if (g.platform !== 'iso') return 3;
      return 1;
    };

    const best = [...group].sort((a, b) => {
      if (a.data?.id && !b.data?.id) return -1;
      if (!a.data?.id && b.data?.id) return 1;
      const pA = getPriority(a);
      const pB = getPriority(b);
      if (pA !== pB) return pB - pA;
      if (a.iconUrl && !b.iconUrl) return -1;
      if (!a.iconUrl && b.iconUrl) return 1;
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

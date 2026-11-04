import type { LocalGame, LocalGameSource } from "../types";
import { loadUnlinkedSourcePairs, getUnlinkedPairKey } from "@/features/settings/utils/scanned-summary";

// ── Title normalization ───────────────────────────────────────────

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, "")
    // Strip disc image and archive extensions
    .replace(/\.(iso|bin|cue|chd|cso|mdf|nrg|img|vhd|vhdx|rar|7z|zip)$/i, "")
    // Strip disc / disk / CD indicators
    .replace(/\b(?:disc|disk|cd|dvd)\s*\d*\b/gi, "")
    .replace(/[-.\s](goty|game of the year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|vr|directors? cut|edition|digital|standard)\s*(edition)?/gi, "")
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
const SIDELINE_RE = /\b(dlc|betas?|test|testing|trial|prelude|demo|playtest)\b/i;

const isIsoGame = (g: LocalGame): boolean =>
  g.platform === 'iso' ||
  g.title.toLowerCase().endsWith('.iso') ||
  Boolean(g.exePath?.toLowerCase().endsWith('.iso'));

const isInstalledPlayable = (g: LocalGame): boolean =>
  !isIsoGame(g) && Boolean(g.exePath);

/**
 * Merge rows that resolve to the same game — by catalog id when matched
 * (so a game's DLC/beta/trial entries collapse into its parent), otherwise by
 * normalized title. Keeps the most representative row as the winner.
 */
export function mergeDuplicateGames(games: LocalGame[]): LocalGame[] {
  const groups = new Map<string, LocalGame[]>();
  const unlinkedPairs = loadUnlinkedSourcePairs();
  const isUnlinked = (idA: string, idB: string) =>
    unlinkedPairs.has(getUnlinkedPairKey(idA, idB));

  const keyFor = (g: LocalGame) =>
    g.otixMediaId || g.data?.id || (g.otixMediaSlug ? `slug:${g.otixMediaSlug}` : `t:${normalizeTitle(g.title)}`);

  for (const g of games) {
    const key = keyFor(g);
    const existing = groups.get(key);
    if (existing) {
      const hasUnlinked = existing.some((member) => isUnlinked(member.id, g.id));
      if (hasUnlinked) {
        groups.set(`unlinked:${g.id}`, [g]);
      } else {
        existing.push(g);
      }
    } else {
      groups.set(key, [g]);
    }
  }

  const merged: LocalGame[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      const single = group[0];
      if (isIsoGame(single) && (!single.sources || single.sources.length === 0 || typeof single.sources[0] === 'string')) {
        const filePath = single.exePath || single.installDir || '';
        merged.push({
          ...single,
          sources: [
            ...(single.sources || [single.platform]),
            {
              id: single.id,
              title: single.title,
              path: filePath,
              isIso: true,
              format: 'ISO',
              sourceType: 'iso',
            },
          ],
        });
      } else {
        merged.push(single);
      }
      continue;
    }

    const catalogTitle = group[0].otixMediaTitle || group[0].data?.title;

    const best = [...group].sort((a, b) => {
      // 1. Playable installed executable wins over ISO installer/disc
      const aPlayable = isInstalledPlayable(a) ? 1 : 0;
      const bPlayable = isInstalledPlayable(b) ? 1 : 0;
      if (aPlayable !== bPlayable) return bPlayable - aPlayable;

      // 2. Prefer the row whose title matches the catalog title exactly (the parent).
      if (catalogTitle) {
        const aExact = normalizeTitle(a.title) === normalizeTitle(catalogTitle) ? 1 : 0;
        const bExact = normalizeTitle(b.title) === normalizeTitle(catalogTitle) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }
      // 3. Prefer non-DLC / non-beta / non-trial rows.
      const aNoise = SIDELINE_RE.test(a.title) ? 1 : 0;
      const bNoise = SIDELINE_RE.test(b.title) ? 1 : 0;
      if (aNoise !== bNoise) return aNoise - bNoise;
      // 4. Prefer matched data.
      if (a.data?.id && !b.data?.id) return -1;
      if (!a.data?.id && b.data?.id) return 1;
      // 5. Shorter title wins (fewer edition suffixes).
      if (a.title.length !== b.title.length) return a.title.length - b.title.length;
      return 0;
    })[0];

    // Collect unique platform strings for backwards compatibility with badges
    const platformStrings = [...new Set(group.map((g) => g.platform).filter(Boolean))];
    const sources: (string | LocalGameSource)[] = [...platformStrings];

    // Build rich LocalGameSource objects so launcher details sheet can display & mount ISOs
    for (const member of group) {
      const isIso = isIsoGame(member);
      const filePath = member.exePath || member.installDir || '';
      sources.push({
        id: member.id,
        title: member.title,
        path: filePath,
        isIso,
        format: isIso ? 'ISO' : (member.platform?.toUpperCase() || 'PC'),
        sourceType: isIso ? 'iso' : (member.id === best.id ? 'installed' : 'source'),
      });
    }

    // Merge updateFiles
    let combinedUpdates = best.updateFiles ? [...best.updateFiles] : [];
    for (const g of group) {
      if (g.id !== best.id && g.updateFiles) {
        for (const u of g.updateFiles) {
          if (!combinedUpdates.some((existing) => existing.path === u.path)) {
            combinedUpdates.push(u);
          }
        }
      }
    }

    // Determine best executable path (Steam exe if available, otherwise installed PC exe, otherwise best)
    const steamGame = group.find((g) => g.platform === 'steam' && g.exePath);
    const installedGame = group.find((g) => isInstalledPlayable(g));
    const resolvedExePath = steamGame?.exePath ?? installedGame?.exePath ?? best.exePath;

    merged.push({
      ...best,
      sources: sources.length > 0 ? sources : undefined,
      exePath: resolvedExePath,
      installDir: best.installDir || installedGame?.installDir,
      updateFiles: combinedUpdates.length > 0 ? combinedUpdates : undefined,
    });
  }

  return merged;
}

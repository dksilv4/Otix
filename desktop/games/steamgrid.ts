import * as fs from 'fs';
import * as path from 'path';

const SGDB_BASE = 'https://www.steamgriddb.com/api/v2';

interface SGDBGame {
  id: number;
  name: string;
  types: string[];
  verified: boolean;
}

interface SGDBIcon {
  id: number;
  url: string;
  width: number;
  height: number;
  score: number;
  mime: string;
}

let cachedApiKey: string | null = null;

function readApiKey(): string | null {
  if (cachedApiKey !== null) return cachedApiKey;

  // 1. Environment variable
  if (process.env.STEAM_GRID_API_KEY) {
    cachedApiKey = process.env.STEAM_GRID_API_KEY;
    return cachedApiKey;
  }

  // 2. Read from backend .env
  try {
    const projectRoot = path.resolve(__dirname, '..', '..');
    const envPath = path.join(projectRoot, 'backend', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/STEAM_GRID_API_KEY\s*=\s*(.+)/);
      if (match) {
        cachedApiKey = match[1].trim();
        return cachedApiKey;
      }
    }
  } catch {
    // Ignore
  }

  cachedApiKey = '';
  return null;
}

async function sgdbRequest<T>(endpoint: string): Promise<T | null> {
  const apiKey = readApiKey();
  if (!apiKey) {
    console.warn('[SteamGridDB] No API key configured — skipping');
    return null;
  }

  try {
    const res = await fetch(`${SGDB_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.success !== false) return json as T;
    return null;
  } catch (err) {
    console.error('[SteamGridDB] Request failed:', err);
    return null;
  }
}

export async function searchGames(query: string): Promise<SGDBGame[]> {
  const data = await sgdbRequest<{ data: SGDBGame[] }>(
    `/search/autocomplete/${encodeURIComponent(query)}`,
  );
  return data?.data ?? [];
}

export async function getIcons(gameId: number): Promise<SGDBIcon[]> {
  const data = await sgdbRequest<{ data: SGDBIcon[] }>(`/icons/game/${gameId}`);
  return data?.data ?? [];
}

export async function getBestIconUrl(title: string): Promise<string | null> {
  const games = await searchGames(title);
  if (games.length === 0) return null;

  // Try exact title match first, then first result
  let game = games.find(
    (g) => g.name.toLowerCase() === title.toLowerCase(),
  );
  if (!game) game = games[0];

  const icons = await getIcons(game.id);
  if (icons.length === 0) return null;

  // Sort by score descending, pick best
  icons.sort((a, b) => b.score - a.score);

  // Prefer static (png) over animated (gif/webp)
  const staticIcon = icons.find((i) => i.mime === 'image/png');
  return staticIcon?.url ?? icons[0].url;
}

interface SGDBGrid {
  id: number;
  url: string;
  width: number;
  height: number;
  score: number;
  style: string;
  mime: string;
}

async function getGrids(gameId: number): Promise<SGDBGrid[]> {
  const data = await sgdbRequest<{ data: SGDBGrid[] }>(`/grids/game/${gameId}`);
  return data?.data ?? [];
}

export async function getBestGridUrl(title: string): Promise<string | null> {
  const games = await searchGames(title);
  if (games.length === 0) return null;

  let game = games.find(
    (g) => g.name.toLowerCase() === title.toLowerCase(),
  );
  if (!game) game = games[0];

  const grids = await getGrids(game.id);
  if (grids.length === 0) return null;

  // Prefer no_logo and material styles (textless covers), matching backend _pick_grid logic
  const styleRank: Record<string, number> = { no_logo: 0, material: 1 };
  const textless = grids.filter((g) => g.style in styleRank);
  const candidates = textless.length > 0 ? textless : grids;

  // Sort by style rank then score
  candidates.sort((a, b) => {
    const rankA = styleRank[a.style] ?? 2;
    const rankB = styleRank[b.style] ?? 2;
    if (rankA !== rankB) return rankA - rankB;
    return (b.score || 0) - (a.score || 0);
  });

  return candidates[0]?.url ?? null;
}

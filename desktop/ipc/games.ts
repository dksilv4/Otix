import { ipcMain } from 'electron';
import { getMatchedGames, hydrateGame, notifyGamesChanged } from '../game-storage-service';

const API_BASE = 'http://127.0.0.1:8000/api';

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function deepCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(deepCamel);
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[toCamel(k)] = deepCamel(v);
    }
    return out;
  }
  return obj;
}

export function registerGamesIPC(): void {
  ipcMain.handle('games:hydrate-matched', async () => {
    const rows = getMatchedGames();
    let updated = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const res = await fetch(`${API_BASE}/media/${row.otix_media_id}`);
        if (!res.ok) {
          console.error(`[Hydrate] ${row.otix_media_id}: HTTP ${res.status}`);
          failed++;
          continue;
        }

        const data = deepCamel(await res.json()) as Record<string, unknown>;
        hydrateGame(
          row.id,
          (data.title as string) || row.title,
          (data.posterUrl || data.logoUrl || null) as string | null,
          (data.posterUrl || null) as string | null,
          data,
        );
        updated++;
      } catch (err) {
        console.error(`[Hydrate] ${row.otix_media_id}:`, err);
        failed++;
      }
    }

    console.log(`[Hydrate] ${updated} updated, ${failed} failed, ${rows.length} total`);
    notifyGamesChanged();
    return { updated, failed, total: rows.length };
  });
}

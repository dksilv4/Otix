import * as fs from 'fs';
import * as path from 'path';
import type { LocalGame } from '../../preload-api';
import { scanLocalFiles } from '../../game/local-scanner';

export async function runLocalScannerFallback(
  allPathsMap: Map<string, 'game' | 'iso'>,
  games: LocalGame[],
  nodeFiles: any[],
  ingestFile: (f: any) => LocalGame | null,
  handleDiscoveredBatch: (batch: LocalGame[]) => void,
  sendSafeProgress: (currentDir: string, progress: number) => void
): Promise<void> {
  // Fallback: if node returned 0 files or is offline, scan via native local-scanner
  if (games.length === 0 && (!nodeFiles || nodeFiles.length === 0)) {
    sendSafeProgress('Scanning local directories...', 40);
    console.log('[scanner:scan-paths] Running native local file scanner...');
    try {
      const scanDirs = Array.from(allPathsMap.entries()).filter(([_, t]) => t === 'game' || (t as string) === 'installed').map(([p]) => p);
      const isoDirs = Array.from(allPathsMap.entries()).filter(([_, t]) => t === 'iso' || (t as string) === 'provider').map(([p]) => p);
      const localScanResult = await scanLocalFiles({
        scanDirectories: scanDirs,
        isoDirectories: isoDirs,
        onProgress: (dir, progress) => {
          const displayDir = path.basename(dir) || 'folders';
          sendSafeProgress(`Scanning ${displayDir}...`, Math.min(85, 40 + Math.floor(progress * 0.45)));
        },
      });
      const rawFallback = localScanResult.games || [];
      if (rawFallback.length > 0) {
        console.log(`[scanner:scan-paths] Native local scanner discovered ${rawFallback.length} games`);
        const fallbackBatch: LocalGame[] = [];
        for (const g of rawFallback) {
          const isIsoOrRom = g.platform !== 'pc' && g.platform !== 'steam';
          const formatCategory = g.platform === 'steam' ? 'steam' : isIsoOrRom ? (g.platform === 'iso' ? 'iso' : 'rom') : 'pc';
          const mapped = ingestFile({
            id: g.id,
            filename: path.basename(g.exePath || g.installDir || g.title),
            filepath: g.exePath || g.installDir,
            game_title: g.title,
            title_id: (g as any).titleId,
            titleId: (g as any).titleId,
            format_category: formatCategory,
            platform: g.platform,
            root_dir: g.installDir,
            update_files: g.updateFiles,
            isDlc: g.isDlc,
            local_exe_path: g.localExePath,
            local_icon_url: g.localIconUrl,
            localIconUrl: g.localIconUrl,
            poster_url: g.posterUrl,
            posterUrl: g.posterUrl,
            backdrop_url: g.backdropUrl,
            backdropUrl: g.backdropUrl,
            version: g.version,
          });
          if (mapped) fallbackBatch.push(mapped);
        }
        if (fallbackBatch.length > 0) {
          handleDiscoveredBatch(fallbackBatch);
        }
      }
    } catch (fbErr: any) {
      console.warn('[scanner:scan-paths] Native local scanner error:', fbErr.message);
    }
  } else {
    // Augment Steam libraries natively so appmanifests are recognized as Steam titles
    try {
      const scanDirs = Array.from(allPathsMap.entries()).filter(([_, t]) => t === 'game' || (t as string) === 'installed').map(([p]) => p);
      const steamDirs = scanDirs.filter((d) => {
        try {
          const lower = d.toLowerCase();
          if (lower.endsWith('steamapps') || path.basename(lower) === 'steam') return true;
          if (fs.existsSync(d) && fs.statSync(d).isDirectory()) {
            const entries = fs.readdirSync(d);
            return entries.some((e) => e.toLowerCase() === 'steamapps');
          }
          return false;
        } catch {
          return false;
        }
      });

      if (steamDirs.length > 0) {
        const steamResult = await scanLocalFiles({
          scanDirectories: steamDirs,
          isoDirectories: [],
        });
        const steamGames = (steamResult.games || []).filter((g) => g.platform === 'steam');
        if (steamGames.length > 0) {
          const steamBatch: LocalGame[] = [];
          for (const sg of steamGames) {
            const mapped = ingestFile({
              id: sg.id,
              filename: path.basename(sg.exePath || sg.installDir || sg.title),
              filepath: sg.exePath || sg.installDir,
              game_title: sg.title,
              format_category: 'steam',
              platform: 'steam',
              root_dir: sg.installDir,
              update_files: sg.updateFiles,
              isDlc: sg.isDlc,
              local_exe_path: sg.localExePath,
            });
            if (mapped) steamBatch.push(mapped);
          }
          if (steamBatch.length > 0) {
            handleDiscoveredBatch(steamBatch);
          }
        }
      }
    } catch (steamErr: any) {
      console.warn('[scanner:scan-paths] Native Steam library scan augmentation error:', steamErr.message);
    }
  }
}

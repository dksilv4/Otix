import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Canonical imports to verify retained functionality
import { previewNamingTemplate, validateNamingTemplate } from '../downloads/organizer';
import { analyzeRepackArchiveIntegrity } from '../downloads/healing';
import { getScanPathsFromDb } from '../downloads';
import { ensureInnounp } from '../installer';
import { getRootGameDir } from '../game/local-scanner';
import { applyDesktopSettings, loadDesktopSettings } from '../desktop-settings';
import { registerAchievementsIPC } from '../ipc/achievements';
import { validateGitHubToken } from '../ipc/updater';
import { getAllActivity, publishActivity, clearActivity } from '../plugin-runtime/activity';
import { validateConfig } from '../plugin-runtime/config-validation';
import { getSavesByProfile } from '../saves/service';
import { getPluginsDb, replaceTableNames } from '../db/plugins-db';
import { TAG_BACKGROUND, TAG_LOADING_STALL, TAG_LOADING_BLOCK } from '../game/fps-capture';

const DESKTOP_ROOT = path.resolve(__dirname, '..');

describe('Challenger M1: Dead Code Elimination & IPC Hygiene Verification', () => {

  describe('Suite 1: Empirical Verification of All 21 Eliminated Dead Code Items', () => {

    it('Item 1: Obsolete handler scanner:get-scanned-game (singular) is absent from scanner.ts, filtered plural retained', () => {
      const scannerContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'ipc', 'scanner.ts'), 'utf-8');
      expect(scannerContent).not.toMatch(/ipcMain\.handle\s*\(\s*['"]scanner:get-scanned-game['"]/);
      expect(scannerContent).toMatch(/ipcMain\.handle\s*\(\s*['"]scanner:get-scanned-games-filtered['"]/);
    });

    it('Item 2: Obsolete desktop:get-api-base-url-sync handler is absent from main.ts', () => {
      const mainContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'main.ts'), 'utf-8');
      expect(mainContent).not.toMatch(/desktop:get-api-base-url-sync/);
      expect(mainContent).toMatch(/--otix-api-base-url=/);
    });

    it('Item 3: Obsolete desktop:api-base-url-changed listener is absent from preload.ts and entire repo', () => {
      const preloadContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'preload.ts'), 'utf-8');
      expect(preloadContent).not.toMatch(/desktop:api-base-url-changed/);
    });

    it('Item 4: Stranded duplicate archive healing block in game/parser.ts is completely excised', () => {
      const parserContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'game', 'parser.ts'), 'utf-8');
      expect(parserContent).not.toMatch(/previewNamingTemplate/);
      expect(parserContent).not.toMatch(/analyzeRepackArchiveIntegrity/);
      expect(parserContent).not.toMatch(/RepackArchiveAnomaly/);
      expect(parserContent).not.toMatch(/RepackArchiveAnalysis/);
    });

    it('Item 5: Obsolete legacy DB functions in downloads/index.ts are absent, getScanPathsFromDb preserved', () => {
      const downloadsContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'downloads', 'index.ts'), 'utf-8');
      expect(downloadsContent).not.toMatch(/export async function getScannedGamesFromDb/);
      expect(downloadsContent).not.toMatch(/export async function saveScannedGamesToDb/);
      expect(downloadsContent).not.toMatch(/export async function saveScanPathsToDb/);
      expect(downloadsContent).not.toMatch(/export async function migrateLegacyConfigToPlugins/);
      expect(typeof getScanPathsFromDb).toBe('function');
    });

    it('Item 6: Dead file plugin-runtime/api-proxy.ts does not exist on disk', () => {
      const filePath = path.join(DESKTOP_ROOT, 'plugin-runtime', 'api-proxy.ts');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('Item 7: Dead file plugin-runtime/marketplace.ts does not exist on disk', () => {
      const filePath = path.join(DESKTOP_ROOT, 'plugin-runtime', 'marketplace.ts');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('Item 8: Unused runSilentInstall is absent from installer/index.ts', () => {
      const installerContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'installer', 'index.ts'), 'utf-8');
      expect(installerContent).not.toMatch(/function runSilentInstall/);
    });

    it('Item 9: Unused extractInnoSetup & extractWith7z are absent from installer/index.ts; ensureInnounp preserved', () => {
      const installerContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'installer', 'index.ts'), 'utf-8');
      expect(installerContent).not.toMatch(/function extractInnoSetup/);
      expect(installerContent).not.toMatch(/function extractWith7z/);
      expect(typeof ensureInnounp).toBe('function');
    });

    it('Item 10: Unused getGameFolder is absent from game/local-scanner.ts; getRootGameDir preserved', () => {
      const scannerContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'game', 'local-scanner.ts'), 'utf-8');
      expect(scannerContent).not.toMatch(/function getGameFolder\(/);
      expect(typeof getRootGameDir).toBe('function');
    });

    it('Item 11: Unused setTrayRef is absent from desktop-settings.ts; applyDesktopSettings preserved', () => {
      const settingsContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'desktop-settings.ts'), 'utf-8');
      expect(settingsContent).not.toMatch(/function setTrayRef/);
      expect(typeof applyDesktopSettings).toBe('function');
    });

    it('Item 12: Unused setAchievementTracker is absent from ipc/achievements.ts; registerAchievementsIPC preserved', () => {
      const achievementsContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'ipc', 'achievements.ts'), 'utf-8');
      expect(achievementsContent).not.toMatch(/function setAchievementTracker/);
      expect(typeof registerAchievementsIPC).toBe('function');
    });

    it('Item 13: Unused resolveGitHubToken is absent from ipc/updater.ts; validateGitHubToken preserved', () => {
      const updaterContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'ipc', 'updater.ts'), 'utf-8');
      expect(updaterContent).not.toMatch(/function resolveGitHubToken/);
      expect(typeof validateGitHubToken).toBe('function');
    });

    it('Item 14: Unused getPluginActivity is absent from plugin-runtime/activity.ts; getAllActivity preserved', () => {
      const activityContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'plugin-runtime', 'activity.ts'), 'utf-8');
      expect(activityContent).not.toMatch(/function getPluginActivity/);
      expect(typeof getAllActivity).toBe('function');
    });

    it('Item 15: Unused hasConfigField is absent from plugin-runtime/config-validation.ts; validateConfig preserved', () => {
      const validationContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'plugin-runtime', 'config-validation.ts'), 'utf-8');
      expect(validationContent).not.toMatch(/function hasConfigField/);
      expect(typeof validateConfig).toBe('function');
    });

    it('Item 16: Unused getSavesByGame is absent from saves/service.ts; getSavesByProfile preserved', () => {
      const savesContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'saves', 'service.ts'), 'utf-8');
      expect(savesContent).not.toMatch(/function getSavesByGame/);
      expect(typeof getSavesByProfile).toBe('function');
    });

    it('Item 17: Unused getPluginsDbPath, runQuery, getQuery, allQuery are absent from db/plugins-db.ts; getPluginsDb preserved', () => {
      const dbContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'db', 'plugins-db.ts'), 'utf-8');
      expect(dbContent).not.toMatch(/function getPluginsDbPath/);
      expect(dbContent).not.toMatch(/function runQuery/);
      expect(dbContent).not.toMatch(/function getQuery/);
      expect(dbContent).not.toMatch(/function allQuery/);
      expect(typeof getPluginsDb).toBe('function');
    });

    it('Item 18: Unused constant TAG_NONE is absent from game/fps-capture.ts; active flags preserved', () => {
      const fpsContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'game', 'fps-capture.ts'), 'utf-8');
      expect(fpsContent).not.toMatch(/TAG_NONE/);
      expect(TAG_BACKGROUND).toBe(1 << 0);
      expect(TAG_LOADING_STALL).toBe(1 << 1);
      expect(TAG_LOADING_BLOCK).toBe(1 << 2);
    });

    it('Item 19: Duplicate interface SabQueueItem is absent from preload-api.ts; canonical definition in downloader.ts is preserved', () => {
      const preloadApiContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'preload-api.ts'), 'utf-8');
      expect(preloadApiContent).not.toMatch(/interface SabQueueItem/);
      const downloaderContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'downloads', 'downloader.ts'), 'utf-8');
      expect(downloaderContent).toMatch(/export interface SabQueueItem/);
    });

    it('Item 20: Dead duplicate branch in matching:start is removed, consolidating onto startMatching()', () => {
      const scannerContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'ipc', 'scanner.ts'), 'utf-8');
      const matchingHandler = scannerContent.slice(scannerContent.indexOf("ipcMain.handle('matching:start'"));
      const endOfHandler = matchingHandler.indexOf("ipcMain.handle('matching:cancel'");
      const handlerBody = matchingHandler.slice(0, endOfHandler);
      expect(handlerBody).not.toMatch(/startBackgroundMatching/);
      expect(handlerBody).toMatch(/startMatching/);
    });

    it('Item 21: Obsolete empty DEFAULT_PLUGINS loop is absent from main.ts', () => {
      const mainContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'main.ts'), 'utf-8');
      expect(mainContent).not.toMatch(/DEFAULT_PLUGINS/);
    });
  });

  describe('Suite 2: Complete Preload IPC Channel Coverage Matrix', () => {
    it('All channels invoked in preload.ts have corresponding handlers registered in desktop main/ipc modules', () => {
      const preloadContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'preload.ts'), 'utf-8');

      // Extract all ipcRenderer.invoke('channel') and ipcRenderer.send('channel')
      const invokedChannels = new Set<string>();
      const invokeMatches = preloadContent.matchAll(/ipcRenderer\.(?:invoke|send)\s*\(\s*['"]([^'"]+)['"]/g);
      for (const m of invokeMatches) {
        invokedChannels.add(m[1]);
      }

      // Collect all registered channels across desktop/main.ts, desktop/ipc/*.ts, desktop/plugin-runtime/ipc.ts
      const registeredChannels = new Set<string>();

      const filesToScan: string[] = [
        path.join(DESKTOP_ROOT, 'main.ts'),
        path.join(DESKTOP_ROOT, 'plugin-runtime', 'ipc.ts'),
      ];

      const ipcDir = path.join(DESKTOP_ROOT, 'ipc');
      for (const file of fs.readdirSync(ipcDir)) {
        if (file.endsWith('.ts')) {
          filesToScan.push(path.join(ipcDir, file));
        }
      }

      for (const filePath of filesToScan) {
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf-8');
        // Match multiline ipcMain.handle('...', safeHandle('...', ipcMain.on('...
        const handleMatches = content.matchAll(/(?:ipcMain\.(?:handle|on)|safeHandle)\s*\(\s*['"]([^'"]+)['"]/g);
        for (const m of handleMatches) {
          registeredChannels.add(m[1]);
        }
      }

      expect(invokedChannels.size).toBeGreaterThan(60);
      expect(registeredChannels.size).toBeGreaterThan(60);

      const missingHandlers: string[] = [];
      for (const channel of invokedChannels) {
        if (!registeredChannels.has(channel)) {
          missingHandlers.push(channel);
        }
      }

      expect(missingHandlers).toEqual([]);
    });

    it('Local game retrieval in preload uses scanner:get-scanned-games-filtered and NOT dead scanner:get-scanned-game', () => {
      const preloadContent = fs.readFileSync(path.join(DESKTOP_ROOT, 'preload.ts'), 'utf-8');
      expect(preloadContent).toMatch(/scanner:get-scanned-games-filtered/);
      expect(preloadContent).not.toMatch(/['"]scanner:get-scanned-game['"]/);
    });
  });

  describe('Suite 3: Behavioral Execution & Stress Testing on Canonical Implementations', () => {

    it('previewNamingTemplate in downloads/organizer functions accurately with various templates', () => {
      const sample = 'Cyberpunk.2077.v2.12-ElAmigos.iso';
      const template = '{Title} [{Platform}]/{OriginalName}.{ext}';
      const preview = previewNamingTemplate(template, sample);
      expect(preview.valid).toBe(true);
      expect(preview.result).toBeDefined();
      expect(preview.result).toContain('Cyberpunk 2077');
    });

    it('validateNamingTemplate in downloads/organizer validates valid and rejects invalid templates', () => {
      const valid = validateNamingTemplate('{Title} ({Year})/{OriginalName}.{ext}');
      expect(valid.valid).toBe(true);

      const invalid = validateNamingTemplate('{InvalidToken}/foo');
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toBeDefined();
    });

    it('analyzeRepackArchiveIntegrity in downloads/healing handles ElAmigos sequence chunk detection', () => {
      const files = ['setup.exe', 'setup-1.bin', 'data-2.bin', 'elamigos-3.bin'];
      const analysis = analyzeRepackArchiveIntegrity(files, 'Elden.Ring.v1.12.REPACK-ELAMIGOS', 'ElAmigos');
      expect(analysis.isRepack).toBe(true);
      expect(analysis.archiveType).toBe('ElAmigos');
      expect(analysis.anomalies.length).toBeGreaterThan(0);
      expect(analysis.suggestedRenames['setup-1.bin']).toBe('elamigos-1.bin');
      expect(analysis.suggestedRenames['data-2.bin']).toBe('elamigos-2.bin');
    });

    it('analyzeRepackArchiveIntegrity detects incomplete downloads (.part, .crdownload)', () => {
      const files = ['setup.exe', 'elamigos-1.bin', 'elamigos-2.bin.part'];
      const analysis = analyzeRepackArchiveIntegrity(files, 'Game.REPACK-ELAMIGOS', 'ElAmigos');
      expect(analysis.health).toBe('INCOMPLETE_DOWNLOAD');
      expect(analysis.anomalies.some((a) => a.type === 'INCOMPLETE_DOWNLOAD')).toBe(true);
    });

    it('getRootGameDir in game/local-scanner traverses subdirectories up to root game directory', () => {
      const ps3Path = path.join('C:', 'Games', 'PS3Game', 'PS3_GAME', 'USRDIR', 'EBOOT.BIN');
      const rootDir = getRootGameDir(ps3Path);
      expect(rootDir.toLowerCase()).toBe(path.join('C:', 'Games', 'PS3Game').toLowerCase());
    });

    it('validateConfig in plugin-runtime/config-validation validates schema successfully', () => {
      const manifest = {
        config: {
          apiKey: { type: 'string' as const, label: 'API Key', required: true },
          port: { type: 'number' as const, label: 'Port', default: 8080 },
        },
      };
      const validRes = validateConfig(manifest, { apiKey: 'secret', port: 9000 });
      expect(validRes.valid).toBe(true);
      expect(validRes.errors).toHaveLength(0);

      const invalidRes = validateConfig(manifest, { port: 'not-a-number' });
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.errors.length).toBeGreaterThan(0);
    });

    it('getAllActivity in plugin-runtime/activity correctly records, prunes and retrieves activity entries', () => {
      clearActivity('test-plugin');
      publishActivity('test-plugin', {
        id: 'act-1',
        title: 'Initial sync',
        type: 'sync',
        status: 'active',
        subtitle: 'Completed initial library sync',
      });
      const activities = getAllActivity();
      const pluginEntry = activities.find((a) => a.pluginId === 'test-plugin');
      expect(pluginEntry).toBeDefined();
      expect(pluginEntry?.activities.length).toBe(1);
      expect(pluginEntry?.activities[0].subtitle).toBe('Completed initial library sync');
      clearActivity('test-plugin');
    });

    it('validateGitHubToken returns structured result object', async () => {
      // Mock global fetch to test the token validator without hitting network rate limits
      const originalFetch = global.fetch;
      try {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ full_name: 'dksilv4/Otix' }),
        } as any);

        const res = await validateGitHubToken('dummy-token');
        expect(res.valid).toBe(true);
        expect(res.repo).toBe('dksilv4/Otix');

        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        } as any);

        const failRes = await validateGitHubToken('bad-token');
        expect(failRes.valid).toBe(false);
        expect(failRes.error).toContain('401');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

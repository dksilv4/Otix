import { EventEmitter } from 'events';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import psList from 'ps-list';
import type { LocalGame, FpsStats, SessionNodeInfo, SessionHardwareInfo } from '../preload-api';
import { isRomGame } from './emulators';
import { updateLastPlayedAt } from './storage';
import {
  getHostNodeAndHardware,
  getCachedHostNodeAndHardware,
} from './node-hardware';
import { getSettings } from '../desktop-settings';

export interface RunningGame {
  game: LocalGame;
  startTime: number;
  launchedByOtix: boolean;
  pid?: number;
  node?: SessionNodeInfo | null;
  hardware?: SessionHardwareInfo | null;
  shareEligible?: boolean;
  fpsAvailable?: boolean;
  fpsSnapshot?: any | null;
}

export interface PlaySession {
  id?: string;
  gameId: string;
  gameTitle: string;
  startTime: number;
  endTime: number;
  launchedByOtix: boolean;
  fpsStats?: FpsStats | null;
  node?: SessionNodeInfo | null;
  hardware?: SessionHardwareInfo | null;
  shareEligible?: boolean;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  bannerUrl?: string | null;
  slug?: string | null;
  otixMediaId?: string | number | null;
  processName?: string | null;
}

export interface DetectedProcess {
  name: string;
  pid: number;
  windowTitle: string | null;
}

interface ProcessMapping {
  processName: string;
  gameId: string;
  gameTitle: string;
}

const MAX_SESSIONS = 100;
const SCAN_INTERVAL_MS = 10000;

/** Core system utilities and Windows shell processes that should never be tracked or shown in process list */
export const NON_GAME_PROCESSES = new Set([
  // Windows Shell & System
  'wallpaper64.exe', 'wallpaper32.exe', 'wallpaper.exe',
  'explorer.exe', 'svchost.exe', 'runtimebroker.exe',
  'taskmgr.exe', 'searchhost.exe', 'shellexperiencehost.exe',
  'startmenuexperiencehost.exe', 'applicationframehost.exe',
  'systemsettings.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe',
  'conhost.exe', 'windowsterminal.exe', 'openconsole.exe', 'wt.exe',
  'dwm.exe', 'csrss.exe', 'services.exe', 'lsass.exe', 'fontdrvhost.exe',
  'sihost.exe', 'ctfmon.exe', 'audiodg.exe',
  // Otix itself
  'otix.exe', 'electron.exe',
  // Overlays, Background Services & Crash Helpers
  'eosoverlayrenderer-win64-shipping.exe', 'eosoverlayrenderer.exe',
  'epiconlineservices.exe', 'epiconlineservicesuserhelper.exe',
  'gameoverlayui.exe', 'discordoverlay.exe',
  'originoverlay.exe', 'crashreportclient.exe', 'crashreportclient-win64-shipping.exe',
  'unitycrashhandler64.exe', 'unitycrashhandler32.exe',
  'nvidia overlay.exe', 'nvdisplay.container.exe', 'geforcenow.exe',
  'presentmon.exe', 'rtss.exe', 'msiafterburner.exe',
  'gameinputsvc.exe', 'gameinputredistservice.exe', 'edgegameassist.exe',
  'tailscale.exe', 'tailscale-ipn.exe', 'logioptionsplus.exe', 'l-connect-service.exe',
  'curseforge.exe', 'curse.agent.host.exe', 'bambu-studio.exe',
  'docker desktop.exe', 'docker.exe', 'com.docker.backend.exe',
  'powertoys.exe', 'powertoys.quickaccess.exe', 'powertoys.alwaysontop.exe',
  'powertoys.colorpickerui.exe', 'powertoys.fancyzones.exe', 'powertoys.peek.ui.exe',
  'powertoys.shortcutguide.exe',
]);

/** Processes excluded from automated heuristic and window title detection (browsers, launchers, chat, IDEs) */
export const HEURISTIC_EXCLUDED_PROCESSES = new Set([
  ...NON_GAME_PROCESSES,
  // Browsers
  'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
  'opera.exe', 'opera_gx.exe', 'vivaldi.exe', 'arc.exe',
  // Launchers & Stores (background)
  'steam.exe', 'steamwebhelper.exe', 'epicgameslauncher.exe',
  'epicwebhelper.exe', 'galaxyclient.exe', 'galaxycommunication.exe',
  'ea.exe', 'eadesktop.exe', 'eabackgroundservice.exe',
  'battle.net.exe', 'riotclientservices.exe', 'ubisoftconnect.exe',
  'upc.exe', 'gog galaxy.exe',
  // Communication & Media
  'discord.exe', 'spotify.exe', 'slack.exe', 'teams.exe',
  'obs64.exe', 'obs32.exe', 'vlc.exe', 'devenv.exe', 'code.exe',
  // Developer IDEs & Editors
  'antigravity.exe', 'cursor.exe', 'windsurf.exe', 'zed.exe',
  'idea64.exe', 'pycharm64.exe', 'webstorm64.exe', 'clion64.exe',
  'rider64.exe', 'datagrip64.exe', 'goland64.exe', 'phpstorm64.exe', 'rubymine64.exe',
  'sublime_text.exe', 'notepad++.exe', 'notepad.exe', 'wordpad.exe',
  'winword.exe', 'excel.exe', 'powerpnt.exe',
  // Generic Setup & Installer binaries (heuristic detection must not match random installers)
  'setup.exe', 'install.exe', 'installer.exe', 'unins000.exe', 'uninstall.exe', 'update.exe', 'updater.exe',
]);

/** Generic words commonly found in directory names, installers, or utility tools that must not trigger standalone heuristic matches */
export const GENERIC_TITLE_WORDS = new Set([
  'app', 'apps', 'game', 'games', 'play', 'player', 'setup', 'install',
  'installer', 'update', 'updater', 'patch', 'launcher', 'client', 'demo',
  'trial', 'test', 'beta', 'alpha', 'edition', 'version', 'tool', 'tools',
  'server', 'service', 'screen', 'video', 'music', 'audio', 'icon', 'icons',
  'blueprint', 'blueprints', 'simulation', 'simulations', 'data', 'file',
  'files', 'release', 'repack', 'download', 'helper', 'engine',
]);

const KNOWN_GAME_SIGNATURES: Record<string, string> = {
  'brawlhalla.exe': 'Brawlhalla',
  'valheim.exe': 'Valheim',
  'cyberpunk2077.exe': 'Cyberpunk 2077',
  'witcher3.exe': 'The Witcher 3: Wild Hunt',
  'gta5.exe': 'Grand Theft Auto V',
  'gtav.exe': 'Grand Theft Auto V',
  'rdr2.exe': 'Red Dead Redemption 2',
  'eldenring.exe': 'Elden Ring',
  'starfield.exe': 'Starfield',
  'bg3.exe': "Baldur's Gate 3",
  'bg3_dx11.exe': "Baldur's Gate 3",
  'baldursgate3.exe': "Baldur's Gate 3",
  'hogwartslegacy.exe': 'Hogwarts Legacy',
  'forzahorizon5.exe': 'Forza Horizon 5',
  'monsterhunterworld.exe': 'Monster Hunter: World',
  'monsterhunterrise.exe': 'Monster Hunter Rise',
  'cs2.exe': 'Counter-Strike 2',
  'csgo.exe': 'Counter-Strike: Global Offensive',
  'dota2.exe': 'Dota 2',
  'valorant.exe': 'Valorant',
  'valorant-win64-shipping.exe': 'Valorant',
  'leagueclient.exe': 'League of Legends',
  'league of legends.exe': 'League of Legends',
  'destiny2.exe': 'Destiny 2',
  'overwatch.exe': 'Overwatch 2',
  'r5apex.exe': 'Apex Legends',
  'fortniteclient-win64-shipping.exe': 'Fortnite',
  'rocketleague.exe': 'Rocket League',
  'deadbydaylight.exe': 'Dead by Daylight',
  'deadbydaylight-win64-shipping.exe': 'Dead by Daylight',
  'helldivers2.exe': 'Helldivers 2',
  'palworld-win64-shipping.exe': 'Palworld',
  'blackmythwukong.exe': 'Black Myth: Wukong',
  'b1-win64-shipping.exe': 'Black Myth: Wukong',
  'spacemarine2.exe': 'Warhammer 40k: Space Marine 2',
  'warhammer2.exe': 'Total War: Warhammer II',
  'warhammer3.exe': 'Total War: Warhammer III',
  'civ6.exe': "Sid Meier's Civilization VI",
  'civ6_dx12.exe': "Sid Meier's Civilization VI",
  'sekiro.exe': 'Sekiro: Shadows Die Twice',
  'darksoulsiii.exe': 'Dark Souls III',
  'armoredcore6.exe': 'Armored Core VI',
  'godofwar.exe': 'God of War',
  'gow_ragnarok.exe': 'God of War Ragnarok',
  'spiderman.exe': "Marvel's Spider-Man Remastered",
  'milesmorales.exe': "Marvel's Spider-Man: Miles Morales",
  'tlou-i.exe': 'The Last of Us Part I',
  'ghostooftsushima.exe': 'Ghost of Tsushima',
  'horizonzerodawn.exe': 'Horizon Zero Dawn',
  'horizonforbiddenwest.exe': 'Horizon Forbidden West',
  'residentevil4.exe': 'Resident Evil 4',
  're4.exe': 'Resident Evil 4',
  're8.exe': 'Resident Evil Village',
  're2.exe': 'Resident Evil 2',
  're3.exe': 'Resident Evil 3',
  'fallout4.exe': 'Fallout 4',
  'skyrimse.exe': 'The Elder Scrolls V: Skyrim',
  'tesv.exe': 'The Elder Scrolls V: Skyrim',
  'hades.exe': 'Hades',
  'hades2.exe': 'Hades II',
  'hollow_knight.exe': 'Hollow Knight',
  'silksong.exe': 'Hollow Knight: Silksong',
  'subnautica.exe': 'Subnautica',
  'factorio.exe': 'Factorio',
  'terraria.exe': 'Terraria',
  'stardew valley.exe': 'Stardew Valley',
  'stardewvalley.exe': 'Stardew Valley',
  'deadcells.exe': 'Dead Cells',
  'slaythespire.exe': 'Slay the Spire',
  'balatro.exe': 'Balatro',
  'bloonstd6.exe': 'Bloons TD 6',
  'btd6.exe': 'Bloons TD 6',
  'cleaner-btd6.exe': 'Bloons TD 6',
  'factorygamesteam.exe': 'Satisfactory',
  'satisfactory.exe': 'Satisfactory',
  'modernwarfare.exe': 'Call of Duty: Modern Warfare',
  'supermarket together.exe': 'Supermarket Together',
  'supermarkettogether.exe': 'Supermarket Together',
  'rs2client.exe': 'RuneScape',
  'runescape.exe': 'RuneScape',
  'rsdragonwilds.exe': 'RuneScape Dragonwilds',
  'rsdragonwilds-win64-shipping.exe': 'RuneScape Dragonwilds',
  'oriwotw.exe': 'Ori and the Will of the Wisps',
  'oride.exe': 'Ori and the Blind Forest',
  'timberborn.exe': 'Timberborn',
  'pragmata.exe': 'Pragmata',
  'pathofexile.exe': 'Path of Exile',
  'pathofexile_x64.exe': 'Path of Exile',
  'pathofexilesteam.exe': 'Path of Exile 2',
  'pathofexile2.exe': 'Path of Exile 2',
  'losslessscaling.exe': 'Lossless Scaling',
  'transportfever3.exe': 'Transport Fever 3',
  'transportfever2.exe': 'Transport Fever 2',
  'whiskerwood.exe': 'Whiskerwood',
  'whiskerwood-win64-shipping.exe': 'Whiskerwood',
  'ultimatechickenhorse.exe': 'Ultimate Chicken Horse',
  'tekken 8.exe': 'Tekken 8',
  'tekken8.exe': 'Tekken 8',
  'risk of rain 2.exe': 'Risk of Rain 2',
  'riskofrain2.exe': 'Risk of Rain 2',
  'wardogs.exe': 'Wardogs',
  'wardogsclient.exe': 'Wardogs',
  'wardogsclient-win64-shipping.exe': 'Wardogs',
  'wardogslauncher-shipping.exe': 'Wardogs',
  'wardogs-win64-shipping.exe': 'Wardogs',
};

const normTitleCache = new Map<string, string>();

function normalizeTitle(title: string): string {
  const cached = normTitleCache.get(title);
  if (cached !== undefined) return cached;

  const normalized = title
    .replace(/\s*[-–—:]\s*(Definitive|GOTY|Game of the Year|Remastered|Enhanced|Ultimate|Complete|Anniversary|Collectors|Digital Deluxe|Special|Legendary)\s*(Edition)?\s*$/i, '')
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (normTitleCache.size < 10000) {
    normTitleCache.set(title, normalized);
  }
  return normalized;
}

const TITLE_TO_KNOWN_EXES = new Map<string, string[]>();
for (const [exe, title] of Object.entries(KNOWN_GAME_SIGNATURES)) {
  const norm = normalizeTitle(title);
  const list = TITLE_TO_KNOWN_EXES.get(norm) || [];
  list.push(exe);
  TITLE_TO_KNOWN_EXES.set(norm, list);
}

const exeCandidatesCache = new Map<string, string[]>();

function titleToExeCandidates(title: string): string[] {
  const cached = exeCandidatesCache.get(title);
  if (cached) return cached;

  const normalized = normalizeTitle(title);
  const allTokens = normalized.split(/\s+/).filter(Boolean);
  const words = allTokens.filter((w) => w.length > 2 || /^\d+$/.test(w));
  const distinctiveWords = words.filter((w) => !GENERIC_TITLE_WORDS.has(w));
  const candidates: string[] = [];

  // Known executable signatures for this title (e.g. Counter-Strike 2 -> cs2.exe)
  const knownExes = TITLE_TO_KNOWN_EXES.get(normalized);
  if (knownExes) {
    candidates.push(...knownExes);
  }

  // If no distinctive non-generic words exist (e.g. "App 0", "Launcher", "Setup"), do not generate candidate binaries
  if (distinctiveWords.length === 0) {
    if (exeCandidatesCache.size < 10000) exeCandidatesCache.set(title, candidates);
    return candidates;
  }

  candidates.push(words.join('') + '.exe');
  candidates.push(words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') + '.exe');

  if (words.length >= 2) {
    candidates.push(words.map((w) => w[0]).join('') + '.exe');
  }

  // Handle titles ending in numbers (e.g. "Counter-Strike 2" -> "cs2.exe", "Portal 2" -> "portal2.exe")
  if (words.length >= 2 && /^\d+$/.test(words[words.length - 1])) {
    const num = words[words.length - 1];
    const prefixWords = words.slice(0, -1);
    candidates.push(prefixWords.map((w) => w[0]).join('') + num + '.exe');
    candidates.push(prefixWords.join('') + num + '.exe');
    if (prefixWords.length >= 1) {
      candidates.push(prefixWords[0] + num + '.exe');
    }
  }

  const mainWord = words[words.length - 1] || words[0];
  if (mainWord.length > 4 && !GENERIC_TITLE_WORDS.has(mainWord)) {
    candidates.push(mainWord + '.exe');
  }

  // Unreal Engine & Client/Launcher candidate patterns
  const joined = words.join('');
  candidates.push(joined + '-win64-shipping.exe');
  candidates.push(joined + 'client-win64-shipping.exe');
  candidates.push(joined + 'client.exe');
  candidates.push(joined + 'launcher.exe');
  candidates.push(joined + 'launcher-shipping.exe');

  if (exeCandidatesCache.size < 10000) {
    exeCandidatesCache.set(title, candidates);
  }
  return candidates;
}

const wordRegexCache = new Map<string, RegExp>();

function getWordRegex(w: string): RegExp {
  let re = wordRegexCache.get(w);
  if (!re) {
    re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (wordRegexCache.size < 2000) {
      wordRegexCache.set(w, re);
    }
  }
  return re;
}

interface CandidateProc {
  pid: number;
  nameLower: string;
  baseLower: string;
  hasUnderscore: boolean;
  wordsSet: Set<string>;
}

interface RendererProc {
  pid: number;
  pn: string;
  pnNoSuffix: string;
}

interface WindowEntry {
  winTitle: string;
  winLower: string;
  pid: number;
  hasUnderscore: boolean;
  wordsSet: Set<string>;
}

interface ProcessSnapshot {
  processes: { name: string; pid: number }[];
  procByName: Map<string, { name: string; pid: number }>;
  procByPid: Map<number, { name: string; pid: number }>;
  procNamesList: string[];
  candidateProcs: CandidateProc[];
  rendererProcs: RendererProc[];
  windowEntries: WindowEntry[];
}

// Get processes with open windows via PowerShell
function getWindowTitles(): Promise<Map<string, string>> {
  if (process.platform !== 'win32') {
    return Promise.resolve(new Map());
  }

  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object ProcessName, Id, MainWindowTitle | ConvertTo-Json -Compress"',
      { timeout: 4000 },
      (error, stdout) => {
        if (error || !stdout) {
          resolve(new Map());
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const map = new Map<string, string>();
          const items = Array.isArray(data) ? data : data ? [data] : [];
          for (const item of items) {
            if (item && item.ProcessName && item.MainWindowTitle) {
              const key = `${item.ProcessName.toLowerCase()}|${item.Id}`;
              map.set(key, item.MainWindowTitle);
            }
          }
          resolve(map);
        } catch {
          resolve(new Map());
        }
      },
    );
  });
}

let cachedWindowTitles: { titles: Map<string, string>; timestamp: number } | null = null;
let activeWindowTitlesPromise: Promise<Map<string, string>> | null = null;
const WINDOW_TITLES_TTL_MS = 30000;

export function clearWindowTitlesCache(): void {
  cachedWindowTitles = null;
  activeWindowTitlesPromise = null;
}

function getCachedWindowTitles(force = false): Promise<Map<string, string>> {
  if (process.platform !== 'win32') {
    return Promise.resolve(new Map());
  }

  const now = Date.now();
  if (!force && cachedWindowTitles && (now - cachedWindowTitles.timestamp < WINDOW_TITLES_TTL_MS)) {
    return Promise.resolve(cachedWindowTitles.titles);
  }

  if (activeWindowTitlesPromise) {
    return activeWindowTitlesPromise;
  }

  activeWindowTitlesPromise = getWindowTitles()
    .then((titles) => {
      cachedWindowTitles = { titles, timestamp: Date.now() };
      return titles;
    })
    .finally(() => {
      activeWindowTitlesPromise = null;
    });

  return activeWindowTitlesPromise;
}

export class GameDetector extends EventEmitter {
  private runningGames: Map<string, RunningGame> = new Map();
  private library: LocalGame[] = [];
  private libraryById = new Map<string, LocalGame>();
  private libraryIds = new Set<string>();
  private libraryNormalizedTitles = new Set<string>();
  private exeNamesCache = new WeakMap<LocalGame, string[]>();
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private sessionsPath: string;
  private mappingsPath: string;
  private mappings: ProcessMapping[] = [];
  private trackedPids = new Set<number>();
  private processCheckTimer: ReturnType<typeof setInterval> | null = null;
  private discoveryTimers: ReturnType<typeof setTimeout>[] = [];
  private isScanning = false;
  private launchGracePeriodUntil = new Map<string, number>();
  private readonly GRACE_PERIOD_MS = 20000;

  constructor(sessionsDir: string) {
    super();
    this.sessionsPath = path.join(sessionsDir, 'play-sessions.json');
    this.mappingsPath = path.join(sessionsDir, 'game-mappings.json');
    this.loadMappings();
  }

  setLibrary(games: LocalGame[]) {
    this.library = games;
    this.libraryById = new Map(games.map((g) => [g.id, g]));
    this.libraryIds = new Set(games.map((g) => g.id));
    this.libraryNormalizedTitles = new Set(games.map((g) => normalizeTitle(g.title)));
  }

  getLibrary(): LocalGame[] {
    return [...this.library];
  }

  addOrUpdateRunningGame(gameId: string, entry: RunningGame) {
    if (entry.pid && entry.pid !== process.pid) {
      for (const [existingId, existingEntry] of this.runningGames) {
        if (existingId !== gameId && existingEntry.pid === entry.pid) {
          // Merge telemetry / FPS / node data into existing entry instead of duplicate
          if (entry.fpsSnapshot && !existingEntry.fpsSnapshot) {
            existingEntry.fpsSnapshot = entry.fpsSnapshot;
          }
          if (entry.fpsAvailable != null) {
            existingEntry.fpsAvailable = entry.fpsAvailable;
          }
          if (entry.node && !existingEntry.node) {
            existingEntry.node = entry.node;
          }
          if (entry.hardware && !existingEntry.hardware) {
            existingEntry.hardware = entry.hardware;
          }
          return;
        }
      }
    }
    this.runningGames.set(gameId, entry);
  }

  startTracking(game: LocalGame, pid?: number) {
    const hostMatch = getCachedHostNodeAndHardware();
    const entry: RunningGame = {
      game,
      startTime: Date.now(),
      launchedByOtix: pid != null,
      pid,
      node: hostMatch.node,
      hardware: hostMatch.hardware,
      shareEligible: hostMatch.shareEligible,
    };
    this.runningGames.set(game.id, entry);

    // Refresh node & hardware in background
    void getHostNodeAndHardware().then((fresh) => {
      const current = this.runningGames.get(game.id);
      if (current) {
        current.node = fresh.node;
        current.hardware = fresh.hardware;
        current.shareEligible = fresh.shareEligible;
      }
    });

    // Mark as just played so it sorts to top immediately
    updateLastPlayedAt(game.id, new Date().toISOString());

    if (pid) {
      this.launchGracePeriodUntil.set(game.id, Date.now() + this.GRACE_PERIOD_MS);
      this.trackedPids.add(pid);
      this.startProcessCheck();
      // FPS capture is handled by the fps-capture plugin via eventBus
    } else {
      this.scheduleDiscoveryScans();
    }

    this.emit('game:started', entry);
  }

  stopTracking(gameId: string) {
    this.launchGracePeriodUntil.delete(gameId);
    this.clearDiscoveryScans();
    const entry = this.runningGames.get(gameId);
    const targetPid = entry?.pid;
    if (entry) {
      this.endSession(entry);
      this.runningGames.delete(gameId);
    }
    // Also clean up any other entry with same PID or normalized ID
    const norm = gameId.replace(/^(pc_|file_|iso_|steam_)+/, '');
    for (const [id, e] of this.runningGames) {
      if ((targetPid && e.pid === targetPid) || (norm && id.replace(/^(pc_|file_|iso_|steam_)+/, '') === norm)) {
        this.endSession(e);
        this.runningGames.delete(id);
      }
    }
  }

  activeGameId?: string;

  setActiveGame(gameId: string): RunningGame | null {
    this.activeGameId = gameId;
    return this.getRunningGame();
  }

  cycleActiveGame(): RunningGame | null {
    const games = this.getRunningGames();
    if (games.length <= 1) {
      return games[0] ?? null;
    }
    const currIdx = games.findIndex((g) => g.game.id === this.activeGameId);
    const nextIdx = (currIdx + 1) % games.length;
    this.activeGameId = games[nextIdx].game.id;
    return games[nextIdx];
  }

  getRunningGames(): RunningGame[] {
    const alive: RunningGame[] = [];
    const seenPids = new Set<number>();
    const seenGameIds = new Set<string>();

    for (const [, entry] of this.runningGames) {
      if (entry.pid) {
        // In test mocks, multiple fake processes may share process.pid.
        // In real execution, process.pid is the Electron process, and games have distinct PIDs.
        const isTestMockPid = entry.pid === process.pid;
        if (!isTestMockPid && seenPids.has(entry.pid)) continue;
        try {
          process.kill(entry.pid, 0);
          seenPids.add(entry.pid);
          if (!seenGameIds.has(entry.game.id)) {
            seenGameIds.add(entry.game.id);
            alive.push(entry);
          }
        } catch {
          // PID dead — skip. Don't endSession here: game may have
          // transitioned to a new PID (launcher → game process).
          // scanRunningProcesses will re-detect or clean up.
        }
      } else {
        if (!seenGameIds.has(entry.game.id)) {
          seenGameIds.add(entry.game.id);
          alive.push(entry);
        }
      }
    }
    if (this.activeGameId && alive.length > 1) {
      const activeIdx = alive.findIndex((g) => g.game.id === this.activeGameId);
      if (activeIdx > 0) {
        const [active] = alive.splice(activeIdx, 1);
        alive.unshift(active);
      }
    }
    return alive;
  }

  getRunningGame(): RunningGame | null {
    const games = this.getRunningGames();
    return games.length > 0 ? games[0] : null;
  }

  getRecentSessions(limit = 20): PlaySession[] {
    try {
      const data = fs.readFileSync(this.sessionsPath, 'utf-8');
      const sessions: PlaySession[] = JSON.parse(data);
      return sessions.slice(-Math.min(limit, MAX_SESSIONS));
    } catch {
      return [];
    }
  }

  getPlaytimeForGame(gameId: string): { totalMinutes: number; sessionCount: number; lastPlayed: number | null; lastFpsStats: FpsStats | null } {
    try {
      const data = fs.readFileSync(this.sessionsPath, 'utf-8');
      const sessions: PlaySession[] = JSON.parse(data);
      const gameSessions = sessions.filter((s) => s.gameId === gameId && s.endTime > s.startTime);
      const totalMs = gameSessions.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
      // Find most recent session that has FPS stats
      const withFps = gameSessions.filter((s) => s.fpsStats).sort((a, b) => b.endTime - a.endTime);
      return {
        totalMinutes: Math.round(totalMs / 60000),
        sessionCount: gameSessions.length,
        lastPlayed: gameSessions.length > 0 ? Math.max(...gameSessions.map((s) => s.endTime)) : null,
        lastFpsStats: withFps.length > 0 ? withFps[0].fpsStats! : null,
      };
    } catch {
      return { totalMinutes: 0, sessionCount: 0, lastPlayed: null, lastFpsStats: null };
    }
  }

  async scanRunningProcesses(): Promise<RunningGame[]> {
    if (this.isScanning) {
      return this.getRunningGames();
    }
    this.isScanning = true;
    try {
      const needWindowTitles = (this.library.length > 0 || this.mappings.length > 0 || this.runningGames.size > 0);
      const [processes, windowTitles] = await Promise.all([
        psList(),
        needWindowTitles ? getCachedWindowTitles() : Promise.resolve(new Map<string, string>()),
      ]);

      const snapshot = this.buildProcessSnapshot(processes, windowTitles);
      const currentlyRunning = new Set<string>();
      const claimedPids = new Set<number>();
      const claimedProcessKeys = new Set<string>();

      const isClaimed = (pid: number, procName?: string) => {
        if (pid === process.pid && procName) {
          return claimedProcessKeys.has(`${pid}:${procName.toLowerCase()}`);
        }
        return claimedPids.has(pid);
      };

      const claimProcess = (pid: number, procName?: string) => {
        claimedPids.add(pid);
        if (procName) {
          claimedProcessKeys.add(`${pid}:${procName.toLowerCase()}`);
        }
      };

      // Track any running process launched by Otix
      for (const [id, entry] of this.runningGames) {
        if (entry.launchedByOtix && entry.pid) {
          try {
            process.kill(entry.pid, 0);
            claimProcess(entry.pid);
            currentlyRunning.add(id);
          } catch {
            // Process terminated
          }
        }
      }

      // 0. Check custom user mappings first
      this.checkMappings(snapshot, currentlyRunning, claimedPids);

      const librarySnapshot = this.library;
      const CHUNK_SIZE = 2500;

      for (let i = 0; i < librarySnapshot.length; i++) {
        if (!this.isScanning) break;

        // Yield to event loop periodically so thousands of games don't freeze the main thread
        if (i > 0 && i % CHUNK_SIZE === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const game = librarySnapshot[i];
        if (currentlyRunning.has(game.id)) continue;

        let detectedPid: number | undefined;

        // 1. Window title match (highest confidence)
        detectedPid = this.matchWindowTitle(game, snapshot);
        if (detectedPid !== undefined) {
          const proc = snapshot.procByPid.get(detectedPid);
          if (isClaimed(detectedPid, proc?.name)) {
            detectedPid = undefined;
          }
        }

        // 2. Exact process name match (O(1) lookups via procByName)
        if (detectedPid === undefined) {
          const exeNames = this.getExeNames(game);
          for (const exeName of exeNames) {
            if (!exeName) continue;
            const enLower = exeName.toLowerCase();
            if (HEURISTIC_EXCLUDED_PROCESSES.has(enLower) || HEURISTIC_EXCLUDED_PROCESSES.has(enLower + '.exe')) continue;
            const proc = snapshot.procByName.get(enLower);
            if (proc) {
              if (isClaimed(proc.pid, proc.name)) continue;
              const pLower = proc.name.toLowerCase();
              if (HEURISTIC_EXCLUDED_PROCESSES.has(pLower) || HEURISTIC_EXCLUDED_PROCESSES.has(pLower + '.exe')) continue;
              detectedPid = proc.pid;
              break;
            }
          }
        }

        // 3. Fuzzy process name match (O(1) installDir check + pre-filtered candidate processes)
        if (detectedPid === undefined) {
          detectedPid = this.fuzzyMatchPid(game, snapshot);
          if (detectedPid !== undefined) {
            const proc = snapshot.procByPid.get(detectedPid);
            if (isClaimed(detectedPid, proc?.name)) {
              detectedPid = undefined;
            }
          }
        }

        // If matched a launcher process, check for a better renderer PID
        // (e.g. SB.exe launches SB-Win64-Shipping.exe which does actual rendering)
        if (detectedPid !== undefined) {
          const rendererPid = this.findRendererProcess(game, snapshot, detectedPid);
          if (rendererPid !== undefined && !isClaimed(rendererPid)) {
            detectedPid = rendererPid;
          }
        } else if (snapshot.rendererProcs.length > 0) {
          // Check for Unreal Engine renderer even if launcher is no longer running
          const rendererPid = this.findRendererProcess(game, snapshot, 0);
          if (rendererPid !== undefined && !isClaimed(rendererPid)) {
            detectedPid = rendererPid;
          }
        }

        if (detectedPid !== undefined) {
          const proc = snapshot.procByPid.get(detectedPid);
          if (isClaimed(detectedPid, proc?.name)) {
            continue;
          }
          // Skip if the detected process is a known non-game (e.g. wallpaper engine, browser, launcher)
          if (proc) {
            const pLower = proc.name.toLowerCase();
            if (HEURISTIC_EXCLUDED_PROCESSES.has(pLower) || HEURISTIC_EXCLUDED_PROCESSES.has(pLower + '.exe')) {
              continue;
            }
          }
          currentlyRunning.add(game.id);
          claimProcess(detectedPid, proc?.name);

          // Evict any existing duplicate entries in this.runningGames with the same PID
          for (const [existingId, existingEntry] of this.runningGames) {
            if (
              existingId !== game.id &&
              existingEntry.pid === detectedPid &&
              (detectedPid !== process.pid || normalizeTitle(existingEntry.game.title) === normalizeTitle(game.title))
            ) {
              this.runningGames.delete(existingId);
            }
          }

          const existing = this.runningGames.get(game.id);
          if (!existing) {
            // New game detected — start tracking
            const hostMatch = getCachedHostNodeAndHardware();
            const entry: RunningGame = {
              game,
              startTime: Date.now(),
              launchedByOtix: false,
              pid: detectedPid,
              node: hostMatch.node,
              hardware: hostMatch.hardware,
              shareEligible: hostMatch.shareEligible,
            };
            this.runningGames.set(game.id, entry);
            void getHostNodeAndHardware().then((fresh) => {
              const current = this.runningGames.get(game.id);
              if (current) {
                current.node = fresh.node;
                current.hardware = fresh.hardware;
                current.shareEligible = fresh.shareEligible;
              }
            });
            this.trackedPids.add(detectedPid);
            this.startProcessCheck();
            this.emit('game:started', entry);
          } else if (existing.pid !== detectedPid) {
            // PID detected or transitioned (e.g. protocol launch or launcher → game process)
            const oldPid = existing.pid;
            existing.pid = detectedPid;
            if (oldPid) { this.trackedPids.delete(oldPid); }
            this.trackedPids.add(detectedPid);
            this.launchGracePeriodUntil.delete(game.id);
            this.startProcessCheck();
            this.emit('game:updated', existing);
          }
        }
      }

      // 4. Check known popular game executable signatures for unindexed games (if allowed by settings)
      const settings = getSettings();
      if (!settings.onlyTrackScannedGames) {
        for (const entry of this.runningGames.values()) {
          if (entry.pid) claimedPids.add(entry.pid);
        }

        for (const proc of processes) {
          if (claimedPids.has(proc.pid)) continue;
          const lower = proc.name.toLowerCase();
          if (HEURISTIC_EXCLUDED_PROCESSES.has(lower) || HEURISTIC_EXCLUDED_PROCESSES.has(lower + '.exe')) continue;
            const knownTitle = KNOWN_GAME_SIGNATURES[lower] || KNOWN_GAME_SIGNATURES[lower + '.exe'];
            if (knownTitle) {
              const gameId = knownTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              const normKnown = normalizeTitle(knownTitle);

              // Check if a game in this.library matches this known title but wasn't claimed yet
              const matchedLibGame = this.library.find((g) => {
                if (currentlyRunning.has(g.id)) return false;
                if (g.id === gameId) return true;
                return normalizeTitle(g.title) === normKnown;
              });

              const targetGameId = matchedLibGame ? matchedLibGame.id : gameId;

              if (!currentlyRunning.has(targetGameId)) {
                if (matchedLibGame) {
                  currentlyRunning.add(matchedLibGame.id);
                  claimedPids.add(proc.pid);
                  const existing = this.runningGames.get(matchedLibGame.id);
                  if (!existing) {
                    const hostMatch = getCachedHostNodeAndHardware();
                    const entry: RunningGame = {
                      game: matchedLibGame,
                      startTime: Date.now(),
                      launchedByOtix: false,
                      pid: proc.pid,
                      node: hostMatch.node,
                      hardware: hostMatch.hardware,
                      shareEligible: hostMatch.shareEligible,
                    };
                    this.runningGames.set(matchedLibGame.id, entry);
                    void getHostNodeAndHardware().then((fresh) => {
                      const current = this.runningGames.get(matchedLibGame.id);
                      if (current) {
                        current.node = fresh.node;
                        current.hardware = fresh.hardware;
                        current.shareEligible = fresh.shareEligible;
                      }
                    });
                    this.trackedPids.add(proc.pid);
                    this.startProcessCheck();
                    this.emit('game:started', entry);
                  } else if (existing.pid !== proc.pid) {
                    const oldPid = existing.pid;
                    existing.pid = proc.pid;
                    if (oldPid) { this.trackedPids.delete(oldPid); }
                    this.trackedPids.add(proc.pid);
                  }
                } else if (!this.libraryIds.has(gameId) && !this.libraryNormalizedTitles.has(normKnown)) {
                  // Synthesize untracked game if not in library
                  currentlyRunning.add(gameId);
                  claimedPids.add(proc.pid);
                  const existing = this.runningGames.get(gameId);
                  if (!existing) {
                    const hostMatch = getCachedHostNodeAndHardware();
                    const synthGame: LocalGame = {
                      id: gameId,
                      title: knownTitle,
                      platform: 'pc',
                      exePath: '',
                      installDir: '',
                    };
                    const entry: RunningGame = {
                      game: synthGame,
                      startTime: Date.now(),
                      launchedByOtix: false,
                      pid: proc.pid,
                      node: hostMatch.node,
                      hardware: hostMatch.hardware,
                      shareEligible: hostMatch.shareEligible,
                    };
                    this.runningGames.set(gameId, entry);
                    void getHostNodeAndHardware().then((fresh) => {
                      const current = this.runningGames.get(gameId);
                      if (current) {
                        current.node = fresh.node;
                        current.hardware = fresh.hardware;
                        current.shareEligible = fresh.shareEligible;
                      }
                    });
                    this.trackedPids.add(proc.pid);
                    this.startProcessCheck();
                    this.emit('game:started', entry);
                  } else if (existing.pid !== proc.pid) {
                    const oldPid = existing.pid;
                    existing.pid = proc.pid;
                    if (oldPid) { this.trackedPids.delete(oldPid); }
                    this.trackedPids.add(proc.pid);
                  }
                }
              }
            }
        }
      }

      // End sessions for game no longer detected
      const now = Date.now();
      for (const [id, entry] of this.runningGames) {
        if (currentlyRunning.has(id)) continue;

        let shouldKeep = false;
        const graceUntil = this.launchGracePeriodUntil.get(id);
        if (entry.launchedByOtix && graceUntil && now < graceUntil) {
          // Keep session alive during active launch grace period while waiting for game process
          shouldKeep = true;
        } else if (entry.pid) {
          try {
            process.kill(entry.pid, 0);
            if (entry.launchedByOtix) {
              // Otix-launched process: keep alive while spawned process is running
              shouldKeep = true;
            } else {
              // Heuristically detected game: only keep if process still exists and genuinely matches game executable
              const proc = snapshot.procByPid.get(entry.pid);
              if (proc) {
                const pLower = proc.name.toLowerCase();
                const isExcluded = HEURISTIC_EXCLUDED_PROCESSES.has(pLower) || HEURISTIC_EXCLUDED_PROCESSES.has(pLower + '.exe');
                if (!isExcluded) {
                  const exeNames = this.getExeNames(entry.game).map((e) => e.toLowerCase());
                  if (exeNames.includes(pLower) || exeNames.includes(pLower + '.exe')) {
                    shouldKeep = true;
                  }
                }
              }
            }
          } catch {
            this.trackedPids.delete(entry.pid);
          }
        }

        if (shouldKeep) {
          currentlyRunning.add(id);
          continue;
        }

        this.launchGracePeriodUntil.delete(id);
        this.endSession(entry);
        this.runningGames.delete(id);
      }
    } catch (err) {
      console.error('[GameDetector] Process scan failed:', err);
    } finally {
      this.isScanning = false;
    }

    return this.getRunningGames();
  }

  startPeriodicScan() {
    this.stopPeriodicScan();
    this.scanTimer = setInterval(() => {
      this.scanRunningProcesses();
    }, SCAN_INTERVAL_MS);
    this.scanRunningProcesses();
  }

  stopPeriodicScan() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  /** Consolidated dead check & process status */
  private startDeadCheck() {
    this.startProcessCheck();
  }

  private stopDeadCheck() {
    this.stopProcessCheck();
  }

  private scheduleDiscoveryScans() {
    this.clearDiscoveryScans();
    const intervals = [1000, 2500, 5000, 10000];
    for (const delay of intervals) {
      const timer = setTimeout(() => {
        void this.scanRunningProcesses();
      }, delay);
      this.discoveryTimers.push(timer);
    }
  }

  private clearDiscoveryScans() {
    for (const t of this.discoveryTimers) clearTimeout(t);
    this.discoveryTimers = [];
  }

  stopAll() {
    this.isScanning = false;
    this.stopPeriodicScan();
    this.stopProcessCheck();
    this.stopDeadCheck();
    this.clearDiscoveryScans();
    this.launchGracePeriodUntil.clear();
    clearWindowTitlesCache();
    for (const [id, entry] of Array.from(this.runningGames.entries())) {
      try {
        this.endSession(entry);
      } catch (err) {
        console.warn('[GameDetector] Error ending session during stopAll:', err);
      } finally {
        this.runningGames.delete(id);
      }
    }
    this.runningGames.clear();
  }

  // ── Manual mappings ──

  async getRunningProcesses(): Promise<DetectedProcess[]> {
    try {
      const [processes, windowTitles] = await Promise.all([
        psList(),
        getCachedWindowTitles(),
      ]);

      const windowTitleByPid = new Map<number, string>();
      const windowTitleByName = new Map<string, string>();

      for (const [key, title] of windowTitles) {
        if (!title) continue;
        const [procName, pidStr] = key.split('|');
        const keyPid = parseInt(pidStr, 10);
        if (!isNaN(keyPid)) {
          windowTitleByPid.set(keyPid, title);
        }
        const pLower = procName.toLowerCase();
        if (!windowTitleByName.has(pLower)) {
          windowTitleByName.set(pLower, title);
        }
        const pBase = pLower.replace(/\.exe$/i, '');
        if (!windowTitleByName.has(pBase)) {
          windowTitleByName.set(pBase, title);
        }
      }

      return processes
        .filter((p) => {
          const name = p.name.toLowerCase();
          if (name.startsWith('system') || name === 'idle') return false;
          if (NON_GAME_PROCESSES.has(name) || NON_GAME_PROCESSES.has(name + '.exe')) return false;
          return true;
        })
        .map((p) => {
          const pNameLower = p.name.toLowerCase();
          const pBase = pNameLower.replace(/\.exe$/i, '');
          const windowTitle =
            windowTitleByPid.get(p.pid) ??
            windowTitleByName.get(pNameLower) ??
            windowTitleByName.get(pBase) ??
            null;

          return {
            name: p.name,
            pid: p.pid,
            windowTitle,
          };
        })
        .sort((a, b) => {
          // Windowed processes first, then alphabetically
          if (a.windowTitle && !b.windowTitle) return -1;
          if (!a.windowTitle && b.windowTitle) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch (err) {
      console.error('[GameDetector] getRunningProcesses failed:', err);
      return [];
    }
  }

  addMapping(processName: string, gameId: string, gameTitle: string) {
    // Remove any existing mapping for this process name
    this.mappings = this.mappings.filter((m) => m.processName !== processName);
    this.mappings.push({ processName, gameId, gameTitle });
    this.saveMappings();
  }

  removeMapping(processName: string) {
    this.mappings = this.mappings.filter((m) => m.processName !== processName);
    this.saveMappings();
  }

  getMappings(): ProcessMapping[] {
    return [...this.mappings];
  }

  // ── Private helpers ──

  private loadMappings() {
    try {
      if (fs.existsSync(this.mappingsPath)) {
        const data = fs.readFileSync(this.mappingsPath, 'utf-8');
        this.mappings = JSON.parse(data);
      }
    } catch {
      this.mappings = [];
    }
  }

  private saveMappings() {
    try {
      const dir = path.dirname(this.mappingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.mappingsPath, JSON.stringify(this.mappings, null, 2));
    } catch (err) {
      console.error('[GameDetector] Failed to save mappings:', err);
    }
  }

  private buildProcessSnapshot(
    processes: { name: string; pid: number }[],
    windowTitles: Map<string, string>,
  ): ProcessSnapshot {
    const procByName = new Map<string, { name: string; pid: number }>();
    const procByPid = new Map<number, { name: string; pid: number }>();
    const procNamesList: string[] = [];
    const candidateProcs: CandidateProc[] = [];
    const rendererProcs: RendererProc[] = [];

    for (const proc of processes) {
      const lower = proc.name.toLowerCase();
      procNamesList.push(lower);

      if (!procByName.has(lower)) {
        procByName.set(lower, proc);
      }
      const base = lower.replace(/\.exe$/i, '');
      if (!procByName.has(base)) {
        procByName.set(base, proc);
      }
      const withExe = base + '.exe';
      if (!procByName.has(withExe)) {
        procByName.set(withExe, proc);
      }

      if (!procByPid.has(proc.pid)) {
        procByPid.set(proc.pid, proc);
      }

      if (HEURISTIC_EXCLUDED_PROCESSES.has(lower) || HEURISTIC_EXCLUDED_PROCESSES.has(withExe)) {
        continue;
      }

      const words = base.split(/[^a-z0-9_]+/i).filter((w) => w.length > 2);
      candidateProcs.push({
        pid: proc.pid,
        nameLower: lower,
        baseLower: base,
        hasUnderscore: base.includes('_'),
        wordsSet: new Set(words),
      });

      if (/-win64-shipping$/.test(base) || /-shipping$/.test(base)) {
        const pnNoSuffix = base.replace(/-(win64-)?shipping$/i, '').toLowerCase();
        if (pnNoSuffix) {
          rendererProcs.push({
            pid: proc.pid,
            pn: base,
            pnNoSuffix,
          });
        }
      }
    }

    const windowEntries: WindowEntry[] = [];
    if (windowTitles.size > 0) {
      for (const [procKey, winTitle] of windowTitles) {
        if (!winTitle) continue;
        const [procName, pidStr] = procKey.split('|');
        const keyPid = parseInt(pidStr, 10);
        const pLower = procName.toLowerCase();
        if (HEURISTIC_EXCLUDED_PROCESSES.has(pLower) || HEURISTIC_EXCLUDED_PROCESSES.has(pLower + '.exe')) {
          continue;
        }

        let pid: number | undefined;
        if (!isNaN(keyPid) && procByPid.has(keyPid)) {
          pid = keyPid;
        } else {
          const proc = procByName.get(pLower) || procByName.get(pLower + '.exe');
          if (proc) {
            pid = proc.pid;
          } else if (!isNaN(keyPid)) {
            pid = keyPid;
          }
        }

        if (pid === undefined) continue;

        const winLower = winTitle.toLowerCase();
        const words = winLower.split(/[^a-z0-9_]+/i).filter((w) => w.length > 2);
        windowEntries.push({
          winTitle,
          winLower,
          pid,
          hasUnderscore: winLower.includes('_'),
          wordsSet: new Set(words),
        });
      }
    }

    return {
      processes,
      procByName,
      procByPid,
      procNamesList,
      candidateProcs,
      rendererProcs,
      windowEntries,
    };
  }

  private checkMappings(
    snapshotOrProcesses: ProcessSnapshot | { name: string; pid: number }[],
    currentlyRunning: Set<string>,
    claimedPids?: Set<number>,
  ) {
    const isSnapshot = 'procByName' in snapshotOrProcesses;
    const procByName = isSnapshot
      ? (snapshotOrProcesses as ProcessSnapshot).procByName
      : null;
    const processes = isSnapshot
      ? (snapshotOrProcesses as ProcessSnapshot).processes
      : (snapshotOrProcesses as { name: string; pid: number }[]);

    for (const mapping of this.mappings) {
      const pNameLower = mapping.processName.toLowerCase();
      const proc = procByName
        ? procByName.get(pNameLower)
        : processes.find((p) => p.name.toLowerCase() === pNameLower);
      if (!proc) continue;
      if (claimedPids && claimedPids.has(proc.pid)) continue;

      if (claimedPids) claimedPids.add(proc.pid);
      currentlyRunning.add(mapping.gameId);
      if (!this.runningGames.has(mapping.gameId)) {
        const game = this.libraryById.get(mapping.gameId) || this.library.find((g) => g.id === mapping.gameId);
        if (game) {
          const hostMatch = getCachedHostNodeAndHardware();
          const entry: RunningGame = {
            game,
            startTime: Date.now(),
            launchedByOtix: false,
            pid: proc.pid,
            node: hostMatch.node,
            hardware: hostMatch.hardware,
            shareEligible: hostMatch.shareEligible,
          };
          this.runningGames.set(mapping.gameId, entry);
          void getHostNodeAndHardware().then((fresh) => {
            const current = this.runningGames.get(mapping.gameId);
            if (current) {
              current.node = fresh.node;
              current.hardware = fresh.hardware;
              current.shareEligible = fresh.shareEligible;
            }
          });
          this.trackedPids.add(proc.pid);
          this.startProcessCheck();
          // FPS capture handled by fps-capture plugin via eventBus
          this.emit('game:started', entry);
        }
      }
    }
  }

  // ── Private matching helpers ──

  // Returns the PID of the matched process, or undefined if no match.
  private matchWindowTitle(
    game: LocalGame,
    snapshotOrWindowTitles: ProcessSnapshot | Map<string, string>,
    processes?: { name: string; pid: number }[],
  ): number | undefined {
    // Non-PC games, ROMs, and archive files should not match PC desktop windows directly
    if (game.platform === 'iso' || isRomGame(game)) {
      return undefined;
    }
    if (game.exePath && /\.(zip|rar|7z|tar|gz|bz2|iso|bin)$/i.test(game.exePath)) {
      return undefined;
    }

    let snapshot: ProcessSnapshot;
    if ('windowEntries' in snapshotOrWindowTitles) {
      snapshot = snapshotOrWindowTitles as ProcessSnapshot;
    } else {
      snapshot = this.buildProcessSnapshot(processes ?? [], snapshotOrWindowTitles as Map<string, string>);
    }

    if (snapshot.windowEntries.length === 0) {
      return undefined;
    }

    const titleLower = game.title.toLowerCase();
    const normTitle = normalizeTitle(game.title);
    const titleWords = normTitle.split(/\s+/).filter((w) => w.length > 2 && !GENERIC_TITLE_WORDS.has(w));
    const isGenericTitle = titleWords.length === 0;

    for (const entry of snapshot.windowEntries) {
      const proc = snapshot.procByPid.get(entry.pid);
      if (proc) {
        const pLower = proc.name.toLowerCase();
        if (HEURISTIC_EXCLUDED_PROCESSES.has(pLower) || HEURISTIC_EXCLUDED_PROCESSES.has(pLower + '.exe')) {
          continue;
        }
      }

      let matched = false;

      // Exact title match
      if (entry.winLower === titleLower || entry.winLower === normTitle) {
        matched = true;
      } else if (!isGenericTitle) {
        // Direct title match as full phrase
        if (normTitle.length >= 4 && entry.winLower.includes(normTitle)) {
          matched = true;
        } else if (titleLower.length >= 4 && entry.winLower.includes(titleLower)) {
          matched = true;
        } else if (normTitle.length > 5 && normTitle.includes(entry.winLower) && entry.winLower.length >= 5) {
          matched = true;
        } else if (titleWords.length >= 2) {
          // Word match: require ALL distinctive words if 2 words; min 2 if 3+
          const target = titleWords.length === 2 ? 2 : Math.min(titleWords.length, 2);
          let matchCount = 0;
          for (const w of titleWords) {
            if (!entry.winLower.includes(w)) continue;
            if (!entry.hasUnderscore && entry.wordsSet.has(w)) {
              matchCount++;
            } else if (getWordRegex(w).test(entry.winLower)) {
              matchCount++;
            }
            if (matchCount >= target) {
              matched = true;
              break;
            }
          }
        } else if (titleWords.length === 1) {
          const w = titleWords[0];
          // For a single distinctive word, require it to appear at boundary or stand alone
          // to prevent generic substrings matching arbitrary apps (e.g. "App..." or "Inside...")
          if (w.length >= 4 && (
            entry.winLower.startsWith(w + ' ') ||
            entry.winLower.startsWith(w + ' -') ||
            entry.winLower.startsWith(w + ':') ||
            entry.winLower.endsWith(' - ' + w) ||
            entry.winLower.endsWith(' | ' + w)
          )) {
            matched = true;
          }
        }
      }

      if (matched) {
        return entry.pid;
      }
    }

    return undefined;
  }

  // Returns PID of matched process, or undefined.
  private fuzzyMatchPid(
    game: LocalGame,
    snapshotOrProcesses: ProcessSnapshot | { name: string; pid: number }[],
  ): number | undefined {
    // Non-PC games and archive/ROM files should never fuzzy-match PC executable processes
    if (game.platform === 'iso' || isRomGame(game)) {
      return undefined;
    }
    if (game.exePath && /\.(zip|rar|7z|tar|gz|bz2|iso|bin)$/i.test(game.exePath)) {
      return undefined;
    }
    if (game.installDir && /\.(zip|rar|7z|tar|gz|bz2)$/i.test(game.installDir)) {
      return undefined;
    }
    if (game.title && /\.(zip|rar|7z|tar|gz|bz2)$/i.test(game.title)) {
      return undefined;
    }

    let snapshot: ProcessSnapshot;
    if ('candidateProcs' in snapshotOrProcesses) {
      snapshot = snapshotOrProcesses as ProcessSnapshot;
    } else {
      snapshot = this.buildProcessSnapshot(snapshotOrProcesses as { name: string; pid: number }[], new Map());
    }

    // 1. Check install directory basename against procByName in O(1)
    if (game.installDir) {
      const dirName = path.basename(game.installDir).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (dirName.length > 3 && !GENERIC_TITLE_WORDS.has(dirName)) {
        const proc = snapshot.procByName.get(dirName + '.exe') || snapshot.procByName.get(dirName);
        if (proc) {
          const pLower = proc.name.toLowerCase();
          if (!HEURISTIC_EXCLUDED_PROCESSES.has(pLower) && !HEURISTIC_EXCLUDED_PROCESSES.has(pLower + '.exe')) {
            return proc.pid;
          }
        }
      }
    }

    if (snapshot.candidateProcs.length === 0) {
      return undefined;
    }

    const norm = normalizeTitle(game.title);
    const normNoSpaces = norm.replace(/\s/g, '');
    const titleWords = norm.split(/\s+/).filter((w) => w.length > 2 && !GENERIC_TITLE_WORDS.has(w));
    const checkSubstring = normNoSpaces.length > 4 && !GENERIC_TITLE_WORDS.has(normNoSpaces);
    const checkWords = titleWords.length > 0;
    const threshold = titleWords.length <= 1 ? 1 : (titleWords.length === 2 ? 2 : Math.min(2, titleWords.length));

    if (!checkSubstring && !checkWords) {
      return undefined;
    }

    for (const proc of snapshot.candidateProcs) {
      // Normalized title as substring
      if (checkSubstring && proc.baseLower.includes(normNoSpaces)) {
        return proc.pid;
      }

      // Word match with whole-word boundaries
      if (checkWords) {
        if (titleWords.length === 1 && titleWords[0].length < 4) continue;
        let matchCount = 0;
        for (const w of titleWords) {
          if (!proc.baseLower.includes(w)) continue;
          if (!proc.hasUnderscore && proc.wordsSet.has(w)) {
            matchCount++;
          } else if (getWordRegex(w).test(proc.baseLower)) {
            matchCount++;
          }
          if (matchCount >= threshold) {
            return proc.pid;
          }
        }
      }
    }

    return undefined;
  }

  private getExeNames(game: LocalGame): string[] {
    const cached = this.exeNamesCache.get(game);
    if (cached) return cached;

    const names: string[] = [];
    if (game.exePath && !game.exePath.startsWith('steam://')) {
      names.push(path.basename(game.exePath));
    }
    if (game.localExePath) {
      names.push(path.basename(game.localExePath));
    }
    names.push(...titleToExeCandidates(game.title));

    this.exeNamesCache.set(game, names);
    return names;
  }

  /**
   * Check if a matched launcher process has a known renderer child.
   * Unreal Engine games often use a launcher (SB.exe) that spawns the real
   * renderer (SB-Win64-Shipping.exe). If found, return the renderer's PID.
   */
  private findRendererProcess(
    game: LocalGame,
    snapshotOrProcesses: ProcessSnapshot | { name: string; pid: number }[],
    _launcherPid?: number,
  ): number | undefined {
    let snapshot: ProcessSnapshot;
    if ('rendererProcs' in snapshotOrProcesses) {
      snapshot = snapshotOrProcesses as ProcessSnapshot;
    } else {
      snapshot = this.buildProcessSnapshot(snapshotOrProcesses as { name: string; pid: number }[], new Map());
    }

    if (snapshot.rendererProcs.length === 0) {
      return undefined;
    }

    const norm = normalizeTitle(game.title);
    const normNoSpaces = norm.replace(/\s/g, '').toLowerCase();
    const nameNoSpaces = game.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exeNames = this.getExeNames(game);

    for (const rProc of snapshot.rendererProcs) {
      const pn = rProc.pn;
      // Direct match: renderer name contains game title (minimum 3 chars to prevent false positives)
      if (nameNoSpaces.length >= 3 && pn.includes(nameNoSpaces)) return rProc.pid;
      if (normNoSpaces.length >= 3 && pn.includes(normNoSpaces)) return rProc.pid;

      // Exe name match: renderer matches one of the game's exe patterns
      if (exeNames.some((en) => {
        const target = en.replace(/\.exe$/i, '').toLowerCase();
        return target.length >= 3 && pn.includes(target);
      })) return rProc.pid;
    }

    return undefined;
  }

  private startProcessCheck() {
    this.stopProcessCheck();
    this.processCheckTimer = setInterval(() => {
      let hasTrackedPid = false;
      const now = Date.now();
      for (const [id, entry] of this.runningGames) {
        if (entry.pid) {
          try {
            process.kill(entry.pid, 0);
            hasTrackedPid = true;
          } catch {
            // PID is dead — check grace period for Otix-launched processes
            this.trackedPids.delete(entry.pid);
            const graceUntil = this.launchGracePeriodUntil.get(id);
            if (entry.launchedByOtix && graceUntil && now < graceUntil) {
              // Intermediate launcher process terminated — grant grace period and scan for game process
              entry.pid = undefined;
              void this.scanRunningProcesses();
            } else {
              this.launchGracePeriodUntil.delete(id);
              try {
                this.endSession(entry);
              } catch (err) {
                console.warn('[GameDetector] Error ending session for dead PID:', err);
              } finally {
                this.runningGames.delete(id);
              }
            }
          }
        } else if (entry.launchedByOtix) {
          // Process PID is undefined, waiting in grace period
          const graceUntil = this.launchGracePeriodUntil.get(id);
          if (graceUntil && now >= graceUntil) {
            // Grace period expired without detecting game process
            this.launchGracePeriodUntil.delete(id);
            try {
              this.endSession(entry);
            } catch (err) {
              console.warn('[GameDetector] Error ending session after grace period expired:', err);
            } finally {
              this.runningGames.delete(id);
            }
          } else if (graceUntil) {
            // Still within grace period — re-scan running processes
            void this.scanRunningProcesses();
          }
        }
      }
      if (this.runningGames.size === 0) {
        this.stopProcessCheck();
      }
    }, 2000);
  }

  private stopProcessCheck() {
    if (this.processCheckTimer) {
      clearInterval(this.processCheckTimer);
      this.processCheckTimer = null;
    }
  }

  private endSession(entry: RunningGame) {
    // FPS stats are captured by the fps-capture plugin via eventBus.
    // The plugin saves the enriched session to play-sessions.json.
    const hostMatch = getCachedHostNodeAndHardware();
    const g = entry.game as any;
    const procName = g.processName || (g.exePath ? path.basename(g.exePath) : undefined);

    const session: PlaySession = {
      id: `sess-${entry.game.id}-${entry.startTime}`,
      gameId: entry.game.id,
      gameTitle: entry.game.title,
      startTime: entry.startTime,
      endTime: Date.now(),
      launchedByOtix: entry.launchedByOtix,
      node: entry.node ?? hostMatch.node ?? null,
      hardware: entry.hardware ?? hostMatch.hardware ?? null,
      shareEligible: entry.shareEligible ?? Boolean(entry.node?.installed || entry.hardware?.gpu || hostMatch.shareEligible),
      posterUrl: g.posterUrl || g.otixPosterUrl || null,
      backdropUrl: g.backdropUrl || g.otixBackdropUrl || null,
      bannerUrl: g.bannerUrl || null,
      slug: g.slug || g.otixMediaSlug || null,
      otixMediaId: g.otixMediaId || null,
      processName: procName || null,
    };

    this.saveSession(session);
    try {
      updateLastPlayedAt(entry.game.id, new Date(session.endTime).toISOString());
    } catch (err) {
      console.warn('[GameDetector] Failed to update last played in DB:', err);
    }
    this.emit('game:ended', session);
  }

  private saveSession(session: PlaySession) {
    try {
      const dir = path.dirname(this.sessionsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let sessions: PlaySession[] = [];
      try {
        const data = fs.readFileSync(this.sessionsPath, 'utf-8');
        sessions = JSON.parse(data);
      } catch {
        // File doesn't exist or corrupted — start fresh
      }

      const existingIdx = sessions.findIndex((s) => (
        s.gameId === session.gameId &&
        Math.abs((s.startTime || 0) - (session.startTime || 0)) <= 5000
      ));

      if (existingIdx >= 0) {
        sessions[existingIdx] = {
          ...sessions[existingIdx],
          ...session,
          node: session.node || sessions[existingIdx].node || null,
          hardware: session.hardware || sessions[existingIdx].hardware || null,
          fpsStats: session.fpsStats || sessions[existingIdx].fpsStats || null,
          shareEligible: session.shareEligible ?? sessions[existingIdx].shareEligible ?? false,
          posterUrl: session.posterUrl || sessions[existingIdx].posterUrl || null,
          backdropUrl: session.backdropUrl || sessions[existingIdx].backdropUrl || null,
          bannerUrl: session.bannerUrl || sessions[existingIdx].bannerUrl || null,
          slug: session.slug || sessions[existingIdx].slug || null,
          otixMediaId: session.otixMediaId || sessions[existingIdx].otixMediaId || null,
          processName: session.processName || sessions[existingIdx].processName || null,
        };
      } else {
        sessions.push(session);
      }

      if (sessions.length > MAX_SESSIONS) {
        sessions = sessions.slice(-MAX_SESSIONS);
      }

      fs.writeFileSync(this.sessionsPath, JSON.stringify(sessions, null, 2));
    } catch (err) {
      console.error('[GameDetector] Failed to save session:', err);
    }
  }

  updateSessionFpsStats(gameId: string, fpsStats: FpsStats): void {
    try {
      if (!fs.existsSync(this.sessionsPath)) return;
      const data = fs.readFileSync(this.sessionsPath, 'utf-8');
      const sessions: PlaySession[] = JSON.parse(data);
      let updated = false;
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].gameId === gameId) {
          sessions[i].fpsStats = fpsStats;
          updated = true;
          break;
        }
      }
      if (updated) {
        fs.writeFileSync(this.sessionsPath, JSON.stringify(sessions, null, 2));
      }
    } catch (err) {
      console.error('[GameDetector] Failed to update FPS stats for session:', err);
    }
  }
}

import http from 'http';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export interface Cs2LiveState {
  activity: 'menu' | 'playing' | 'textinput' | string;
  isInGame: boolean;
  playerName?: string;
  rawMapName: string;
  mapName: string;
  mode: string;
  phase: string;
  round: number;
  scoreCt: number;
  scoreT: number;
  health: number;
  armor: number;
  helmet: boolean;
  team: string;
  kills: number;
  deaths: number;
  assists: number;
  mvps: number;
  roundKills: number;
  bombState?: 'planted' | 'defused' | 'exploded' | null;
  isSpectating?: boolean;
  spectatingPlayerName?: string;
  money?: number;
  timestamp: number;
}

export const CS2_GSI_DEFAULT_PORT = 31337;
export const CS2_GSI_LEGACY_PORT = 5000;
export const CS2_GSI_PATH = '/api/cs2-gsi';
const HEARTBEAT_TIMEOUT_MS = 15000;

/** Maps standard CS2 internal map IDs to clean display names */
export function cleanCs2MapName(raw: string): string {
  if (!raw) return 'Unknown Map';
  const lower = raw.toLowerCase().trim();
  const mapDictionary: Record<string, string> = {
    de_mirage: 'Mirage',
    de_dust2: 'Dust II',
    de_inferno: 'Inferno',
    de_nuke: 'Nuke',
    de_ancient: 'Ancient',
    de_anubis: 'Anubis',
    de_vertigo: 'Vertigo',
    de_overpass: 'Overpass',
    de_train: 'Train',
    de_thera: 'Thera',
    de_mills: 'Mills',
    cs_office: 'Office',
    cs_italy: 'Italy',
  };
  if (mapDictionary[lower]) {
    return mapDictionary[lower];
  }
  return raw.replace(/^(de_|cs_|ar_)/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export class Cs2GsiManager extends EventEmitter {
  private servers: http.Server[] = [];
  private currentState: Cs2LiveState | null = null;
  private expiryTimer: NodeJS.Timeout | null = null;
  private readonly port: number;
  private localPlayerCache = {
    steamid: null as string | null,
    name: '',
    team: '',
    kills: 0,
    deaths: 0,
    assists: 0,
    mvps: 0,
  };

  constructor(port = CS2_GSI_DEFAULT_PORT) {
    super();
    this.port = port;
  }

  public getState(): Cs2LiveState | null {
    return this.currentState;
  }

  private createServerInstance(targetPort: number): Promise<http.Server | null> {
    return new Promise((resolve) => {
      const srv = http.createServer((req, res) => {
        // Universal CORS headers so web frontend (browser) can query live state without cross-origin blocks
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method === 'GET') {
          const urlPath = req.url?.split('?')[0];
          if (
            urlPath === '/api/cs2-gsi/state' ||
            urlPath === '/api/cs2-gsi' ||
            urlPath === '/state' ||
            urlPath === '/'
          ) {
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Connection': 'close',
            });
            res.end(JSON.stringify(this.currentState));
            return;
          }
          res.writeHead(404, { 'Content-Type': 'text/plain', 'Connection': 'close' });
          res.end('Not Found');
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 2e6) {
              req.destroy();
            }
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              this.handlePayload(data);
              res.writeHead(200, { 'Content-Type': 'text/plain', 'Connection': 'close' });
              res.end('OK');
            } catch {
              res.writeHead(400, { 'Content-Type': 'text/plain', 'Connection': 'close' });
              res.end('Invalid JSON');
            }
          });
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain', 'Connection': 'close' });
          res.end('Not Found');
        }
      });

      srv.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[CS2 GSI] Port ${targetPort} is already in use. Listener skipped.`);
          resolve(null);
        } else {
          console.error(`[CS2 GSI] Server error on port ${targetPort}:`, err);
          resolve(null);
        }
      });

      srv.listen(targetPort, '0.0.0.0', () => {
        resolve(srv);
      });
    });
  }

  public async start(): Promise<void> {
    if (this.servers.length > 0) return;

    const portsToListen = [this.port];
    if (this.port !== CS2_GSI_LEGACY_PORT) {
      portsToListen.push(CS2_GSI_LEGACY_PORT);
    }

    for (const p of portsToListen) {
      const serverInstance = await this.createServerInstance(p);
      if (serverInstance) {
        this.servers.push(serverInstance);
      }
    }
  }

  public stop(): Promise<void> {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.currentState = null;

    if (this.servers.length === 0) return Promise.resolve();

    const activeServers = [...this.servers];
    this.servers = [];

    return Promise.all(
      activeServers.map(
        (srv) =>
          new Promise<void>((resolve) => {
            srv.closeAllConnections?.();
            srv.close(() => resolve());
          })
      )
    ).then(() => undefined);
  }

  public handlePayload(data: any): void {
    if (!data || typeof data !== 'object') return;

    const provider = data.provider;
    const player = data.player;
    const allplayers = data.allplayers;
    const round = data.round;
    const map = data.map;

    const localSteamId = provider?.steamid ? String(provider.steamid) : null;
    const observedSteamId = player?.steamid ? String(player.steamid) : null;

    // Detect if the user is spectating another player
    const isSpectatorTeam = player?.team === 'spectator' || player?.activity === 'spectating';
    const isWatchingOther = Boolean(localSteamId && observedSteamId && localSteamId !== observedSteamId);
    const isSpectating = isSpectatorTeam || isWatchingOther;

    const activity = player?.activity || (map ? 'playing' : 'menu');
    const isInGame = Boolean(map && map.name && activity !== 'menu');

    let newState: Cs2LiveState;

    if (!isInGame) {
      // Player is in main menu / party lobby / queue
      newState = {
        activity,
        isInGame: false,
        playerName: this.localPlayerCache.name || player?.name || undefined,
        rawMapName: map?.name || '',
        mapName: map?.name ? cleanCs2MapName(map.name) : '',
        mode: map?.mode || '',
        phase: 'menu',
        round: 0,
        scoreCt: 0,
        scoreT: 0,
        health: 0,
        armor: 0,
        helmet: false,
        team: this.localPlayerCache.team || player?.team || '',
        kills: 0,
        deaths: 0,
        assists: 0,
        mvps: 0,
        roundKills: 0,
        bombState: null,
        isSpectating: false,
        timestamp: Date.now(),
      };
    } else {
      // If allplayers provides local user data directly, update cache
      if (allplayers && localSteamId && allplayers[localSteamId]) {
        const localData = allplayers[localSteamId];
        if (localData.name) this.localPlayerCache.name = localData.name;
        if (localData.team && localData.team !== 'spectator') this.localPlayerCache.team = localData.team;
        if (localData.match_stats) {
          this.localPlayerCache.kills = localData.match_stats.kills ?? this.localPlayerCache.kills;
          this.localPlayerCache.deaths = localData.match_stats.deaths ?? this.localPlayerCache.deaths;
          this.localPlayerCache.assists = localData.match_stats.assists ?? this.localPlayerCache.assists;
          this.localPlayerCache.mvps = localData.match_stats.mvps ?? this.localPlayerCache.mvps;
        }
      } else if (!isSpectating) {
        // Playing actively as oneself: record own stats
        if (observedSteamId) this.localPlayerCache.steamid = observedSteamId;
        if (player?.name) this.localPlayerCache.name = player.name;
        if (player?.team && player.team !== 'spectator') this.localPlayerCache.team = player.team;
        if (player?.match_stats) {
          this.localPlayerCache.kills = player.match_stats.kills ?? 0;
          this.localPlayerCache.deaths = player.match_stats.deaths ?? 0;
          this.localPlayerCache.assists = player.match_stats.assists ?? 0;
          this.localPlayerCache.mvps = player.match_stats.mvps ?? 0;
        }
      }

      const rawMapName = map.name || '';
      const mapName = cleanCs2MapName(rawMapName);
      const scoreCt = map.team_ct?.score ?? 0;
      const scoreT = map.team_t?.score ?? 0;
      const currentRound = map.round ?? 0;
      const phase = map.phase || 'live';
      const mode = map.mode || '';

      // NEVER show health & armor of the player being watched!
      const health = isSpectating ? 0 : (player?.state?.health ?? 0);
      const armor = isSpectating ? 0 : (player?.state?.armor ?? 0);
      const helmet = isSpectating ? false : Boolean(player?.state?.helmet);

      // Keep only local user stats, never the spectated target's stats
      const team = isSpectating ? (this.localPlayerCache.team || '') : (player?.team || '');
      const kills = isSpectating ? this.localPlayerCache.kills : (player?.match_stats?.kills ?? 0);
      const deaths = isSpectating ? this.localPlayerCache.deaths : (player?.match_stats?.deaths ?? 0);
      const assists = isSpectating ? this.localPlayerCache.assists : (player?.match_stats?.assists ?? 0);
      const mvps = isSpectating ? this.localPlayerCache.mvps : (player?.match_stats?.mvps ?? 0);
      const roundKills = isSpectating ? 0 : (player?.state?.round_kills ?? 0);
      const playerName = this.localPlayerCache.name || player?.name || undefined;

      const bombState = round?.bomb || null;

      newState = {
        activity: 'playing',
        isInGame: true,
        playerName,
        isSpectating,
        rawMapName,
        mapName,
        mode,
        phase,
        round: currentRound,
        scoreCt,
        scoreT,
        health,
        armor,
        helmet,
        team,
        kills,
        deaths,
        assists,
        mvps,
        roundKills,
        bombState,
        timestamp: Date.now(),
      };
    }

    this.currentState = newState;
    this.emit('update', newState);

    // Refresh inactivity expiry
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
    }
    this.expiryTimer = setTimeout(() => {
      if (this.currentState !== null) {
        this.currentState = null;
        this.emit('update', null);
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }

  /**
   * Automatically attempts to detect the CS2 game directory and write gamestate_integration_otix.cfg.
   */
  public setupCs2GsiConfig(): { success: boolean; path?: string; message?: string } {
    try {
      const candidates: string[] = [];

      // Check standard Windows drives
      const standardDrives = ['C:', 'D:', 'E:', 'F:', 'G:'];
      for (const drive of standardDrives) {
        const roots = [
          path.join(drive, 'Program Files (x86)', 'Steam'),
          path.join(drive, 'Program Files', 'Steam'),
          path.join(drive, 'SteamLibrary'),
        ];
        for (const root of roots) {
          candidates.push(
            path.join(root, 'steamapps', 'common', 'Counter-Strike Global Offensive', 'game', 'csgo', 'cfg'),
            path.join(root, 'steamapps', 'common', 'Counter-Strike Global Offensive', 'csgo', 'cfg')
          );
        }
      }

      // Check Steam's libraryfolders.vdf if Steam install root exists
      const steamRoots = [
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
      ];
      for (const root of steamRoots) {
        const vdfPath = path.join(root, 'steamapps', 'libraryfolders.vdf');
        if (fs.existsSync(vdfPath)) {
          try {
            const content = fs.readFileSync(vdfPath, 'utf-8');
            const matches = content.match(/"path"\s+"([^"]+)"/g);
            if (matches) {
              for (const m of matches) {
                const sub = m.replace(/"path"\s+"/, '').replace(/"$/, '').replace(/\\\\/g, '\\');
                candidates.push(
                  path.join(sub, 'steamapps', 'common', 'Counter-Strike Global Offensive', 'game', 'csgo', 'cfg'),
                  path.join(sub, 'steamapps', 'common', 'Counter-Strike Global Offensive', 'csgo', 'cfg')
                );
              }
            }
          } catch {
            // Ignore VDF parse failures
          }
        }
      }

      const cfgContent = `"Otix CS2 Integration"
{
    "uri" "http://127.0.0.1:${this.port}${CS2_GSI_PATH}"
    "timeout" "5.0"
    "buffer"  "0.1"
    "throttle" "0.2"
    "heartbeat" "15.0"
    "data"
    {
        "provider"            "1"
        "map"                 "1"
        "round"               "1"
        "player_id"           "1"
        "player_state"        "1"
        "player_weapons"      "1"
        "player_match_stats"  "1"
    }
}
`;

      const writtenPaths: string[] = [];
      const seen = new Set<string>();
      for (const cand of candidates) {
        if (!seen.has(cand) && fs.existsSync(cand)) {
          seen.add(cand);
          try {
            const targetFile = path.join(cand, 'gamestate_integration_otix.cfg');
            fs.writeFileSync(targetFile, cfgContent, 'utf-8');
            writtenPaths.push(targetFile);
          } catch {
            // Ignore single folder write error
          }
        }
      }

      if (writtenPaths.length === 0) {
        return {
          success: false,
          message: 'Counter-Strike installation directory could not be located automatically.',
        };
      }

      return {
        success: true,
        path: writtenPaths[0],
        message: `CS Game State Integration configuration written successfully (${writtenPaths.length} location(s)).`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to write GSI configuration: ${err?.message || String(err)}`,
      };
    }
  }
}

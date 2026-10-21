const http = require('http');

let latestState = null;

// Clean map name helper
function cleanMapName(raw) {
  if (!raw) return 'Unknown Map';
  const lower = raw.toLowerCase().trim();
  const mapDictionary = {
    de_mirage: 'Mirage',
    de_dust2: 'Dust II',
    de_inferno: 'Inferno',
    de_nuke: 'Nuke',
    de_ancient: 'Ancient',
    de_anubis: 'Anubis',
    de_vertigo: 'Vertigo',
    de_overpass: 'Overpass',
    de_train: 'Train',
    cs_office: 'Office',
    cs_italy: 'Italy',
  };
  if (mapDictionary[lower]) return mapDictionary[lower];
  return raw.replace(/^(de_|cs_|ar_)/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

let localPlayerCache = {
  steamid: null,
  name: '',
  team: '',
  kills: 0,
  deaths: 0,
  assists: 0,
  mvps: 0,
};

function handlePayload(data) {
  if (!data || typeof data !== 'object') return;

  const provider = data.provider;
  const player = data.player;
  const round = data.round;
  const map = data.map;

  const localSteamId = provider?.steamid ? String(provider.steamid) : null;
  const observedSteamId = player?.steamid ? String(player.steamid) : null;

  // Determine if the local user is spectating another player
  const isSpectatorTeam = player?.team === 'spectator' || player?.activity === 'spectating';
  const isWatchingOther = Boolean(localSteamId && observedSteamId && localSteamId !== observedSteamId);
  const isSpectating = isSpectatorTeam || isWatchingOther;

  const activity = player?.activity || (map ? 'playing' : 'menu');
  const isInGame = Boolean(map && map.name && activity !== 'menu');

  if (!isInGame) {
    // Reset or preserve menu state
    latestState = {
      activity,
      isInGame: false,
      playerName: localPlayerCache.name || player?.name || undefined,
      rawMapName: map?.name || '',
      mapName: map?.name ? cleanMapName(map.name) : '',
      mode: map?.mode || '',
      phase: 'menu',
      round: 0,
      scoreCt: 0,
      scoreT: 0,
      health: 0,
      armor: 0,
      helmet: false,
      team: localPlayerCache.team || player?.team || '',
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
    // When playing as oneself, update the local cache
    if (!isSpectating) {
      if (observedSteamId) localPlayerCache.steamid = observedSteamId;
      if (player?.name) localPlayerCache.name = player.name;
      if (player?.team && player.team !== 'spectator') localPlayerCache.team = player.team;
      if (player?.match_stats) {
        localPlayerCache.kills = player.match_stats.kills ?? 0;
        localPlayerCache.deaths = player.match_stats.deaths ?? 0;
        localPlayerCache.assists = player.match_stats.assists ?? 0;
        localPlayerCache.mvps = player.match_stats.mvps ?? 0;
      }
      if (player?.state?.money != null) {
        localPlayerCache.money = player.state.money;
      }
    }

    const rawMapName = map.name || '';
    const mapName = cleanMapName(rawMapName);
    const scoreCt = map.team_ct?.score ?? 0;
    const scoreT = map.team_t?.score ?? 0;
    const currentRound = map.round ?? 0;
    const phase = map.phase || 'live';
    const mode = map.mode || '';

    // NEVER sync health & armor of the player being watched!
    const health = isSpectating ? 0 : (player?.state?.health ?? 0);
    const armor = isSpectating ? 0 : (player?.state?.armor ?? 0);
    const helmet = isSpectating ? false : Boolean(player?.state?.helmet);

    // Keep the local player's own stats instead of the spectated player's stats
    const team = isSpectating ? (localPlayerCache.team || '') : (player?.team || '');
    const kills = isSpectating ? localPlayerCache.kills : (player?.match_stats?.kills ?? 0);
    const deaths = isSpectating ? localPlayerCache.deaths : (player?.match_stats?.deaths ?? 0);
    const assists = isSpectating ? localPlayerCache.assists : (player?.match_stats?.assists ?? 0);
    const mvps = isSpectating ? localPlayerCache.mvps : (player?.match_stats?.mvps ?? 0);
    const roundKills = isSpectating ? 0 : (player?.state?.round_kills ?? 0);
    const playerName = localPlayerCache.name || player?.name || undefined;
    const bombState = round?.bomb || null;

    // Extract live loadout from player.weapons if available
    let loadout = undefined;
    const weaponsSource = (!isSpectating && player?.weapons)
      ? player.weapons
      : (localSteamId && allplayers?.[localSteamId]?.weapons)
        ? allplayers[localSteamId].weapons
        : (!isSpectating ? player?.weapons : null);

    if (weaponsSource && typeof weaponsSource === 'object') {
      const weaponsList = Object.values(weaponsSource).filter((w) => w && typeof w === 'object');
      if (weaponsList.length > 0) {
        let primary = undefined;
        let secondary = undefined;
        let knife = 'Knife';
        let activeWeapon = undefined;
        let activeSlot = undefined;
        let hasBomb = false;
        let hasDefuser = Boolean(player?.state?.defusekit);

        for (const w of weaponsList) {
          const name = String(w.name || '').trim();
          const type = String(w.type || '').toLowerCase().replace(/[\s_-]+/g, '');
          const state = String(w.state || '').toLowerCase();
          const isActive = state === 'active' || state === 'reloading';

          if (type === 'c4' || name === 'weapon_c4') {
            hasBomb = true;
            if (isActive) {
              activeSlot = 'c4';
              activeWeapon = 'weapon_c4';
            }
            continue;
          }

          if (
            type === 'knife' ||
            name.startsWith('weapon_knife') ||
            name === 'weapon_bayonet' ||
            name === 'weapon_knifegg'
          ) {
            knife = name;
            if (isActive) {
              activeSlot = 3;
              activeWeapon = knife;
            }
            continue;
          }

          if (
            type === 'pistol' ||
            [
              'weapon_glock',
              'weapon_usp_silencer',
              'weapon_hkp2000',
              'weapon_p250',
              'weapon_fiveseven',
              'weapon_cz75a',
              'weapon_tec9',
              'weapon_revolver',
              'weapon_deagle',
              'weapon_elite',
            ].includes(name)
          ) {
            secondary = name;
            if (isActive) {
              activeSlot = 2;
              activeWeapon = secondary;
            }
            continue;
          }

          if (
            [
              'rifle',
              'sniperrifle',
              'sniper',
              'submachinegun',
              'smg',
              'shotgun',
              'machinegun',
              'mg',
            ].includes(type) ||
            [
              'weapon_ak47',
              'weapon_m4a1',
              'weapon_m4a1_silencer',
              'weapon_famas',
              'weapon_galilar',
              'weapon_aug',
              'weapon_sg556',
              'weapon_awp',
              'weapon_ssg08',
              'weapon_g3sg1',
              'weapon_scar20',
              'weapon_mp9',
              'weapon_mac10',
              'weapon_mp7',
              'weapon_mp5sd',
              'weapon_ump45',
              'weapon_p90',
              'weapon_bizon',
              'weapon_nova',
              'weapon_xm1014',
              'weapon_mag7',
              'weapon_sawedoff',
              'weapon_m249',
              'weapon_negev',
            ].includes(name)
          ) {
            primary = name;
            if (isActive) {
              activeSlot = 1;
              activeWeapon = primary;
            }
            continue;
          }

          if (name === 'weapon_taser' && isActive) {
            activeWeapon = name;
          }
        }

        if (!activeSlot) {
          if (primary) activeSlot = 1;
          else if (secondary) activeSlot = 2;
          else activeSlot = 3;
        }

        loadout = {
          primary,
          secondary,
          knife,
          activeWeapon,
          activeSlot,
          hasDefuser,
          hasBomb,
        };
      }
    }

    latestState = {
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
      money: isSpectating ? (localPlayerCache.money ?? 0) : (player?.state?.money ?? 0),
      loadout,
      timestamp: Date.now(),
    };
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        handlePayload(data);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid JSON');
      }
    });
  } else if (req.method === 'GET') {
    const urlPath = req.url?.split('?')[0];
    if (urlPath === '/api/cs2-gsi/state' || urlPath === '/api/cs2-gsi' || urlPath === '/state' || urlPath === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(latestState));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

const DEFAULT_PORT = 31337;
const LEGACY_PORT = 5000;
const ports = [process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT];
if (!ports.includes(LEGACY_PORT)) ports.push(LEGACY_PORT);

for (const p of ports) {
  try {
    const s = http.createServer(server.listeners('request')[0]);
    s.on('error', (err) => {
      console.warn(`[CS2 GSI Daemon] Port ${p} skipped (${err.message})`);
    });
    s.listen(p, '0.0.0.0', () => {
      console.log(`[CS2 GSI Daemon] Listening on http://0.0.0.0:${p} and exposing /api/cs2-gsi/state`);
    });
  } catch (err) {
    console.warn(`[CS2 GSI Daemon] Could not bind port ${p}:`, err.message);
  }
}


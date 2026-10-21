import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { Cs2GsiManager, cleanCs2MapName, parseCs2Loadout, CS2_GSI_PATH } from '../game/cs2-gsi';

describe('CS2 GSI Manager', () => {
  describe('cleanCs2MapName', () => {
    it('cleans known competitive map names', () => {
      expect(cleanCs2MapName('de_mirage')).toBe('Mirage');
      expect(cleanCs2MapName('de_dust2')).toBe('Dust II');
      expect(cleanCs2MapName('de_inferno')).toBe('Inferno');
      expect(cleanCs2MapName('de_nuke')).toBe('Nuke');
      expect(cleanCs2MapName('de_ancient')).toBe('Ancient');
      expect(cleanCs2MapName('de_anubis')).toBe('Anubis');
      expect(cleanCs2MapName('de_vertigo')).toBe('Vertigo');
      expect(cleanCs2MapName('cs_office')).toBe('Office');
    });

    it('formats unknown map names cleanly', () => {
      expect(cleanCs2MapName('de_overpass')).toBe('Overpass');
      expect(cleanCs2MapName('')).toBe('Unknown Map');
    });
  });

  describe('handlePayload', () => {
    let manager: Cs2GsiManager;

    beforeEach(() => {
      manager = new Cs2GsiManager(39999);
    });

    afterEach(async () => {
      await manager.stop();
    });

    it('parses valid in-game state and emits update', () => {
      const updateSpy = vi.fn();
      manager.on('update', updateSpy);

      const mockPayload = {
        map: {
          name: 'de_mirage',
          mode: 'competitive',
          phase: 'live',
          round: 12,
          team_ct: { score: 7 },
          team_t: { score: 5 },
        },
        player: {
          team: 'CT',
          activity: 'playing',
          state: {
            health: 85,
            armor: 100,
            helmet: true,
            round_kills: 2,
          },
          match_stats: {
            kills: 16,
            deaths: 8,
            assists: 4,
            mvps: 3,
          },
        },
        round: {
          phase: 'live',
          bomb: 'planted',
        },
      };

      manager.handlePayload(mockPayload);

      const state = manager.getState();
      expect(state).not.toBeNull();
      expect(state?.mapName).toBe('Mirage');
      expect(state?.rawMapName).toBe('de_mirage');
      expect(state?.round).toBe(12);
      expect(state?.scoreCt).toBe(7);
      expect(state?.scoreT).toBe(5);
      expect(state?.health).toBe(85);
      expect(state?.armor).toBe(100);
      expect(state?.helmet).toBe(true);
      expect(state?.team).toBe('CT');
      expect(state?.kills).toBe(16);
      expect(state?.deaths).toBe(8);
      expect(state?.assists).toBe(4);
      expect(state?.mvps).toBe(3);
      expect(state?.bombState).toBe('planted');

      expect(updateSpy).toHaveBeenCalledWith(state);
    });

    it('emits lobby state when player is in main menu', () => {
      const updateSpy = vi.fn();
      manager.on('update', updateSpy);

      // First, active game
      manager.handlePayload({
        map: { name: 'de_dust2', round: 1 },
        player: { name: 'PlayerOne', activity: 'playing', state: { health: 100 } },
      });
      expect(manager.getState()?.isInGame).toBe(true);

      // Second, player goes to menu
      manager.handlePayload({
        player: { name: 'PlayerOne', activity: 'menu' },
      });
      expect(manager.getState()).not.toBeNull();
      expect(manager.getState()?.isInGame).toBe(false);
      expect(manager.getState()?.activity).toBe('menu');
      expect(manager.getState()?.playerName).toBe('PlayerOne');
    });

    it('parses player weapons and dynamic loadout in live state', () => {
      manager.handlePayload({
        map: { name: 'de_nuke', round: 3 },
        player: {
          name: 'ZywOo',
          team: 'CT',
          activity: 'playing',
          state: { health: 100, armor: 100, money: 4750, defusekit: true },
          weapons: {
            weapon_0: { name: 'weapon_knife_karambit', type: 'Knife', state: 'holstered' },
            weapon_1: { name: 'weapon_deagle', type: 'Pistol', state: 'holstered' },
            weapon_2: { name: 'weapon_awp', type: 'SniperRifle', state: 'active' },
          },
        },
      });

      const state = manager.getState();
      expect(state?.loadout).toBeDefined();
      expect(state?.loadout?.primary).toBe('weapon_awp');
      expect(state?.loadout?.secondary).toBe('weapon_deagle');
      expect(state?.loadout?.knife).toBe('weapon_knife_karambit');
      expect(state?.loadout?.activeSlot).toBe(1);
      expect(state?.loadout?.hasDefuser).toBe(true);
      expect(state?.loadout?.hasBomb).toBe(false);
      expect(state?.money).toBe(4750);
    });
  });

  describe('parseCs2Loadout', () => {
    it('accurately identifies M4A4 (weapon_m4a1) vs M4A1-S (weapon_m4a1_silencer)', () => {
      const m4a4Loadout = parseCs2Loadout({
        weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
        weapon_1: { name: 'weapon_usp_silencer', type: 'Pistol', state: 'holstered' },
        weapon_2: { name: 'weapon_m4a1', type: 'Rifle', state: 'active' },
      });
      expect(m4a4Loadout?.primary).toBe('weapon_m4a1');
      expect(m4a4Loadout?.secondary).toBe('weapon_usp_silencer');
      expect(m4a4Loadout?.activeSlot).toBe(1);

      const m4a1sLoadout = parseCs2Loadout({
        weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
        weapon_1: { name: 'weapon_m4a1_silencer', type: 'Rifle', state: 'active' },
      });
      expect(m4a1sLoadout?.primary).toBe('weapon_m4a1_silencer');
    });

    it('correctly detects SMGs (with space in type) and machine guns as primary', () => {
      const mp9Loadout = parseCs2Loadout({
        weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
        weapon_1: { name: 'weapon_mp9', type: 'Submachine Gun', state: 'active' },
      });
      expect(mp9Loadout?.primary).toBe('weapon_mp9');

      const negevLoadout = parseCs2Loadout({
        weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
        weapon_1: { name: 'weapon_negev', type: 'Machine Gun', state: 'active' },
      });
      expect(negevLoadout?.primary).toBe('weapon_negev');
    });

    it('accurately detects active slot when switching between primary, secondary, and knife', () => {
      const pistolActive = parseCs2Loadout({
        weapon_0: { name: 'weapon_knife_butterfly', type: 'Knife', state: 'holstered' },
        weapon_1: { name: 'weapon_glock', type: 'Pistol', state: 'active' },
        weapon_2: { name: 'weapon_ak47', type: 'Rifle', state: 'holstered' },
      });
      expect(pistolActive?.activeSlot).toBe(2);
      expect(pistolActive?.knife).toBe('weapon_knife_butterfly');

      const knifeActive = parseCs2Loadout({
        weapon_0: { name: 'weapon_bayonet', type: 'Knife', state: 'active' },
        weapon_1: { name: 'weapon_glock', type: 'Pistol', state: 'holstered' },
      });
      expect(knifeActive?.activeSlot).toBe(3);
      expect(knifeActive?.knife).toBe('weapon_bayonet');
    });

    it('detects C4 bomb and defuse kit', () => {
      const tLoadout = parseCs2Loadout(
        {
          weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
          weapon_1: { name: 'weapon_glock', type: 'Pistol', state: 'holstered' },
          weapon_2: { name: 'weapon_c4', type: 'C4', state: 'active' },
        },
        { defusekit: false }
      );
      expect(tLoadout?.hasBomb).toBe(true);
      expect(tLoadout?.activeSlot).toBe('c4');
      expect(tLoadout?.hasDefuser).toBe(false);

      const ctLoadout = parseCs2Loadout(
        {
          weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'active' },
        },
        { defusekit: true }
      );
      expect(ctLoadout?.hasBomb).toBe(false);
      expect(ctLoadout?.hasDefuser).toBe(true);
    });
  });

  describe('HTTP Server integration', () => {
    let manager: Cs2GsiManager;
    const testPort = 39876;

    beforeAll(async () => {
      manager = new Cs2GsiManager(testPort);
      await manager.start();
    });

    afterAll(async () => {
      await manager.stop();
    });

    it('accepts POST requests with valid JSON payload on CS2_GSI_PATH', async () => {
      const postData = JSON.stringify({
        map: {
          name: 'de_inferno',
          round: 5,
          team_ct: { score: 3 },
          team_t: { score: 2 },
        },
        player: {
          team: 'T',
          state: { health: 100, armor: 50 },
          match_stats: { kills: 4, deaths: 2 },
        },
      });

      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: testPort,
            path: CS2_GSI_PATH,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
            },
          },
          (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve({ statusCode: res.statusCode || 0, body }));
          }
        );
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('OK');
      expect(manager.getState()?.mapName).toBe('Inferno');
      expect(manager.getState()?.scoreCt).toBe(3);
    });

    it('returns 400 on malformed JSON payload', async () => {
      const badData = 'not-valid-json';

      const response = await new Promise<{ statusCode: number }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: testPort,
            path: CS2_GSI_PATH,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(badData),
            },
          },
          (res) => {
            res.resume();
            res.on('end', () => {
              resolve({ statusCode: res.statusCode || 0 });
            });
          }
        );
        req.on('error', reject);
        req.write(badData);
        req.end();
      });

      expect(response.statusCode).toBe(400);
    });

    it('handles OPTIONS preflight requests with CORS headers', async () => {
      const response = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: testPort,
            path: CS2_GSI_PATH + '/state',
            method: 'OPTIONS',
          },
          (res) => {
            res.resume();
            res.on('end', () => {
              resolve({ statusCode: res.statusCode || 0, headers: res.headers });
            });
          }
        );
        req.on('error', reject);
        req.end();
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });

    it('returns live state JSON on GET /api/cs2-gsi/state with CORS headers', async () => {
      // First, set up active state
      manager.handlePayload({
        map: { name: 'de_mirage', mode: 'competitive', round: 5, team_ct: { score: 3 }, team_t: { score: 2 } },
        player: { name: 'DK', team: 'CT', state: { health: 100, armor: 100 } },
      });

      const response = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: testPort,
            path: CS2_GSI_PATH + '/state',
            method: 'GET',
          },
          (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode || 0,
                headers: res.headers,
                body: JSON.parse(body),
              });
            });
          }
        );
        req.on('error', reject);
        req.end();
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.body?.mapName).toBe('Mirage');
      expect(response.body?.scoreCt).toBe(3);
      expect(response.body?.scoreT).toBe(2);
    });
  });
});


import { describe, it, expect, vi } from 'vitest';
import {
  encodeVarInt,
  readVarInt,
  parseA2SInfoResponse,
  probeGameServer,
} from '../game/server-query';

describe('game-server-query', () => {
  describe('Minecraft VarInt encoding and decoding', () => {
    it('encodes and decodes 0', () => {
      const encoded = encodeVarInt(0);
      expect(encoded).toEqual(Buffer.from([0x00]));
      const { value, bytesRead } = readVarInt(encoded, 0);
      expect(value).toBe(0);
      expect(bytesRead).toBe(1);
    });

    it('encodes and decodes 1', () => {
      const encoded = encodeVarInt(1);
      expect(encoded).toEqual(Buffer.from([0x01]));
      const { value, bytesRead } = readVarInt(encoded, 0);
      expect(value).toBe(1);
      expect(bytesRead).toBe(1);
    });

    it('encodes and decodes multi-byte numbers (e.g. 25565, 765)', () => {
      const testNumbers = [127, 128, 255, 765, 25565, 2097151];
      for (const num of testNumbers) {
        const encoded = encodeVarInt(num);
        const { value, bytesRead } = readVarInt(encoded, 0);
        expect(value).toBe(num);
        expect(bytesRead).toBe(encoded.length);
      }
    });

    it('throws error when buffer is truncated', () => {
      const encoded = encodeVarInt(300); // 2 bytes
      expect(() => readVarInt(encoded.subarray(0, 1), 0)).toThrow('Buffer too small');
    });
  });

  describe('Steam A2S Info Parsing', () => {
    it('parses valid A2S_INFO payload', () => {
      // Header: 0xFF, 0xFF, 0xFF, 0xFF, 0x49 ('I'), protocol: 0x11
      const header = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49, 0x11]);
      const name = Buffer.from('My Palworld Server\0', 'utf8');
      const map = Buffer.from('Palworld_Map\0', 'utf8');
      const folder = Buffer.from('Pal\0', 'utf8');
      const game = Buffer.from('Palworld\0', 'utf8');
      const appId = Buffer.from([0x12, 0x34]); // 2 bytes
      const players = Buffer.from([4]); // 1 byte
      const maxPlayers = Buffer.from([32]); // 1 byte
      const tail = Buffer.from([0, 0, 0, 0, 0]); // bots, server type, env, vis, vac
      const version = Buffer.from('v0.2.1\0', 'utf8');

      const fullPacket = Buffer.concat([
        header,
        name,
        map,
        folder,
        game,
        appId,
        players,
        maxPlayers,
        tail,
        version,
      ]);

      const parsed = parseA2SInfoResponse(fullPacket);
      expect(parsed.name).toBe('My Palworld Server');
      expect(parsed.map).toBe('Palworld_Map');
      expect(parsed.currentPlayers).toBe(4);
      expect(parsed.maxPlayers).toBe(32);
      expect(parsed.version).toBe('v0.2.1');
    });
  });

  describe('probeGameServer', () => {
    it('returns offline on connection refused / unresolvable address', async () => {
      const result = await probeGameServer({
        host: '127.0.0.1',
        port: 65432, // Non-existent local port
        serverType: 'generic',
        timeout: 500,
      });

      expect(result.status).toBe('offline');
      expect(result.pingMs).toBeNull();
      expect(result.error).toBeDefined();
    });
  });
});

import net from 'net';
import dgram from 'dgram';

export interface GameServerProbeParams {
  host: string;
  port: number;
  queryPort?: number | null;
  serverType?: string;
  timeout?: number;
}

export interface GameServerQueryResult {
  status: 'online' | 'offline';
  pingMs: number | null;
  currentPlayers?: number;
  maxPlayers?: number;
  playerList?: string[];
  currentMap?: string;
  version?: string;
  name?: string;
  suggestedQueryPort?: number;
  queryWarning?: string;
  error?: string;
}

// ── Minecraft Protocol Helpers ──────────────────────────────────────────

export function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let temp = value;
  while (true) {
    if ((temp & ~0x7f) === 0) {
      bytes.push(temp);
      break;
    }
    bytes.push((temp & 0x7f) | 0x80);
    temp >>>= 7;
  }
  return Buffer.from(bytes);
}

export function readVarInt(buffer: Buffer, offset: number): { value: number; bytesRead: number } {
  let numRead = 0;
  let result = 0;
  let currentOffset = offset;
  while (true) {
    if (currentOffset >= buffer.length) {
      throw new Error('Buffer too small while reading VarInt');
    }
    const byte = buffer[currentOffset++];
    result |= (byte & 0x7f) << (7 * numRead);
    numRead++;
    if (numRead > 5) {
      throw new Error('VarInt too large');
    }
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return { value: result, bytesRead: numRead };
}

export function queryMinecraft(host: string, port: number, timeout = 4000): Promise<GameServerQueryResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let isSettled = false;
    let timer: NodeJS.Timeout | null = null;

    const socket = new net.Socket();

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      socket.removeAllListeners();
      socket.destroy();
    };

    const finish = (result: GameServerQueryResult) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({
        status: 'offline',
        pingMs: null,
        error: `Connection timed out after ${timeout}ms`,
      });
    }, timeout);

    socket.on('error', (err) => {
      finish({
        status: 'offline',
        pingMs: null,
        error: err.message,
      });
    });

    socket.connect(port, host, () => {
      const pingMs = Math.max(1, Date.now() - startTime);

      try {
        // 1. Send Handshake packet (ID 0x00)
        // Protocol version 765 (1.20.4), host, port, next state 1 (status)
        const hostBuffer = Buffer.from(host, 'utf8');
        const portBuffer = Buffer.alloc(2);
        portBuffer.writeUInt16BE(port, 0);

        const handshakeData = Buffer.concat([
          encodeVarInt(0x00),
          encodeVarInt(765),
          encodeVarInt(hostBuffer.length),
          hostBuffer,
          portBuffer,
          encodeVarInt(1),
        ]);

        const handshakePacket = Buffer.concat([
          encodeVarInt(handshakeData.length),
          handshakeData,
        ]);
        socket.write(handshakePacket);

        // 2. Send Status Request packet (Length 1, ID 0x00)
        const statusRequest = Buffer.from([0x01, 0x00]);
        socket.write(statusRequest);
      } catch (err: unknown) {
        finish({
          status: 'offline',
          pingMs: null,
          error: (err as Error).message,
        });
      }
    });

    let incoming = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      incoming = Buffer.concat([incoming, chunk]);

      try {
        let offset = 0;
        const { value: packetLength, bytesRead: lenBytes } = readVarInt(incoming, offset);
        offset += lenBytes;

        if (incoming.length < offset + packetLength) {
          // Incomplete packet; wait for more data
          return;
        }

        const { value: packetId, bytesRead: idBytes } = readVarInt(incoming, offset);
        offset += idBytes;

        if (packetId !== 0x00) {
          finish({
            status: 'offline',
            pingMs: null,
            error: `Unexpected packet ID: ${packetId}`,
          });
          return;
        }

        const { value: jsonLen, bytesRead: jsonLenBytes } = readVarInt(incoming, offset);
        offset += jsonLenBytes;

        if (incoming.length < offset + jsonLen) {
          return;
        }

        const jsonStr = incoming.toString('utf8', offset, offset + jsonLen);
        const data = JSON.parse(jsonStr) as {
          players?: { online?: number; max?: number; sample?: Array<{ name?: string }> };
          version?: { name?: string };
          description?: string | { text?: string };
        };

        const online = data.players?.online ?? 0;
        const max = data.players?.max ?? 0;
        const sample = data.players?.sample ?? [];
        const playerList = sample
          .map((p) => p.name)
          .filter((n): n is string => Boolean(n));

        const versionStr = data.version?.name ?? '';
        let motd = '';
        if (typeof data.description === 'string') {
          motd = data.description;
        } else if (data.description && typeof data.description.text === 'string') {
          motd = data.description.text;
        }

        const pingMs = Math.max(1, Date.now() - startTime);

        finish({
          status: 'online',
          pingMs,
          currentPlayers: online,
          maxPlayers: max,
          playerList,
          version: versionStr,
          currentMap: motd.trim().slice(0, 100),
        });
      } catch {
        // If parsing fails mid-stream, wait for further chunks unless timeout fires
      }
    });
  });
}

// ── Steam / Source A2S Protocol Helpers ─────────────────────────────────

const A2S_HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const A2S_QUERY = Buffer.concat([A2S_HEADER, Buffer.from('TSource Engine Query\0', 'ascii')]);

export function parseA2SInfoResponse(buffer: Buffer): {
  name: string;
  map: string;
  currentPlayers: number;
  maxPlayers: number;
  version: string;
} {
  let idx = 6; // Skip header (4 bytes), type byte (1 byte at idx 4), protocol byte (1 byte at idx 5)

  const readCString = (): string => {
    const end = buffer.indexOf(0x00, idx);
    if (end === -1) {
      const str = buffer.toString('utf8', idx);
      idx = buffer.length;
      return str;
    }
    const str = buffer.toString('utf8', idx, end);
    idx = end + 1;
    return str;
  };

  const name = readCString();
  const map = readCString();
  readCString(); // folder (skip)
  readCString(); // game (skip)

  let currentPlayers = 0;
  let maxPlayers = 0;

  if (idx + 4 <= buffer.length) {
    idx += 2; // skip app_id short
    currentPlayers = buffer[idx++];
    maxPlayers = buffer[idx++];
  }

  // Skip bots (1), server type (1), env (1), visibility (1), vac (1) = 5 bytes
  idx += 5;
  const version = idx < buffer.length ? readCString() : '';

  return {
    name,
    map,
    currentPlayers,
    maxPlayers,
    version,
  };
}

export function querySteamSourceA2S(
  host: string,
  queryPort: number,
  timeout = 4000,
): Promise<GameServerQueryResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let isSettled = false;
    let timer: NodeJS.Timeout | null = null;

    let socket: dgram.Socket | null = null;
    try {
      socket = dgram.createSocket('udp4');
    } catch (err: unknown) {
      resolve({
        status: 'offline',
        pingMs: null,
        error: (err as Error).message,
      });
      return;
    }

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (socket) {
        try {
          socket.removeAllListeners();
          socket.close();
        } catch {}
        socket = null;
      }
    };

    const finish = (result: GameServerQueryResult) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({
        status: 'offline',
        pingMs: null,
        error: `A2S query timed out after ${timeout}ms on UDP port ${queryPort}`,
      });
    }, timeout);

    socket.on('error', (err) => {
      finish({
        status: 'offline',
        pingMs: null,
        error: err.message,
      });
    });

    socket.on('message', (msg) => {
      if (msg.length < 5) return;
      if (!msg.subarray(0, 4).equals(A2S_HEADER)) return;

      const resType = msg[4];

      // Challenge response 0x41 ('A') -> re-send query with challenge appended
      if (resType === 0x41) {
        const challenge = msg.subarray(5, 9);
        const challengePayload = Buffer.concat([A2S_QUERY, challenge]);
        try {
          socket?.send(challengePayload, queryPort, host);
        } catch (err: unknown) {
          finish({
            status: 'offline',
            pingMs: null,
            error: (err as Error).message,
          });
        }
        return;
      }

      // A2S_INFO response 0x49 ('I')
      if (resType === 0x49) {
        const pingMs = Math.max(1, Date.now() - startTime);
        try {
          const parsed = parseA2SInfoResponse(msg);
          finish({
            status: 'online',
            pingMs,
            name: parsed.name,
            currentMap: parsed.map,
            currentPlayers: parsed.currentPlayers,
            maxPlayers: parsed.maxPlayers,
            version: parsed.version,
            playerList: [],
          });
        } catch (err: unknown) {
          finish({
            status: 'online',
            pingMs,
            error: `Failed to parse A2S payload: ${(err as Error).message}`,
          });
        }
      }
    });

    try {
      socket.send(A2S_QUERY, queryPort, host, (err) => {
        if (err) {
          finish({
            status: 'offline',
            pingMs: null,
            error: err.message,
          });
        }
      });
    } catch (err: unknown) {
      finish({
        status: 'offline',
        pingMs: null,
        error: (err as Error).message,
      });
    }
  });
}

// ── Generic TCP Probe ───────────────────────────────────────────────────

export function queryGenericTcp(
  host: string,
  port: number,
  timeout = 4000,
): Promise<GameServerQueryResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let isSettled = false;
    let timer: NodeJS.Timeout | null = null;

    const socket = new net.Socket();

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      socket.removeAllListeners();
      socket.destroy();
    };

    const finish = (result: GameServerQueryResult) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({
        status: 'offline',
        pingMs: null,
        error: `Connection timed out after ${timeout}ms`,
      });
    }, timeout);

    socket.on('error', (err) => {
      finish({
        status: 'offline',
        pingMs: null,
        error: err.message,
      });
    });

    socket.connect(port, host, () => {
      const pingMs = Math.max(1, Date.now() - startTime);
      finish({
        status: 'online',
        pingMs,
      });
    });
  });
}

// ── Main Probing Function ───────────────────────────────────────────────

export async function probeGameServer(params: GameServerProbeParams): Promise<GameServerQueryResult> {
  const { host, port, queryPort, serverType = 'generic', timeout = 4000 } = params;
  const effectiveQueryPort = queryPort || port;

  if (serverType === 'minecraft') {
    const mcResult = await queryMinecraft(host, port, timeout);
    if (mcResult.status === 'online') {
      return mcResult;
    }
    // TCP fallback on Minecraft port
    const tcpFallback = await queryGenericTcp(host, port, Math.min(2000, timeout));
    if (tcpFallback.status === 'online') {
      return {
        ...tcpFallback,
        queryWarning: `Port ${port} is open, but Minecraft status query failed (${mcResult.error || 'timed out'}).`,
      };
    }
    return mcResult;
  }

  if (serverType === 'steam_source') {
    const a2sResult = await querySteamSourceA2S(host, effectiveQueryPort, timeout);
    if (a2sResult.status === 'online') {
      return a2sResult;
    }

    // Auto-probe port + 1 if queryPort was not specified
    if (!queryPort && port < 65535) {
      const altResult = await querySteamSourceA2S(host, port + 1, Math.min(2500, timeout));
      if (altResult.status === 'online') {
        return {
          ...altResult,
          suggestedQueryPort: port + 1,
          queryWarning: `Detected Valve A2S response on query port ${port + 1} (game port + 1).`,
        };
      }
    }

    // TCP fallback
    const tcpFallback = await queryGenericTcp(host, port, Math.min(2000, timeout));
    if (tcpFallback.status === 'online') {
      return {
        ...tcpFallback,
        queryWarning: `Reachable over TCP on port ${port}, but Steam A2S query on UDP port ${effectiveQueryPort} failed.`,
      };
    }

    return a2sResult;
  }

  return queryGenericTcp(host, port, timeout);
}

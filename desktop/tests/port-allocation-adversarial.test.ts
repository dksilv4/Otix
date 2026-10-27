import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as netSocket from 'net';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';

const mockSpawn = vi.fn();

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (...args: any[]) => mockSpawn(...args),
  };
});

import { isPortAvailable, findAvailablePort, NodeDaemonManager } from '../node-daemon';

describe('Adversarial Stress Test: Port Allocation & Port Hunting', () => {
  const tempUserData = path.join(__dirname, '..', '..', 'tmp-port-adversarial-test');
  const activeSockets: netSocket.Server[] = [];

  const bindBusySocket = async (port: number, host = '127.0.0.1'): Promise<netSocket.Server> => {
    return new Promise((resolve, reject) => {
      const server = netSocket.createServer();
      server.listen(port, host, () => {
        activeSockets.push(server);
        resolve(server);
      });
      server.on('error', (err) => reject(err));
    });
  };

  const createMockProcess = (pid = 43210) => {
    const proc = new EventEmitter() as any;
    proc.pid = pid;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn(() => true);
    return proc;
  };

  beforeEach(() => {
    fs.mkdirSync(tempUserData, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    while (activeSockets.length > 0) {
      const s = activeSockets.pop();
      if (s) {
        await new Promise<void>((res) => s.close(() => res()));
      }
    }
    try {
      fs.rmSync(tempUserData, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Sequential Port Collisions (Hunting Multi-Occupied Ranges)', () => {
    it('gracefully hunts past 5 sequential occupied ports and allocates port+5', async () => {
      const basePort = 18200;
      // Block ports 18200, 18201, 18202, 18203, 18204
      for (let p = basePort; p < basePort + 5; p++) {
        await bindBusySocket(p);
      }

      // Verify each individual port reports false
      for (let p = basePort; p < basePort + 5; p++) {
        const available = await isPortAvailable(p);
        expect(available).toBe(false);
      }

      // findAvailablePort must skip all 5 and find 18205
      const allocatedPort = await findAvailablePort(basePort, 50);
      expect(allocatedPort).toBe(basePort + 5);
    });

    it('NodeDaemonManager.start() hunts past sequential collisions and configures spawned process correctly', async () => {
      const basePort = 18210;
      // Block ports 18210, 18211, 18212, 18213
      for (let p = basePort; p < basePort + 4; p++) {
        await bindBusySocket(p);
      }

      const expectedPort = basePort + 4; // 18214

      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');
      vi.spyOn(daemon, 'probeNode')
        .mockResolvedValueOnce(false) // initial probe before spawn
        .mockResolvedValueOnce(true);  // probe after spawn succeeds

      const mockProc = createMockProcess(55555);
      let capturedArgs: string[] = [];
      let capturedEnv: Record<string, string> = {};

      mockSpawn.mockImplementation((bin: string, args: string[], opts: any) => {
        capturedArgs = args;
        capturedEnv = opts?.env || {};
        process.nextTick(() => {
          mockProc.stdout.emit('data', Buffer.from(`Listening on http://127.0.0.1:${expectedPort}\n`));
        });
        return mockProc;
      });

      const status = await daemon.start({ port: basePort });

      expect(status.state).toBe('running');
      expect(status.port).toBe(expectedPort);
      expect(status.url).toBe(`http://127.0.0.1:${expectedPort}`);

      // Verify command line arguments given to spawned process
      const portArgIdx = capturedArgs.indexOf('-port');
      expect(portArgIdx).toBeGreaterThan(-1);
      expect(capturedArgs[portArgIdx + 1]).toBe(String(expectedPort));

      // Verify environment variables passed to spawned process
      expect(capturedEnv.PORT).toBe(String(expectedPort));

      // Verify config file written to disk
      const configPath = path.join(tempUserData, 'node-config.yaml');
      expect(fs.existsSync(configPath)).toBe(true);
      const configContent = fs.readFileSync(configPath, 'utf-8');
      expect(configContent).toContain(`port: ${expectedPort}`);
    });
  });

  describe('Port Range Exhaustion Failure Mode', () => {
    it('findAvailablePort throws descriptive error when entire candidate range is exhausted', async () => {
      const basePort = 18230;
      const count = 4;
      for (let p = basePort; p < basePort + count; p++) {
        await bindBusySocket(p);
      }

      await expect(findAvailablePort(basePort, count)).rejects.toThrow(
        `Could not find an available port in range ${basePort}-${basePort + count - 1}`,
      );
    });

    it('NodeDaemonManager.start() catches port exhaustion, transitions cleanly to error state, and does not throw unhandled rejection', async () => {
      const basePort = 18240;
      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'probeNode').mockResolvedValue(false);

      const mockWebContents = {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn(),
      } as any;
      daemon.setWebContents(mockWebContents);

      // Block candidate port and all 50 sequential hunt ports (18240..18290)
      for (let p = basePort; p <= basePort + 50; p++) {
        await bindBusySocket(p);
      }

      let thrownError: any = null;
      let status: any = null;
      try {
        status = await daemon.start({ port: basePort });
      } catch (err) {
        thrownError = err;
      }

      // Assert that start() does NOT throw an unhandled rejection
      expect(thrownError).toBeNull();

      // Assert that status returned transitions cleanly to state: 'error' with descriptive message
      expect(status).not.toBeNull();
      expect(status.state).toBe('error');
      expect(status.running).toBe(false);
      expect(status.starting).toBe(false);
      expect(status.error).toContain('Could not find an available port in range 18241-18290');

      // Assert that daemon internal status reflects error
      const currentStatus = daemon.getStatus();
      expect(currentStatus.state).toBe('error');
      expect(currentStatus.error).toContain('Could not find an available port in range 18241-18290');

      // Assert that webContents was notified of error state
      expect(mockWebContents.send).toHaveBeenCalledWith(
        'node-daemon:status-changed',
        expect.objectContaining({
          state: 'error',
          error: expect.stringContaining('Could not find an available port in range 18241-18290'),
        }),
      );
    });
  });

  describe('Port Release and Immediate Re-bindability', () => {
    it('isPortAvailable releases test socket immediately without lingering lock', async () => {
      const testPort = 18250;
      // Probe availability
      const available1 = await isPortAvailable(testPort);
      expect(available1).toBe(true);

      // Immediately bind a real server on the same port
      const server = await bindBusySocket(testPort);
      expect(server.listening).toBe(true);

      // Now probe availability should report false
      const available2 = await isPortAvailable(testPort);
      expect(available2).toBe(false);
    });
  });

  describe('Companion Node vs Foreign Collision Differentiation', () => {
    it('does NOT hunt for a new port when target port is already running an authentic Otix Node', async () => {
      const basePort = 18260;
      const daemon = new NodeDaemonManager(tempUserData);

      // Authentic Otix node returns true from probeNode
      vi.spyOn(daemon, 'probeNode').mockResolvedValue(true);

      const status = await daemon.start({ port: basePort });

      // Must reuse basePort
      expect(status.port).toBe(basePort);
      expect(status.state).toBe('running');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('hunts for a new port when target port is occupied by an un-probed foreign socket', async () => {
      const basePort = 18270;
      // Foreign socket on basePort
      await bindBusySocket(basePort);

      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');
      vi.spyOn(daemon, 'probeNode')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const mockProc = createMockProcess(66666);
      mockSpawn.mockImplementation(() => {
        process.nextTick(() => {
          mockProc.stdout.emit('data', Buffer.from(`Listening on http://127.0.0.1:${basePort + 1}\n`));
        });
        return mockProc;
      });

      const status = await daemon.start({ port: basePort });

      expect(status.port).toBe(basePort + 1);
      expect(status.state).toBe('running');
      expect(mockSpawn).toHaveBeenCalled();
    });
  });
});

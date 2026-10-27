import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import { EventEmitter } from 'events';
import { net as electronNet } from 'electron';

const mockSpawn = vi.fn();

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (...args: any[]) => mockSpawn(...args),
  };
});

import { NodeDaemonManager, isPortAvailable, findAvailablePort } from '../node-daemon';

describe('NodeDaemonManager', () => {
  const tempUserData = path.join(__dirname, '..', '..', 'tmp-node-daemon-test');

  beforeEach(() => {
    fs.mkdirSync(tempUserData, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempUserData, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('initializes with default stopped status', () => {
    const daemon = new NodeDaemonManager(tempUserData);
    const status = daemon.getStatus();

    expect(status.running).toBe(false);
    expect(status.embedded).toBe(false);
    expect(status.port).toBe(8090);
    expect(status.url).toBe('http://127.0.0.1:8090');
    expect(status.pid).toBeNull();
  });

  it('returns binary path when binary exists in candidate paths', () => {
    const fakeBinDir = path.join(tempUserData, 'bin');
    fs.mkdirSync(fakeBinDir, { recursive: true });
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'otix-node.exe' : 'otix-node';
    const fakeBinPath = path.join(fakeBinDir, binaryName);
    fs.writeFileSync(fakeBinPath, '#!/bin/sh\nexit 0', { mode: 0o755 });

    const daemon = new NodeDaemonManager(tempUserData, tempUserData);
    const resolved = daemon.resolveBinaryPath();

    expect(resolved).toBeTruthy();
    expect(fs.existsSync(resolved!)).toBe(true);
  });

  it('returns null and reports error on start if binary cannot be found', async () => {
    const emptyUserData = path.join(tempUserData, 'empty-env');
    fs.mkdirSync(emptyUserData, { recursive: true });

    const daemon = new NodeDaemonManager(emptyUserData, path.join(emptyUserData, 'nonexistent'));
    // Force candidate check to fail by using a manager pointing only to nonexistent paths
    vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue(null);

    const status = await daemon.start({ port: 9999 });

    expect(status.running).toBe(false);
    expect(status.error).toContain('not found');
  });

  it('notifies webContents when status changes', async () => {
    const daemon = new NodeDaemonManager(tempUserData);
    const mockWebContents = {
      isDestroyed: vi.fn().mockReturnValue(false),
      send: vi.fn(),
    } as any;

    daemon.setWebContents(mockWebContents);

    // Mock resolveBinaryPath returning null to trigger notification of failure
    vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue(null);
    await daemon.start({ port: 9998 });

    expect(mockWebContents.send).toHaveBeenCalledWith(
      'node-daemon:status-changed',
      expect.objectContaining({ port: 9998 }),
    );
  });

  it('handles probeNode timeout gracefully when node is not running', async () => {
    const daemon = new NodeDaemonManager(tempUserData);
    // Port 59199 is virtually guaranteed to have nothing running
    const isLive = await daemon.probeNode(59199, 100);
    expect(isLive).toBe(false);
  });

  it('disposes cleanly on shutdown', async () => {
    const daemon = new NodeDaemonManager(tempUserData);
    const stopSpy = vi.spyOn(daemon, 'stop').mockResolvedValue(daemon.getStatus());

    await daemon.dispose();
    expect(stopSpy).toHaveBeenCalled();
  });

  it('generates initial config with disable_tray: true', async () => {
    const daemon = new NodeDaemonManager(tempUserData);
    const configPath = path.join(tempUserData, 'test-config.yaml');
    (daemon as any).ensureConfigFile(configPath, 8090);

    expect(fs.existsSync(configPath)).toBe(true);
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('disable_tray: true');
    expect(content).toContain('registry_url:');
  });

  it('updates existing config with disable_tray: true if missing', async () => {
    const daemon = new NodeDaemonManager(tempUserData);
    const configPath = path.join(tempUserData, 'existing-config.yaml');
    const existingContent = `server:
  name: "Existing Node"
  port: 8090
  host: "127.0.0.1"
  registry_url: "http://127.0.0.1:8000/api"
`;
    fs.writeFileSync(configPath, existingContent, 'utf-8');

    (daemon as any).ensureConfigFile(configPath, 8090);

    const updated = fs.readFileSync(configPath, 'utf-8');
    expect(updated).toContain('disable_tray: true');
  });

  it('spawns binary with -headless, -no-tray, windowsHide: true, and OTIX_NO_TRAY: 1', async () => {
    const daemon = new NodeDaemonManager(tempUserData);
    vi.spyOn(daemon, 'probeNode').mockResolvedValue(false);
    vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('C:\\mock\\otix-node.exe');

    const mockProc = new EventEmitter() as any;
    mockProc.pid = 12345;
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();

    let capturedArgs: string[] = [];
    let capturedOptions: any = null;

    mockSpawn.mockImplementation((_cmd, args, options) => {
      capturedArgs = args as string[];
      capturedOptions = options;
      return mockProc;
    });

    const startPromise = daemon.start({ port: 8095 });
    // Simulate process exiting so start doesn't hang in loop
    mockProc.emit('exit', 0, null);
    await startPromise;

    expect(mockSpawn).toHaveBeenCalled();
    expect(capturedArgs).toContain('-headless');
    expect(capturedArgs).toContain('-no-tray');
    expect(capturedOptions?.windowsHide).toBe(true);
    expect(capturedOptions?.env?.OTIX_HEADLESS).toBe('1');
    expect(capturedOptions?.env?.OTIX_NO_TRAY).toBe('1');
  });

  describe('Port availability and automatic allocation', () => {
    it('isPortAvailable correctly detects free and occupied ports', async () => {
      const server = net.createServer();
      const testPort = 18080;
      await new Promise<void>((resolve) => server.listen(testPort, '127.0.0.1', () => resolve()));

      try {
        const isOccupied = await isPortAvailable(testPort);
        expect(isOccupied).toBe(false);

        const isFree = await isPortAvailable(testPort + 1);
        expect(isFree).toBe(true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('findAvailablePort finds the next free port when startPort is occupied', async () => {
      const server = net.createServer();
      const testPort = 18082;
      await new Promise<void>((resolve) => server.listen(testPort, '127.0.0.1', () => resolve()));

      try {
        const port = await findAvailablePort(testPort, 10);
        expect(port).toBe(testPort + 1);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('automatically allocates the next available port when port is occupied by a foreign server', async () => {
      const occupiedPort = 18084;
      const blockingServer = net.createServer();
      await new Promise<void>((resolve) => blockingServer.listen(occupiedPort, '127.0.0.1', () => resolve()));

      try {
        const daemon = new NodeDaemonManager(tempUserData);
        vi.spyOn(daemon, 'probeNode').mockResolvedValue(false);
        vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');

        const mockProc = new EventEmitter() as any;
        mockProc.pid = 99991;
        mockProc.stdout = new EventEmitter();
        mockProc.stderr = new EventEmitter();

        let spawnedPort = '';
        mockSpawn.mockImplementation((_cmd, args) => {
          const portIdx = (args as string[]).indexOf('-port');
          if (portIdx !== -1) {
            spawnedPort = args[portIdx + 1];
          }
          process.nextTick(() => {
            mockProc.emit('exit', 0, null);
          });
          return mockProc;
        });

        const status = await daemon.start({ port: occupiedPort });

        expect(Number(spawnedPort)).toBe(occupiedPort + 1);
        expect(status.port).toBe(occupiedPort + 1);
        expect(status.url).toBe(`http://127.0.0.1:${occupiedPort + 1}`);
      } finally {
        await new Promise<void>((resolve) => blockingServer.close(() => resolve()));
      }
    });
  });

  describe('Auth token propagation and companion node claiming', () => {
    it('propagates auth token upon user login and claims running companion node', async () => {
      const testPort = 18086;
      const claimCode = 'CLAIM-MOCK-999';
      let claimStatusFetched = false;

      const localNodeServer = http.createServer((req, res) => {
        if (req.url === '/api/v1/claim/status') {
          claimStatusFetched = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ claimed: false, claim_code: claimCode }));
          return;
        }
        res.writeHead(404);
        res.end();
      });

      await new Promise<void>((resolve) => localNodeServer.listen(testPort, '127.0.0.1', () => resolve()));

      const capturedFetches: { url: string; options: any }[] = [];
      vi.mocked(electronNet.fetch).mockImplementation(async (url: any, options: any) => {
        capturedFetches.push({ url: String(url), options });
        if (String(url).includes('/api/v1/library/servers/claim-direct')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ status: 'claimed' }),
          } as any;
        }
        if (String(url).includes('/api/v1/claim/confirm')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ status: 'confirmed' }),
          } as any;
        }
        return { ok: false, status: 404, text: async () => 'Not found' } as any;
      });

      try {
        const daemon = new NodeDaemonManager(tempUserData);
        vi.spyOn(daemon, 'probeNode').mockResolvedValue(true);
        await daemon.start({ port: testPort });

        // Simulate user login: token propagated
        daemon.setAuthToken('jwt-user-token-12345');

        await new Promise((r) => setTimeout(r, 100));

        expect(claimStatusFetched).toBe(true);

        const backendCall = capturedFetches.find((f) => f.url.includes('/api/v1/library/servers/claim-direct'));
        expect(backendCall).toBeDefined();
        expect(backendCall?.options?.headers?.Authorization).toBe('Bearer jwt-user-token-12345');
        const backendPayload = JSON.parse(backendCall?.options?.body);
        expect(backendPayload.claim_code).toBe(claimCode);
        expect(backendPayload.port).toBe(testPort);
        expect(backendPayload.is_local).toBe(true);
        expect(backendPayload.is_local_desktop).toBe(true);

        const confirmCall = capturedFetches.find((f) => f.url.includes('/api/v1/claim/confirm'));
        expect(confirmCall).toBeDefined();
        const confirmPayload = JSON.parse(confirmCall?.options?.body);
        expect(confirmPayload.claim_code).toBe(claimCode);
        expect(confirmPayload.auth_token).toBe(backendPayload.auth_token);
      } finally {
        await new Promise<void>((resolve) => localNodeServer.close(() => resolve()));
      }
    });

    it('retains auth token passed during starting state and claims once running', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      const ensureClaimedSpy = vi.spyOn(daemon, 'ensureClaimed').mockResolvedValue(true);

      // Pass token while starting (or before start)
      daemon.setAuthToken('premature-auth-token');

      vi.spyOn(daemon, 'probeNode').mockResolvedValue(true);
      await daemon.start({ port: 8090 });

      expect(ensureClaimedSpy).toHaveBeenCalledWith('premature-auth-token');
    });

    it('triggers unclaim when user logs out (empty auth token)', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'probeNode').mockResolvedValue(true);
      await daemon.start({ port: 8090 });

      const unclaimSpy = vi.spyOn(daemon, 'unclaim').mockResolvedValue(true);
      daemon.setAuthToken('');

      expect(unclaimSpy).toHaveBeenCalled();
    });
  });

  describe('IPC status event dispatch', () => {
    it('dispatches node-daemon:status-changed across lifecycle transitions', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      const mockWebContents = {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn(),
      } as any;

      daemon.setWebContents(mockWebContents);
      expect(mockWebContents.send).toHaveBeenCalledWith(
        'node-daemon:status-changed',
        expect.objectContaining({ state: 'stopped', running: false }),
      );

      vi.spyOn(daemon, 'probeNode').mockResolvedValue(true);
      await daemon.start({ port: 8090 });

      expect(mockWebContents.send).toHaveBeenCalledWith(
        'node-daemon:status-changed',
        expect.objectContaining({ state: 'running', running: true, port: 8090 }),
      );

      await daemon.stop();
      expect(mockWebContents.send).toHaveBeenCalledWith(
        'node-daemon:status-changed',
        expect.objectContaining({ state: 'stopped', running: false }),
      );
    });

    it('safely catches webContents.send errors during async notifications without crashing', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      let shouldThrow = false;
      const fragileWebContents = {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn().mockImplementation(() => {
          if (shouldThrow) {
            throw new Error('Object has been destroyed');
          }
        }),
      } as any;

      daemon.setWebContents(fragileWebContents);
      shouldThrow = true;

      vi.spyOn(daemon, 'probeNode').mockResolvedValue(true);
      await expect(daemon.start({ port: 8090 })).resolves.toBeDefined();
      await expect(daemon.stop()).resolves.toBeDefined();
    });
  });
});

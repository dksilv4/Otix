import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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

import { NodeDaemonManager } from '../node-daemon';

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
});

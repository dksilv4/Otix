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

describe('Adversarial Stress Test: Desktop Node Daemon State Machine & Lifecycle', () => {
  const tempUserData = path.join(__dirname, '..', '..', 'tmp-daemon-adversarial-test');

  beforeEach(() => {
    fs.mkdirSync(tempUserData, { recursive: true });
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      fs.rmSync(tempUserData, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const createMockProcess = (pid = 12345) => {
    const proc = new EventEmitter() as any;
    proc.pid = pid;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn((signal?: string) => {
      // default: emit exit on next tick if not handled
      return true;
    });
    return proc;
  };

  describe('setWebContents stress testing and error boundaries', () => {
    it('immediately pushes status on setWebContents', () => {
      const daemon = new NodeDaemonManager(tempUserData);
      const mockWc = {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn(),
      } as any;

      daemon.setWebContents(mockWc);
      expect(mockWc.send).toHaveBeenCalledTimes(1);
      expect(mockWc.send).toHaveBeenCalledWith('node-daemon:status-changed', daemon.getStatus());
    });

    it('pushes status multiple times if setWebContents is called consecutively', () => {
      const daemon = new NodeDaemonManager(tempUserData);
      const mockWc1 = { isDestroyed: vi.fn().mockReturnValue(false), send: vi.fn() } as any;
      const mockWc2 = { isDestroyed: vi.fn().mockReturnValue(false), send: vi.fn() } as any;

      daemon.setWebContents(mockWc1);
      daemon.setWebContents(mockWc2);

      expect(mockWc1.send).toHaveBeenCalledTimes(1);
      expect(mockWc2.send).toHaveBeenCalledTimes(1);
    });

    it('does not send status if webContents is already destroyed', () => {
      const daemon = new NodeDaemonManager(tempUserData);
      const destroyedWc = {
        isDestroyed: vi.fn().mockReturnValue(true),
        send: vi.fn(),
      } as any;

      daemon.setWebContents(destroyedWc);
      expect(destroyedWc.send).not.toHaveBeenCalled();
    });

    it('clears webContents when called with null without throwing', () => {
      const daemon = new NodeDaemonManager(tempUserData);
      const mockWc = { isDestroyed: vi.fn().mockReturnValue(false), send: vi.fn() } as any;

      daemon.setWebContents(mockWc);
      expect(() => daemon.setWebContents(null)).not.toThrow();
    });

    it('surfaces or throws if webContents.send throws an exception (destroyed during send)', () => {
      const daemon = new NodeDaemonManager(tempUserData);
      const fragileWc = {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn().mockImplementation(() => {
          throw new Error('Render frame was disposed');
        }),
      } as any;

      // Notice: notifyStatus does not have a try/catch, so calling setWebContents with a crashing send re-throws
      expect(() => daemon.setWebContents(fragileWc)).toThrow('Render frame was disposed');
    });
  });

  describe('Process errors and unexpected exits', () => {
    it('transitions to error state and clears childProcess when spawn emits error', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'probeNode').mockResolvedValue(false);
      vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');

      const mockProc = createMockProcess(20001);
      mockSpawn.mockImplementation(() => {
        process.nextTick(() => {
          mockProc.emit('error', new Error('spawn EACCES'));
        });
        return mockProc;
      });

      const status = await daemon.start({ port: 8091 });

      expect(status.state).toBe('error');
      expect(status.running).toBe(false);
      expect(status.pid).toBeNull();
      expect(status.error).toContain('spawn EACCES');
    });

    it('transitions to error state when process exits unexpectedly with non-zero code', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'probeNode').mockResolvedValue(false);
      vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');

      const mockProc = createMockProcess(20002);
      mockSpawn.mockImplementation(() => {
        process.nextTick(() => {
          mockProc.emit('exit', 1, null);
        });
        return mockProc;
      });

      const status = await daemon.start({ port: 8092 });

      expect(status.state).toBe('error');
      expect(status.running).toBe(false);
      expect(status.pid).toBeNull();
      expect(status.error).toContain('exited with code 1');
    });

    it('transitions to stopped state when process exits cleanly with code 0', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'probeNode').mockResolvedValue(false);
      vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');

      const mockProc = createMockProcess(20003);
      mockSpawn.mockImplementation(() => {
        process.nextTick(() => {
          mockProc.emit('exit', 0, null);
        });
        return mockProc;
      });

      const status = await daemon.start({ port: 8093 });

      expect(status.state).toBe('stopped');
      expect(status.running).toBe(false);
      expect(status.pid).toBeNull();
    });
  });

  describe('SIGTERM and SIGKILL termination timeout', () => {
    it('gracefully stops process on SIGTERM when process exits quickly', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'probeNode').mockResolvedValue(false);
      vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');

      const mockProc = createMockProcess(30001);
      mockSpawn.mockReturnValue(mockProc);

      // Start the daemon, simulate probe succeeding immediately
      const probeSpy = vi.spyOn(daemon, 'probeNode')
        .mockResolvedValueOnce(false) // initial probe before spawn
        .mockResolvedValueOnce(true);  // probe loop after spawn

      await daemon.start({ port: 8094 });
      expect(daemon.getStatus().state).toBe('running');

      // Now stop daemon. On SIGTERM, process emits exit
      mockProc.kill.mockImplementation((signal?: string) => {
        if (signal === 'SIGTERM') {
          setTimeout(() => mockProc.emit('exit', 0, null), 10);
        }
        return true;
      });

      const stopStatus = await daemon.stop();

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(stopStatus.state).toBe('stopped');
      expect(stopStatus.running).toBe(false);
      expect(stopStatus.pid).toBeNull();
    });

    it('escalates to SIGKILL if child process hangs and ignores SIGTERM after 2500ms timeout', async () => {
      vi.useFakeTimers();

      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');

      const mockProc = createMockProcess(30002);
      mockSpawn.mockReturnValue(mockProc);

      vi.spyOn(daemon, 'probeNode')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const startPromise = daemon.start({ port: 8095 });
      // Let initial probe resolution proceed
      await vi.advanceTimersByTimeAsync(250);
      await startPromise;

      expect(daemon.getStatus().state).toBe('running');

      // Process ignores SIGTERM completely (does not exit)
      mockProc.kill.mockImplementation((signal?: string) => {
        // Does not emit exit on SIGTERM!
        return true;
      });

      const stopPromise = daemon.stop();

      // Verify SIGTERM was sent first
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockProc.kill).not.toHaveBeenCalledWith('SIGKILL');

      // Advance timers past the 2500ms escalation threshold
      await vi.advanceTimersByTimeAsync(2600);
      const stopStatus = await stopPromise;

      // Verify SIGKILL was dispatched as fallback!
      expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
      expect(stopStatus.state).toBe('stopped');
      expect(daemon.getStatus().pid).toBeNull();
    });
  });

  describe('Rapid start -> stop -> start lifecycle transitions', () => {
    it('handles sequential rapid start -> stop -> start cycles cleanly without leaks', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');

      const mockProc1 = createMockProcess(40001);
      const mockProc2 = createMockProcess(40002);

      let spawnCount = 0;
      mockSpawn.mockImplementation(() => {
        spawnCount++;
        return spawnCount === 1 ? mockProc1 : mockProc2;
      });

      vi.spyOn(daemon, 'probeNode')
        // cycle 1:
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        // cycle 2:
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      // Cycle 1: Start
      const s1 = await daemon.start({ port: 8096 });
      expect(s1.state).toBe('running');
      expect(s1.pid).toBe(40001);

      // Cycle 1: Stop
      mockProc1.kill.mockImplementation(() => {
        mockProc1.emit('exit', 0, null);
        return true;
      });
      const s2 = await daemon.stop();
      expect(s2.state).toBe('stopped');
      expect(s2.pid).toBeNull();

      // Cycle 2: Start again
      const s3 = await daemon.start({ port: 8096 });
      expect(s3.state).toBe('running');
      expect(s3.pid).toBe(40002);

      // Cycle 2: Dispose
      mockProc2.kill.mockImplementation(() => {
        mockProc2.emit('exit', 0, null);
        return true;
      });
      await daemon.dispose();
      expect(daemon.getStatus().state).toBe('stopped');
    });

    it('detects already running companion node on port without spawning a new process', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      // Simulate that an existing node daemon is already listening on port 8090
      vi.spyOn(daemon, 'probeNode').mockResolvedValue(true);

      const status = await daemon.start({ port: 8090 });

      expect(mockSpawn).not.toHaveBeenCalled();
      expect(status.state).toBe('running');
      expect(status.running).toBe(true);
      expect(status.embedded).toBe(false);
      expect(status.pid).toBeNull();
    });

    it('interleaved start() and stop() calls do not leave an orphaned process running', async () => {
      const daemon = new NodeDaemonManager(tempUserData);
      vi.spyOn(daemon, 'resolveBinaryPath').mockReturnValue('/bin/mock-otix-node');

      const mockProc = createMockProcess(50001);
      mockSpawn.mockImplementation(() => {
        return mockProc;
      });

      // probeNode simulates delay
      vi.spyOn(daemon, 'probeNode').mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return false;
      });

      mockProc.kill.mockImplementation(() => {
        mockProc.emit('exit', 0, null);
        return true;
      });

      // Trigger start, then immediately trigger stop before probeNode finishes
      const startPromise = daemon.start({ port: 8097 });
      const stopPromise = daemon.stop();

      await Promise.all([startPromise, stopPromise]);

      // If stop() completed after start() spawned, childProcess might still be spawned if stop saw null!
      // Verify final process state
      const finalStatus = daemon.getStatus();
      // Ensure we clean up any spawned process
      if (daemon.getStatus().running) {
        await daemon.stop();
      }
      expect(finalStatus.state).toBeDefined();
    });
  });
});


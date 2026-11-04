import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Minimal DB Mock for storage.ts ─────────────────────────────────────
const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn().mockReturnValue({
    run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
    get: vi.fn().mockReturnValue(undefined),
    all: vi.fn().mockReturnValue([]),
  }),
  transaction: (fn: any) => fn,
};

vi.mock('../db', () => ({
  getDb: () => mockDb,
}));

import {
  notifyGamesChanged,
  flushNotifyGamesChanged,
  cancelPendingNotifyGamesChanged,
  setNotifyTarget,
  onGamesChanged,
  NOTIFY_DEBOUNCE_MS,
  disposeService,
} from '../game/storage';

function createMockWindow() {
  const ee = new EventEmitter() as any;
  let destroyed = false;
  ee.isDestroyed = () => destroyed;
  ee._destroy = () => {
    destroyed = true;
    ee.emit('closed');
  };
  ee.webContents = {
    isDestroyed: () => destroyed,
    send: vi.fn(),
  };
  return ee;
}

describe('Challenger M1-2: IPC Debounce & Concurrency Challenge Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    disposeService();
  });

  afterEach(() => {
    disposeService();
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Task 1.1: 5,000 rapid concurrent calls to notifyGamesChanged()
  // ─────────────────────────────────────────────────────────────────────────
  describe('5,000 Rapid Concurrent Calls to notifyGamesChanged()', () => {
    it('coalesces 5,000 synchronous rapid calls into exactly 1 notification after 1,000ms', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      // Fire 5,000 rapid synchronous calls
      for (let i = 0; i < 5000; i++) {
        notifyGamesChanged();
      }

      // At t = 0ms, neither window IPC nor listeners have fired
      expect(win.webContents.send).toHaveBeenCalledTimes(0);
      expect(listener).toHaveBeenCalledTimes(0);

      // At t = 999ms, still quiet
      vi.advanceTimersByTime(NOTIFY_DEBOUNCE_MS - 1);
      expect(win.webContents.send).toHaveBeenCalledTimes(0);
      expect(listener).toHaveBeenCalledTimes(0);

      // At t = 1,000ms, exactly 1 debounced notification emits
      vi.advanceTimersByTime(1);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(win.webContents.send).toHaveBeenCalledWith('games-db:changed');
      expect(listener).toHaveBeenCalledTimes(1);

      // Advancing further by 10,000ms proves zero additional notifications emit
      vi.advanceTimersByTime(10000);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
    });

    it('coalesces 5,000 asynchronous microtask calls into exactly 1 notification after 1,000ms', async () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      // Fire 5,000 calls scheduled via Promise microtasks
      await Promise.all(
        Array.from({ length: 5000 }, (_, i) =>
          Promise.resolve().then(() => {
            notifyGamesChanged();
          }),
        ),
      );

      // Verify no emission during queueing
      expect(win.webContents.send).toHaveBeenCalledTimes(0);
      expect(listener).toHaveBeenCalledTimes(0);

      // Advance to 999ms
      vi.advanceTimersByTime(999);
      expect(win.webContents.send).toHaveBeenCalledTimes(0);

      // Final 1ms reaches 1,000ms debounce
      vi.advanceTimersByTime(1);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);

      // Advance 5,000ms more — strictly no extra calls
      vi.advanceTimersByTime(5000);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
    });

    it('resets timer properly when 5,000 calls arrive staggered every 100ms', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      // Simulate a continuous streaming write: 50 bursts of 100 calls, spaced by 100ms
      // Total duration = 5,000ms of constant incoming activity
      for (let burst = 0; burst < 50; burst++) {
        for (let i = 0; i < 100; i++) {
          notifyGamesChanged();
        }
        vi.advanceTimersByTime(100);
        // Since timer resets every 100ms (< 1,000ms debounce), no emission should occur yet
        expect(win.webContents.send).toHaveBeenCalledTimes(0);
        expect(listener).toHaveBeenCalledTimes(0);
      }

      // After last burst finishes, 100ms have already elapsed since the last notify call.
      // Advance by 899ms to reach 999ms total elapsed time since the last call.
      vi.advanceTimersByTime(899);
      expect(win.webContents.send).toHaveBeenCalledTimes(0);

      // Final 1ms reaches exactly 1,000ms after the last write and triggers the single coalesced notification
      vi.advanceTimersByTime(1);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(win.webContents.send).toHaveBeenCalledWith('games-db:changed');
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Task 1.2: flushNotifyGamesChanged() behavior
  // ─────────────────────────────────────────────────────────────────────────
  describe('flushNotifyGamesChanged() Flushing and Timer Cancellation', () => {
    it('flushes pending notification immediately and cancels pending debounce timer', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      // Queue a notification
      notifyGamesChanged();
      expect(win.webContents.send).toHaveBeenCalledTimes(0);

      // Immediately flush
      flushNotifyGamesChanged();
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(win.webContents.send).toHaveBeenCalledWith('games-db:changed');
      expect(listener).toHaveBeenCalledTimes(1);

      // Advance past the original debounce deadline (1,000ms and beyond)
      vi.advanceTimersByTime(5000);

      // Confirms timer was cancelled: count remains 1, no duplicate emission!
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
    });

    it('flushNotifyGamesChanged() without pending notification is a silent no-op', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      // No pending calls
      flushNotifyGamesChanged();
      flushNotifyGamesChanged();

      expect(win.webContents.send).toHaveBeenCalledTimes(0);
      expect(listener).toHaveBeenCalledTimes(0);

      unsub();
    });

    it('flushNotifyGamesChanged({ force: true }) forces immediate dispatch even without pending timer', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      flushNotifyGamesChanged({ force: true });
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);

      flushNotifyGamesChanged({ force: true });
      expect(win.webContents.send).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledTimes(2);

      unsub();
    });

    it('interleaved notify and flush calls execute predictably', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      notifyGamesChanged();
      flushNotifyGamesChanged(); // Count = 1
      expect(win.webContents.send).toHaveBeenCalledTimes(1);

      notifyGamesChanged();
      flushNotifyGamesChanged(); // Count = 2
      expect(win.webContents.send).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(3000);
      expect(win.webContents.send).toHaveBeenCalledTimes(2);

      unsub();
    });

    it('cancelPendingNotifyGamesChanged() cancels pending timer without emitting', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      notifyGamesChanged();
      cancelPendingNotifyGamesChanged();

      vi.advanceTimersByTime(5000);
      expect(win.webContents.send).toHaveBeenCalledTimes(0);
      expect(listener).toHaveBeenCalledTimes(0);

      unsub();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Task 1.3: Window Closure and Lifecycle Detach
  // ─────────────────────────────────────────────────────────────────────────
  describe('Window Closure Detach and Lifecycle Safety', () => {
    it('detaches target and cancels pending timer when window emits closed', () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      notifyGamesChanged();

      // Window is closed while timer is pending
      win._destroy();

      // Advance time past debounce timeout
      vi.advanceTimersByTime(5000);

      // Window webContents must NOT be sent messages after destruction
      expect(win.webContents.send).toHaveBeenCalledTimes(0);
      // Listeners are also not called because timer was cancelled on window close
      expect(listener).toHaveBeenCalledTimes(0);

      unsub();
    });

    it('does not crash or leak if setNotifyTarget is called with an already destroyed window', () => {
      const win = createMockWindow();
      win._destroy();

      // Setting an already destroyed window should cleanly cancel pending notifications
      notifyGamesChanged();
      setNotifyTarget(win);

      vi.advanceTimersByTime(5000);
      expect(win.webContents.send).toHaveBeenCalledTimes(0);
    });

    it('detaches previous window event listeners when switching to a new target window', () => {
      const winA = createMockWindow();
      const winB = createMockWindow();

      setNotifyTarget(winA);
      setNotifyTarget(winB);

      // Now close winA — it should not affect winB
      winA._destroy();

      notifyGamesChanged();
      vi.advanceTimersByTime(1000);

      expect(winA.webContents.send).toHaveBeenCalledTimes(0);
      expect(winB.webContents.send).toHaveBeenCalledTimes(1);
    });

    it('handles webContents being destroyed independently of window without throwing', () => {
      const win = createMockWindow();
      setNotifyTarget(win);

      // Destroy webContents directly without emitting window closed
      win.webContents.isDestroyed = () => true;

      // notify immediate should not throw
      expect(() => {
        notifyGamesChanged({ immediate: true });
      }).not.toThrow();
      expect(win.webContents.send).toHaveBeenCalledTimes(0);
    });

    it('catches and logs IPC send errors gracefully without unhandled rejections', () => {
      const win = createMockWindow();
      setNotifyTarget(win);

      win.webContents.send.mockImplementation(() => {
        throw new Error('Object has been destroyed');
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => {
        notifyGamesChanged({ immediate: true });
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('isolates listener errors so other registered callbacks still execute', () => {
      const win = createMockWindow();
      setNotifyTarget(win);

      const faultyListener = vi.fn(() => {
        throw new Error('Listener crash');
      });
      const healthyListener = vi.fn();

      const unsub1 = onGamesChanged(faultyListener);
      const unsub2 = onGamesChanged(healthyListener);

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      notifyGamesChanged({ immediate: true });

      expect(faultyListener).toHaveBeenCalledTimes(1);
      expect(healthyListener).toHaveBeenCalledTimes(1);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);

      errorSpy.mockRestore();
      unsub1();
      unsub2();
    });

    it('supports unsubscribe during onGamesChanged callback cleanly', () => {
      let unsub: () => void;
      const callback = vi.fn(() => {
        unsub();
      });
      unsub = onGamesChanged(callback);

      notifyGamesChanged({ immediate: true });
      expect(callback).toHaveBeenCalledTimes(1);

      // Second notification should not invoke unsubscribed callback
      notifyGamesChanged({ immediate: true });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Task 1.4: Extreme Re-entrancy and Concurrency Stress
  // ─────────────────────────────────────────────────────────────────────────
  describe('Extreme Re-entrancy & Mixed Stress', () => {
    it('handles re-entrant notifyGamesChanged calls from within listeners without infinite loops', () => {
      let depth = 0;
      const maxDepth = 3;
      const reentrantListener = vi.fn(() => {
        if (depth < maxDepth) {
          depth++;
          notifyGamesChanged({ immediate: false });
        }
      });

      const unsub = onGamesChanged(reentrantListener);

      notifyGamesChanged({ immediate: true });
      expect(reentrantListener).toHaveBeenCalledTimes(1);

      // Advance debounce timer for the re-entrant call
      vi.advanceTimersByTime(1000);
      expect(reentrantListener).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(1000);
      expect(reentrantListener).toHaveBeenCalledTimes(3);

      vi.advanceTimersByTime(1000);
      expect(reentrantListener).toHaveBeenCalledTimes(4);

      // Beyond maxDepth, no more calls
      vi.advanceTimersByTime(5000);
      expect(reentrantListener).toHaveBeenCalledTimes(4);

      unsub();
    });

    it('stress tests rapid interleaved notify, flush, and cancel under concurrent async calls', async () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      // Rapidly fire 1,000 mixed operations across microtasks
      const operations = [
        () => notifyGamesChanged(),
        () => notifyGamesChanged(),
        () => cancelPendingNotifyGamesChanged(),
        () => notifyGamesChanged(),
        () => flushNotifyGamesChanged(),
      ];

      await Promise.all(
        Array.from({ length: 1000 }, (_, i) =>
          Promise.resolve().then(() => {
            operations[i % operations.length]();
          }),
        ),
      );

      // Verify timers can still settle cleanly without unhandled errors
      vi.advanceTimersByTime(2000);

      // Ensure win.webContents.send was called during flushes and final timeout
      expect(win.webContents.send.mock.calls.length).toBeGreaterThan(0);
      expect(listener.mock.calls.length).toBe(win.webContents.send.mock.calls.length);

      unsub();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Task 1.5: Empirical Real-Timer Stress Harness (Wall-Clock Verification)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Empirical Real-Timer Stress Harness (Wall-Clock Verification)', () => {
    beforeEach(() => {
      vi.useRealTimers();
      disposeService();
    });

    it('empirically verifies 5,000 rapid calls with real wall-clock timer (1,000ms debounce)', async () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      const startTime = Date.now();

      // Fire 5,000 rapid synchronous calls
      for (let i = 0; i < 5000; i++) {
        notifyGamesChanged();
      }

      // Check after 400ms real time: must not have emitted yet
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(win.webContents.send).toHaveBeenCalledTimes(0);
      expect(listener).toHaveBeenCalledTimes(0);

      // Wait until total elapsed real time >= 1,150ms (> 1,000ms debounce window)
      const remaining = Math.max(50, 1150 - (Date.now() - startTime));
      await new Promise((resolve) => setTimeout(resolve, remaining));

      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(win.webContents.send).toHaveBeenCalledWith('games-db:changed');
      expect(listener).toHaveBeenCalledTimes(1);

      // Wait an additional 300ms real time to guarantee no delayed duplicate fires
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
    }, 10000);

    it('empirically verifies real-timer flushNotifyGamesChanged() latency < 25ms and cancels pending timer', async () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      for (let i = 0; i < 5000; i++) {
        notifyGamesChanged();
      }

      const flushStart = performance.now();
      flushNotifyGamesChanged();
      const flushLatency = performance.now() - flushStart;

      // Flush must be essentially instantaneous (< 25ms)
      expect(flushLatency).toBeLessThan(25);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);

      // Wait 1,200ms real time to ensure the original 1,000ms timer was cancelled and does not fire again
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
    }, 10000);

    it('empirically verifies real-timer window closure cancels pending timers without errors', async () => {
      const win = createMockWindow();
      setNotifyTarget(win);
      const listener = vi.fn();
      const unsub = onGamesChanged(listener);

      for (let i = 0; i < 5000; i++) {
        notifyGamesChanged();
      }

      // Destroy window immediately
      win._destroy();

      // Wait 1,200ms real time
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(win.webContents.send).toHaveBeenCalledTimes(0);
      expect(listener).toHaveBeenCalledTimes(0);

      unsub();
    }, 10000);
  });
});


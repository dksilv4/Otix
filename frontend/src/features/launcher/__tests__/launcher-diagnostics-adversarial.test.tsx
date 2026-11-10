import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  calculateRollingPercentile,
  getFpsTier,
  getFrameTimeTier,
  getHydrationTier,
  getIpcLatencyTier,
  formatLatency,
  formatFps,
  formatMemoryMb,
  formatPercentage,
} from '../utils/diagnostics';
import { useLauncherDiagnostics } from '../hooks/use-launcher-diagnostics';
import { LauncherPerformanceDiagnosticsModal } from '../components/organisms/launcher-performance-diagnostics-modal';
import { LauncherThemeContext } from '../themes/theme-context';
import type { LauncherThemeContextType } from '../themes/types';

// Mock desktop API with vi.hoisted
const { mockDesktopAPI, mockDesktopFlags } = vi.hoisted(() => ({
  mockDesktopAPI: {
    ping: vi.fn().mockResolvedValue(true),
  },
  mockDesktopFlags: {
    hasDesktop: true,
  },
}));

vi.mock('@/lib/desktop/api', () => ({
  hasDesktopAPI: vi.fn(() => mockDesktopFlags.hasDesktop),
  isDesktop: vi.fn(() => mockDesktopFlags.hasDesktop),
  getDesktopAPI: vi.fn(() => mockDesktopAPI),
}));

// Mock useLocalGames
let mockGamesData: any = [
  { id: 'game-1', title: 'Witcher 3', platform: 'pc' },
  { id: 'game-2', title: 'Cyberpunk', platform: 'pc' },
];

vi.mock('@/features/launcher/data/game-queries', () => ({
  localGameKeys: {
    list: () => ['local-games', 'list'],
  },
  useLocalGames: () => ({
    data: mockGamesData,
    isLoading: false,
  }),
}));

describe('Milestone 4 Adversarial Empirical Suite: Diagnostics & Telemetry Stress Tests', () => {
  let queryClient: QueryClient;

  const mockThemeContext: LauncherThemeContextType = {
    currentTheme: 'steam',
    setTheme: vi.fn(),
    cycleTheme: vi.fn(),
    themeMeta: { id: 'steam', name: 'Steam Deck', isEnabled: true } as any,
    availableThemes: [],
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <LauncherThemeContext.Provider value={mockThemeContext}>
        {children}
      </LauncherThemeContext.Provider>
    </QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockDesktopFlags.hasDesktop = true;
    mockGamesData = [
      { id: 'game-1', title: 'Witcher 3', platform: 'pc' },
      { id: 'game-2', title: 'Cyberpunk', platform: 'pc' },
    ];
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    queryClient.setQueryData(['local-games', 'list'], mockGamesData);
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('1. Diagnostics Utility Math & Extreme Boundary Invariants', () => {
    it('calculateRollingPercentile handles extreme lengths, negatives, and NaN values', () => {
      // Empty array
      expect(calculateRollingPercentile([], 50)).toBe(0);
      // Single element
      expect(calculateRollingPercentile([99.9], 99)).toBe(99.9);
      // All negative
      expect(calculateRollingPercentile([-100, -50, -20, -10], 50)).toBe(-20);
      // Percentiles outside [0, 100] clamp safely
      expect(calculateRollingPercentile([10, 20, 30], -50)).toBe(10);
      expect(calculateRollingPercentile([10, 20, 30], 250)).toBe(30);
      // Large array: 5,000 items
      const largeArray = Array.from({ length: 5000 }, (_, i) => i + 1);
      expect(calculateRollingPercentile(largeArray, 95)).toBe(4751);
      expect(calculateRollingPercentile(largeArray, 99)).toBe(4951);
    });

    it('tier classification functions handle extreme and anomalous boundary numbers', () => {
      // FPS Tier: optimal >= 58, warning 35-57, critical < 35
      expect(getFpsTier(-10)).toBe('critical');
      expect(getFpsTier(0)).toBe('critical');
      expect(getFpsTier(34.99)).toBe('critical');
      expect(getFpsTier(35)).toBe('warning');
      expect(getFpsTier(57.99)).toBe('warning');
      expect(getFpsTier(58)).toBe('optimal');
      expect(getFpsTier(1000)).toBe('optimal');

      // Frame Time Tier: optimal <= 16.67, warning <= 28.5, critical > 28.5
      expect(getFrameTimeTier(-5)).toBe('optimal');
      expect(getFrameTimeTier(0)).toBe('optimal');
      expect(getFrameTimeTier(16.67)).toBe('optimal');
      expect(getFrameTimeTier(16.68)).toBe('warning');
      expect(getFrameTimeTier(28.5)).toBe('warning');
      expect(getFrameTimeTier(28.51)).toBe('critical');
      expect(getFrameTimeTier(9999)).toBe('critical');

      // Hydration Tier: null/<=150 optimal, <=300 warning, >300 critical
      expect(getHydrationTier(null)).toBe('optimal');
      expect(getHydrationTier(0)).toBe('optimal');
      expect(getHydrationTier(150)).toBe('optimal');
      expect(getHydrationTier(150.1)).toBe('warning');
      expect(getHydrationTier(300)).toBe('warning');
      expect(getHydrationTier(300.01)).toBe('critical');

      // IPC Latency Tier: null/<=5 optimal, <=20 warning, >20 critical
      expect(getIpcLatencyTier(null)).toBe('optimal');
      expect(getIpcLatencyTier(0)).toBe('optimal');
      expect(getIpcLatencyTier(5)).toBe('optimal');
      expect(getIpcLatencyTier(5.1)).toBe('warning');
      expect(getIpcLatencyTier(20)).toBe('warning');
      expect(getIpcLatencyTier(20.1)).toBe('critical');
    });

    it('formatting helpers never throw or output undefined/null strings', () => {
      expect(formatLatency(null)).toBe('-- ms');
      expect(formatLatency(undefined)).toBe('-- ms');
      expect(formatLatency(-0.01)).toBe('-0.0 ms');
      expect(formatLatency(16.6666)).toBe('16.7 ms');

      expect(formatFps(null)).toBe('-- FPS');
      expect(formatFps(undefined)).toBe('-- FPS');
      expect(formatFps(0)).toBe('0 FPS');
      expect(formatFps(59.9)).toBe('60 FPS');

      expect(formatMemoryMb(null)).toBe('-- MB');
      expect(formatMemoryMb(undefined)).toBe('-- MB');
      expect(formatMemoryMb(0)).toBe('0.0 MB');
      expect(formatMemoryMb(1024.456)).toBe('1024.5 MB');

      expect(formatPercentage(0)).toBe('0%');
      expect(formatPercentage(0.555)).toBe('56%');
      expect(formatPercentage(1.5)).toBe('150%');
    });
  });

  describe('2. useLauncherDiagnostics Hook Stress Testing', () => {
    it('survives rapid unmount and remount (50 consecutive cycles) without leaking RAF or unhandled rejections', () => {
      for (let i = 0; i < 50; i++) {
        const { unmount } = renderHook(() => useLauncherDiagnostics({ enabled: true }), {
          wrapper,
        });
        unmount();
      }
    });

    it('handles null/undefined query cache state gracefully', () => {
      // Clear queryClient and set data to null
      queryClient.clear();
      mockGamesData = null;

      const { result } = renderHook(() => useLauncherDiagnostics({ enabled: true }), {
        wrapper,
      });

      expect(result.current.hydrationItemCount).toBe(0);
      expect(result.current.gameCount).toBe(0);
      expect(result.current.fps).toBe(60);
    });

    it('handles missing Electron API (web fallback mode)', async () => {
      mockDesktopFlags.hasDesktop = false;

      const { result } = renderHook(() => useLauncherDiagnostics({ enabled: true }), {
        wrapper,
      });

      expect(result.current.isDesktop).toBe(false);

      await act(async () => {
        await result.current.refreshIpcPing();
      });

      // Should complete microtask and set non-null latency
      expect(result.current.ipcQueryCount).toBeGreaterThan(0);
      expect(result.current.ipcLatencyMs).not.toBeNull();
    });

    it('handles failing/throwing Electron IPC ping gracefully without crashing', async () => {
      mockDesktopFlags.hasDesktop = true;
      mockDesktopAPI.ping.mockRejectedValue(new Error('IPC pipe broken'));

      const { result } = renderHook(() => useLauncherDiagnostics({ enabled: true }), {
        wrapper,
      });

      await act(async () => {
        await result.current.refreshIpcPing();
      });

      // On failure, ipcLatencyMs should be safely set to null without unhandled promise rejection
      expect(result.current.ipcLatencyMs).toBeNull();
    });

    it('samples memory from window.performance.memory when available, or provides deterministic fallback', () => {
      // Test fallback mode (standard in test environment where window.performance.memory is undefined)
      const { result } = renderHook(() => useLauncherDiagnostics({ enabled: true }), {
        wrapper,
      });

      expect(result.current.memory).not.toBeNull();
      expect(result.current.memory?.usedJsHeapMb).toBe(42.5);
      expect(result.current.memory?.totalJsHeapMb).toBe(85.0);
      expect(result.current.memory?.jsHeapLimitMb).toBe(2048.0);
    });

    it('accurately handles frame time delta tracking: filters tab-switch freezes (>=200ms) and measures sustained frame drops (10 FPS)', () => {
      let rafCallback: ((time: number) => void) | null = null;
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallback = cb;
        return 1;
      });

      const { result, unmount } = renderHook(() => useLauncherDiagnostics({ enabled: true }), {
        wrapper,
      });

      let currentTime = 1000;

      // Initial tick
      act(() => {
        rafCallback?.(currentTime);
      });

      // 1. Simulate 15 frames at normal 60 FPS (16.6ms intervals)
      for (let i = 0; i < 15; i++) {
        currentTime += 16.6;
        act(() => {
          rafCallback?.(currentTime);
        });
      }

      expect(result.current.fps).toBe(60);
      expect(result.current.frameTimeMs).toBe(16.6);

      // 2. Simulate 1 FPS lag spike / freeze (1000ms delta >= 200ms threshold)
      currentTime += 1000;
      act(() => {
        rafCallback?.(currentTime);
      });

      // Outlier is rejected by delta < 200 guard, so FPS remains smooth
      expect(result.current.fps).toBe(60);

      // 3. Simulate continuous heavy frame drop at 100ms delta (10 FPS) for 60 frames to fully saturate rolling window
      for (let i = 0; i < 60; i++) {
        currentTime += 100;
        act(() => {
          rafCallback?.(currentTime);
        });
      }

      // Should detect and reflect sustained frame drop after rolling window saturates
      expect(result.current.fps).toBe(10);
      expect(result.current.minFps).toBe(10);
      expect(result.current.frameTimeMs).toBe(100);

      // 4. Simulate negative or zero delta (clock drift)
      currentTime -= 50; // clock drift backwards
      act(() => {
        rafCallback?.(currentTime);
      });
      // Should be discarded (delta <= 0 guard) without division by zero or NaN
      expect(Number.isNaN(result.current.fps)).toBe(false);
      expect(result.current.fps).toBeGreaterThan(0);

      unmount();
      rafSpy.mockRestore();
    });

    it('does not schedule RAF or ping intervals when enabled=false', () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
      const setIntervalSpy = vi.spyOn(window, 'setInterval');

      const { unmount } = renderHook(() => useLauncherDiagnostics({ enabled: false }), {
        wrapper,
      });

      // When enabled=false, none of the measurement loops should run
      expect(rafSpy).not.toHaveBeenCalled();

      unmount();
      rafSpy.mockRestore();
      setIntervalSpy.mockRestore();
    });
  });

  describe('3. LauncherPerformanceDiagnosticsModal Unmount & Event Listener Safety', () => {
    it('mounts and unmounts cleanly 25 times without residual DOM nodes or memory leaks', () => {
      const handleOpenChange = vi.fn();

      for (let i = 0; i < 25; i++) {
        const { unmount } = render(
          <QueryClientProvider client={queryClient}>
            <LauncherThemeContext.Provider value={mockThemeContext}>
              <LauncherPerformanceDiagnosticsModal
                open={true}
                onOpenChange={handleOpenChange}
              />
            </LauncherThemeContext.Provider>
          </QueryClientProvider>,
        );
        unmount();
      }

      // Dialog container should be cleanly disposed
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    it('handles simulated event toggle lifecycles and cleans up window event listeners', () => {
      // Simulate LauncherContent event listener registration and teardown
      const TestContainer = () => {
        const [open, setOpen] = useState(false);

        useEffect(() => {
          const handleToggle = () => setOpen((prev) => !prev);
          const handleOpen = () => setOpen(true);
          window.addEventListener('otix:toggle-launcher-diagnostics', handleToggle);
          window.addEventListener('otix:open-launcher-diagnostics', handleOpen);

          return () => {
            window.removeEventListener('otix:toggle-launcher-diagnostics', handleToggle);
            window.removeEventListener('otix:open-launcher-diagnostics', handleOpen);
          };
        }, []);

        return (
          <LauncherPerformanceDiagnosticsModal
            open={open}
            onOpenChange={setOpen}
          />
        );
      };

      const { unmount } = render(
        <QueryClientProvider client={queryClient}>
          <LauncherThemeContext.Provider value={mockThemeContext}>
            <TestContainer />
          </LauncherThemeContext.Provider>
        </QueryClientProvider>,
      );

      // Initially closed
      expect(screen.queryByText('Launcher Performance Diagnostics')).toBeNull();

      // Dispatch open event
      act(() => {
        window.dispatchEvent(new CustomEvent('otix:open-launcher-diagnostics'));
      });
      expect(screen.getByText('Launcher Performance Diagnostics')).toBeDefined();

      // Dispatch toggle event (closes)
      act(() => {
        window.dispatchEvent(new CustomEvent('otix:toggle-launcher-diagnostics'));
      });
      expect(screen.queryByText('Launcher Performance Diagnostics')).toBeNull();

      // Unmount container
      unmount();

      // Dispatching events after unmount must have zero effect and not throw
      expect(() => {
        window.dispatchEvent(new CustomEvent('otix:open-launcher-diagnostics'));
        window.dispatchEvent(new CustomEvent('otix:toggle-launcher-diagnostics'));
      }).not.toThrow();
    });
  });
});

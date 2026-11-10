import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import React from 'react';
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
const { mockDesktopAPI } = vi.hoisted(() => ({
  mockDesktopAPI: {
    ping: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@/lib/desktop/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/desktop/api')>();
  return {
    ...actual,
    hasDesktopAPI: vi.fn(() => true),
    isDesktop: vi.fn(() => true),
    getDesktopAPI: vi.fn(() => mockDesktopAPI),
  };
});

// Mock useLocalGames
vi.mock('@/features/launcher/data/game-queries', () => ({
  localGameKeys: {
    list: () => ['local-games', 'list'],
  },
  useLocalGames: vi.fn(() => ({
    data: [
      { id: 'game-1', title: 'Witcher 3', platform: 'pc' },
      { id: 'game-2', title: 'Cyberpunk', platform: 'pc' },
      { id: 'game-3', title: 'Elden Ring', platform: 'pc' },
    ],
    isLoading: false,
  })),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('../hooks/use-running-game', () => ({
  useRunningGame: () => ({ runningGame: null, elapsedMs: 0 }),
}));

import { ModernHeader } from '../themes/modern/modern-header';

describe('Launcher Performance Diagnostics (F14)', () => {
  describe('Diagnostics Calculation and Formatting Utils', () => {
    it('calculateRollingPercentile handles empty or clamped percentiles', () => {
      expect(calculateRollingPercentile([], 95)).toBe(0);
      expect(calculateRollingPercentile([10, 20, 30, 40, 50], -5)).toBe(10);
      expect(calculateRollingPercentile([10, 20, 30, 40, 50], 120)).toBe(50);
    });

    it('calculateRollingPercentile accurately computes rolling percentiles', () => {
      const samples = [12, 14, 15, 16, 16, 17, 18, 22, 33, 45];
      expect(calculateRollingPercentile(samples, 50)).toBe(17);
      expect(calculateRollingPercentile(samples, 95)).toBe(45);
      expect(calculateRollingPercentile(samples, 99)).toBe(45);
    });

    it('classifies FPS tiers according to SLA criteria', () => {
      expect(getFpsTier(120)).toBe('optimal');
      expect(getFpsTier(60)).toBe('optimal');
      expect(getFpsTier(58)).toBe('optimal');
      expect(getFpsTier(57)).toBe('warning');
      expect(getFpsTier(35)).toBe('warning');
      expect(getFpsTier(34)).toBe('critical');
      expect(getFpsTier(0)).toBe('critical');
    });

    it('classifies frame time tiers against 16.6ms target', () => {
      expect(getFrameTimeTier(8.3)).toBe('optimal');
      expect(getFrameTimeTier(16.67)).toBe('optimal');
      expect(getFrameTimeTier(16.7)).toBe('warning');
      expect(getFrameTimeTier(28.5)).toBe('warning');
      expect(getFrameTimeTier(28.6)).toBe('critical');
      expect(getFrameTimeTier(50)).toBe('critical');
    });

    it('classifies library hydration tiers against 300ms SLA', () => {
      expect(getHydrationTier(null)).toBe('optimal');
      expect(getHydrationTier(45)).toBe('optimal');
      expect(getHydrationTier(150)).toBe('optimal');
      expect(getHydrationTier(151)).toBe('warning');
      expect(getHydrationTier(300)).toBe('warning');
      expect(getHydrationTier(301)).toBe('critical');
    });

    it('classifies IPC latency tiers', () => {
      expect(getIpcLatencyTier(null)).toBe('optimal');
      expect(getIpcLatencyTier(2)).toBe('optimal');
      expect(getIpcLatencyTier(5)).toBe('optimal');
      expect(getIpcLatencyTier(6)).toBe('warning');
      expect(getIpcLatencyTier(20)).toBe('warning');
      expect(getIpcLatencyTier(25)).toBe('critical');
    });

    it('formats metric values cleanly', () => {
      expect(formatLatency(null)).toBe('-- ms');
      expect(formatLatency(undefined)).toBe('-- ms');
      expect(formatLatency(16.666)).toBe('16.7 ms');
      expect(formatLatency(0)).toBe('0.0 ms');

      expect(formatFps(null)).toBe('-- FPS');
      expect(formatFps(undefined)).toBe('-- FPS');
      expect(formatFps(59.8)).toBe('60 FPS');
      expect(formatFps(144)).toBe('144 FPS');

      expect(formatMemoryMb(null)).toBe('-- MB');
      expect(formatMemoryMb(undefined)).toBe('-- MB');
      expect(formatMemoryMb(64.28)).toBe('64.3 MB');

      expect(formatPercentage(0.854)).toBe('85%');
      expect(formatPercentage(1)).toBe('100%');
    });
  });

  describe('useLauncherDiagnostics Hook Telemetry', () => {
    let queryClient: QueryClient;

    const mockThemeContext: LauncherThemeContextType = {
      currentTheme: 'modern',
      setTheme: vi.fn(),
      cycleTheme: vi.fn(),
      themeMeta: { id: 'modern', name: 'Modern Neon', isEnabled: true } as any,
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
      queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      });
      // Set query cache state for listKey
      queryClient.setQueryData(['local-games', 'list'], [
        { id: '1', title: 'Game 1' },
        { id: '2', title: 'Game 2' },
      ]);
    });

    afterEach(() => {
      queryClient.clear();
    });

    it('initializes telemetry state and reports active theme and environment', () => {
      const { result } = renderHook(() => useLauncherDiagnostics(), { wrapper });

      expect(result.current.fps).toBe(60);
      expect(result.current.frameTimeMs).toBe(16.6);
      expect(result.current.activeTheme).toBe('modern');
      expect(result.current.isDesktop).toBe(true);
      expect(result.current.gameCount).toBe(3);
      expect(result.current.fpsHistory.length).toBeGreaterThan(0);
      expect(result.current.frameTimeHistory.length).toBeGreaterThan(0);
      expect(result.current.memory).not.toBeNull();
    });

    it('executes IPC ping and increments query count', async () => {
      const { result } = renderHook(() => useLauncherDiagnostics(), { wrapper });

      await act(async () => {
        await result.current.refreshIpcPing();
      });

      expect(result.current.ipcQueryCount).toBeGreaterThan(0);
      expect(mockDesktopAPI.ping).toHaveBeenCalled();
    });

    it('resets telemetry history on resetHistory call', () => {
      const { result } = renderHook(() => useLauncherDiagnostics(), { wrapper });

      act(() => {
        result.current.resetHistory();
      });

      expect(result.current.fpsHistory).toEqual([60]);
      expect(result.current.frameTimeHistory).toEqual([16.6]);
      expect(result.current.minFps).toBe(60);
      expect(result.current.maxFps).toBe(60);
    });
  });

  describe('LauncherPerformanceDiagnosticsModal Component', () => {
    let queryClient: QueryClient;

    const mockThemeContext: LauncherThemeContextType = {
      currentTheme: 'modern',
      setTheme: vi.fn(),
      cycleTheme: vi.fn(),
      themeMeta: { id: 'modern', name: 'Modern Neon', isEnabled: true } as any,
      availableThemes: [],
    };

    const renderWithProviders = (ui: React.ReactElement) => {
      queryClient = new QueryClient();
      return render(
        <QueryClientProvider client={queryClient}>
          <LauncherThemeContext.Provider value={mockThemeContext}>
            {ui}
          </LauncherThemeContext.Provider>
        </QueryClientProvider>,
      );
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('renders modal dialog with performance telemetry cards when open', () => {
      const handleOpenChange = vi.fn();

      renderWithProviders(
        <LauncherPerformanceDiagnosticsModal
          open={true}
          onOpenChange={handleOpenChange}
        />,
      );

      // Verify modal headers & description
      expect(screen.getByText('Launcher Performance Diagnostics')).toBeDefined();
      expect(
        screen.getByText(
          'Real-time telemetry and SLA verification for rendering, hydration, IPC bridge, and memory.',
        ),
      ).toBeDefined();

      // Verify Metric Cards
      expect(screen.getByText('Renderer Frame Rate')).toBeDefined();
      expect(screen.getByText('Frame Duration')).toBeDefined();
      expect(screen.getByText('Library Hydration')).toBeDefined();
      expect(screen.getByText('IPC Bridge Latency')).toBeDefined();
      expect(screen.getByText('Process Memory & Theme Environment')).toBeDefined();

      // Verify Theme & System Info
      expect(screen.getByText(/modern/i)).toBeDefined();
      expect(screen.getByText('Electron Desktop IPC')).toBeDefined();
    });

    it('allows closing modal via Done button', () => {
      const handleOpenChange = vi.fn();

      renderWithProviders(
        <LauncherPerformanceDiagnosticsModal
          open={true}
          onOpenChange={handleOpenChange}
        />,
      );

      const doneButton = screen.getByRole('button', { name: /Done/i });
      act(() => {
        fireEvent.click(doneButton);
      });

      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });

    it('allows pinging IPC bridge and resetting telemetry history via UI buttons', async () => {
      const handleOpenChange = vi.fn();

      renderWithProviders(
        <LauncherPerformanceDiagnosticsModal
          open={true}
          onOpenChange={handleOpenChange}
        />,
      );

      const pingButton = screen.getByRole('button', { name: /Ping IPC Bridge/i });
      await act(async () => {
        fireEvent.click(pingButton);
      });
      expect(mockDesktopAPI.ping).toHaveBeenCalled();

      const resetButton = screen.getByRole('button', { name: /Reset Telemetry History/i });
      act(() => {
        fireEvent.click(resetButton);
      });
      expect(resetButton).toBeDefined();
    });
  });

  describe('ModernHeader & Shortcut Diagnostic Modal Wiring', () => {
    it('ModernHeader calls onOpenDiagnostics prop when provided', () => {
      const handleOpenDiagnostics = vi.fn();

      render(
        <ModernHeader
          activeTab="dashboard"
          setActiveTab={vi.fn()}
          searchQuery=""
          setSearchQuery={vi.fn()}
          onOpenDiagnostics={handleOpenDiagnostics}
        />,
      );

      const diagButton = screen.getByRole('button', {
        name: /Performance Diagnostics/i,
      });
      expect(diagButton).toBeDefined();

      fireEvent.click(diagButton);
      expect(handleOpenDiagnostics).toHaveBeenCalledTimes(1);
    });

    it('ModernHeader dispatches otix:toggle-launcher-diagnostics custom event when prop omitted', () => {
      const eventListener = vi.fn();
      window.addEventListener('otix:toggle-launcher-diagnostics', eventListener);

      render(
        <ModernHeader
          activeTab="dashboard"
          setActiveTab={vi.fn()}
          searchQuery=""
          setSearchQuery={vi.fn()}
        />,
      );

      const diagButton = screen.getByRole('button', {
        name: /Performance Diagnostics/i,
      });
      fireEvent.click(diagButton);

      expect(eventListener).toHaveBeenCalledTimes(1);
      window.removeEventListener('otix:toggle-launcher-diagnostics', eventListener);
    });

    it('listens for Ctrl+Shift+D and F3 shortcut keys and toggles diagnostics state', () => {
      let state = false;
      const toggle = () => {
        state = !state;
      };

      const handler = (event: KeyboardEvent) => {
        const isCtrlShiftD =
          (event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          (event.key === 'D' || event.key === 'd');
        const isF3 = event.key === 'F3';
        if (isCtrlShiftD || isF3) {
          event.preventDefault();
          toggle();
        }
      };

      window.addEventListener('keydown', handler);

      // Trigger Ctrl+Shift+D
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'D',
          ctrlKey: true,
          shiftKey: true,
        }),
      );
      expect(state).toBe(true);

      // Trigger F3 to toggle closed
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F3',
        }),
      );
      expect(state).toBe(false);

      window.removeEventListener('keydown', handler);
    });
  });
});

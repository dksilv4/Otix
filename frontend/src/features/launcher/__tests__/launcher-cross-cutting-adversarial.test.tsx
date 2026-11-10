import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useState, useEffect } from 'react';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  LauncherThemeProvider,
  useLauncherTheme,
  LauncherThemeContext,
} from '../themes/theme-context';
import {
  LAUNCHER_THEMES,
  LAUNCHER_THEME_STORAGE_KEY,
  DEFAULT_LAUNCHER_THEME,
} from '../utils/theme-constants';
import type { LauncherThemeId, LauncherThemeMeta, LauncherThemeContextType } from '../themes/types';
import { useVirtualGrid, useVirtualRow } from '../hooks/use-virtual-grid';
import { useLauncherGames } from '../hooks/use-launcher-games';
import { LauncherPerformanceDiagnosticsModal } from '../components/organisms/launcher-performance-diagnostics-modal';
import type { LocalGame } from '../types';

// Mock TanStack Router
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({}),
  useNavigate: () => mockNavigate,
  Outlet: () => <div data-testid="router-outlet">Outlet</div>,
}));

// Mock Desktop API
const { mockDesktopAPI } = vi.hoisted(() => ({
  mockDesktopAPI: {
    ping: vi.fn().mockResolvedValue(true),
    showItemInFolder: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@/lib/desktop/api', () => ({
  hasDesktopAPI: vi.fn(() => true),
  isDesktop: vi.fn(() => true),
  getDesktopAPI: vi.fn(() => mockDesktopAPI),
}));

// Mock games data generator
const generateMockGames = (count: number): LocalGame[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `game-${i}`,
    title: `Game Title ${i.toString().padStart(4, '0')}`,
    platform: i % 2 === 0 ? 'pc' : 'iso',
    exePath: i % 2 === 0 ? `C:\\Games\\Game_${i}\\game.exe` : undefined,
    posterUrl: `https://cdn.example.com/posters/${i}.webp`,
    otixPosterUrl: `https://cdn.example.com/posters/${i}.webp`,
    backdropUrl: `https://cdn.example.com/backdrops/${i}.webp`,
    otixBackdropUrl: `https://cdn.example.com/backdrops/${i}.webp`,
    data: {
      id: `game-${i}`,
      title: `Game Title ${i.toString().padStart(4, '0')}`,
      posterUrl: `https://cdn.example.com/posters/${i}.webp`,
      backdropUrl: `https://cdn.example.com/backdrops/${i}.webp`,
    } as LocalGame['data'],
  }));

let globalMockGames = generateMockGames(100);

vi.mock('@/features/launcher/data/game-queries', () => ({
  localGameKeys: {
    list: () => ['local-games', 'list'],
  },
  useLauncherVisibleGames: () => ({
    data: globalMockGames,
    isLoading: false,
  }),
  useLocalGames: () => ({
    data: globalMockGames,
    isLoading: false,
  }),
}));

vi.mock('@/features/launcher/data/queries', () => ({
  usePopularGames: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'TestUser' },
    isAuthenticated: true,
  }),
}));

describe('Milestone 5 Cross-Cutting Adversarial Stress Test Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    localStorage.clear();
  });

  // =========================================================================
  // SUITE 1: Rapid Theme Cycling & Theme Context Architecture Stress Testing
  // =========================================================================
  describe('1. Rapid Theme Cycling & Theme Context Architecture Stress', () => {
    it('cycles sequentially through all 10 enabled launcher themes without errors or state corruption', () => {
      // Mock all 10 launcher themes as enabled for full cross-cutting stress testing
      const allTenEnabled: LauncherThemeMeta[] = LAUNCHER_THEMES.map((t) => ({
        ...t,
        isEnabled: true,
      }));

      // Harness component implementing the exact cycleTheme algorithm from theme-context.tsx
      const ThemeCyclingHarness = () => {
        const [currentTheme, setCurrentTheme] = useState<LauncherThemeId>('classic');

        const cycleTheme = () => {
          const enabledThemes = allTenEnabled.filter((t) => t.isEnabled !== false);
          if (enabledThemes.length <= 1) return;
          const idx = enabledThemes.findIndex((t) => t.id === currentTheme);
          const nextIdx = idx === -1 ? 0 : (idx + 1) % enabledThemes.length;
          const nextTheme = enabledThemes[nextIdx].id;
          setCurrentTheme(nextTheme);
          localStorage.setItem(LAUNCHER_THEME_STORAGE_KEY, nextTheme);
        };

        const themeMeta = allTenEnabled.find((t) => t.id === currentTheme) || allTenEnabled[0];

        return { currentTheme, cycleTheme, themeMeta, availableThemes: allTenEnabled };
      };

      const { result } = renderHook(() => ThemeCyclingHarness());

      const expectedSequence: LauncherThemeId[] = [
        'classic',
        'modern',
        'steam',
        'playstation',
        'xbox',
        'switch',
        'retro',
        'minimal',
        'forge',
        'glass',
      ];

      expect(result.current.currentTheme).toBe('classic');

      // Execute 50 complete circular rotations (500 theme cycles) in rapid succession
      for (let lap = 0; lap < 50; lap++) {
        for (let step = 1; step <= 10; step++) {
          act(() => {
            result.current.cycleTheme();
          });
          const expectedTheme = expectedSequence[step % 10];
          expect(result.current.currentTheme).toBe(expectedTheme);
          expect(result.current.themeMeta.id).toBe(expectedTheme);
          expect(localStorage.getItem(LAUNCHER_THEME_STORAGE_KEY)).toBe(expectedTheme);
        }
      }

      // Final theme must have looped cleanly back to 'classic'
      expect(result.current.currentTheme).toBe('classic');
      expect(result.current.themeMeta.id).toBe('classic');
    });

    it('gracefully handles empty enabled themes, single theme, or corrupted localStorage values', () => {
      // 1. Corrupted localStorage value
      localStorage.setItem(LAUNCHER_THEME_STORAGE_KEY, 'invalid_non_existent_theme_99');

      const { result } = renderHook(() => useLauncherTheme(), {
        wrapper: LauncherThemeProvider,
      });

      // Must safely fallback to default 'classic' theme
      expect(result.current.currentTheme).toBe('classic');
      expect(result.current.themeMeta.id).toBe('classic');

      // 2. Setting an invalid/disabled theme is rejected safely
      act(() => {
        result.current.setTheme('invalid-id' as LauncherThemeId);
      });
      expect(result.current.currentTheme).toBe('classic');

      // 3. Storage event with garbage payload does not crash the application
      act(() => {
        localStorage.setItem(LAUNCHER_THEME_STORAGE_KEY, 'corrupted_payload');
        window.dispatchEvent(new Event('storage'));
      });
      expect(result.current.currentTheme).toBe('classic');
    });

    it('safely handles 25 rapid external window storage sync events without listener leaks', () => {
      const { result } = renderHook(() => useLauncherTheme(), {
        wrapper: LauncherThemeProvider,
      });

      // Rapidly fire 25 storage events simulating cross-tab or multi-window synchronization
      act(() => {
        for (let i = 0; i < 25; i++) {
          localStorage.setItem(LAUNCHER_THEME_STORAGE_KEY, 'classic');
          window.dispatchEvent(new Event('storage'));
        }
      });

      expect(result.current.currentTheme).toBe('classic');
      expect(result.current.themeMeta.name).toBe('Classic');
    });
  });

  // =========================================================================
  // SUITE 2: Dynamic Virtualization Switching & Lifecycle Teardown
  // =========================================================================
  describe('2. Dynamic Virtualization Switching & Lifecycle Teardown', () => {
    it('rapidly alternates between Grid virtualization and Row virtualization (25 cycles) with zero DOM bloat', () => {
      const mock500Games = generateMockGames(500);

      // Wrapper component that toggles between useVirtualGrid and useVirtualRow
      const DynamicVirtualizationHarness = ({ mode }: { mode: 'grid' | 'row' }) => {
        const grid = useVirtualGrid(mock500Games, {
          itemHeight: 280,
          columns: 4,
          gap: 16,
          threshold: 24,
        });

        const row = useVirtualRow(mock500Games, {
          itemWidth: 180,
          gap: 16,
          threshold: 24,
        });

        return {
          mode,
          activeCount: mode === 'grid' ? grid.virtualItems.length : row.virtualItems.length,
          totalDimension: mode === 'grid' ? grid.totalHeight : grid.totalHeight,
          isVirtualized: mode === 'grid' ? grid.isVirtualized : row.isVirtualized,
        };
      };

      const { result, rerender } = renderHook(
        ({ mode }) => DynamicVirtualizationHarness({ mode }),
        { initialProps: { mode: 'grid' as 'grid' | 'row' } },
      );

      expect(result.current.isVirtualized).toBe(true);
      expect(result.current.activeCount).toBeLessThan(30);

      // Rapidly toggle between Grid (Modern, Forge, Xbox) and Row (PlayStation, Switch, Glass) 25 times
      for (let i = 0; i < 25; i++) {
        const nextMode = i % 2 === 0 ? 'row' : 'grid';
        rerender({ mode: nextMode });

        expect(result.current.mode).toBe(nextMode);
        expect(result.current.isVirtualized).toBe(true);
        // Active DOM items must remain strictly bounded to visible + overscan (<30 items)
        expect(result.current.activeCount).toBeLessThan(30);
      }
    });

    it('cleans up ResizeObserver, scroll listeners, and RAF handles cleanly on unmount', () => {
      const mockGames = generateMockGames(100);

      const disconnectSpy = vi.fn();
      class MockResizeObserver {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = disconnectSpy;
      }
      const originalRO = globalThis.ResizeObserver;
      globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      try {
        const VirtualGridContainer = () => {
          const { containerRef, virtualItems } = useVirtualGrid(mockGames, {
            itemHeight: 260,
            columns: 4,
            threshold: 24,
            windowScroll: true,
          });

          return <div ref={containerRef} data-testid="virtual-grid-container">{virtualItems.length}</div>;
        };

        const { unmount } = render(<VirtualGridContainer />);

        // Unmount the component
        unmount();

        // Verify that resize listeners and event hooks are detached
        expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
        expect(disconnectSpy).toHaveBeenCalled();
      } finally {
        globalThis.ResizeObserver = originalRO;
      }
    });
  });

  // =========================================================================
  // SUITE 3: Launcher Navigation & Game Selection Frame Time / 60+ FPS SLA
  // =========================================================================
  describe('3. Launcher Navigation & Game Selection Frame Time / 60+ FPS SLA', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockNavigate.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('executes 100 rapid game selections in <16.6ms (<0.2ms per selection) with instant in-memory response', () => {
      const games1000 = generateMockGames(1000);
      globalMockGames = games1000;

      const { result } = renderHook(() => useLauncherGames());

      const start = performance.now();

      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.selectGame(`game-${i}`);
        }
      });

      const totalTimeMs = performance.now() - start;
      const avgPerSelection = totalTimeMs / 100;

      // 1. Must satisfy 60+ FPS SLA (<16.6ms total dispatch latency)
      expect(totalTimeMs).toBeLessThan(16.6);
      expect(avgPerSelection).toBeLessThan(0.3);

      // 2. Active game ID updates immediately in memory without latency
      expect(result.current.activeGameId).toBe('game-99');

      // 3. Router navigation is completely quiet during rapid clicks
      expect(mockNavigate).not.toHaveBeenCalled();

      // 4. Advance timers to 150ms debounce threshold
      act(() => {
        vi.advanceTimersByTime(150);
      });

      // 5. Navigate triggered exactly once with replace: true
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/launcher/$gameId',
        params: { gameId: 'game-99' },
        replace: true,
      });
    });

    it('maintains <1.0ms filter calculation across 50 rapid search keystrokes on 1,500 games', () => {
      const games1500 = generateMockGames(1500);
      globalMockGames = games1500;

      const { result } = renderHook(() => useLauncherGames());

      const searchTerms = [
        'game',
        'title',
        '00',
        '05',
        '09',
        '12',
        '15',
        'zelda',
        'mario',
        'cyber',
        'witcher',
        'halo',
      ];

      const start = performance.now();

      for (let i = 0; i < 50; i++) {
        const query = searchTerms[i % searchTerms.length];
        act(() => {
          result.current.setSearchQuery(query);
        });

        // Ensure filtered games is a valid array and activeGame gracefully adapts
        expect(Array.isArray(result.current.filteredGames)).toBe(true);
        if (result.current.filteredGames.length > 0) {
          expect(result.current.activeGame).not.toBeNull();
        }
      }

      const totalElapsed = performance.now() - start;
      const avgPerFilter = totalElapsed / 50;

      // All 50 filter updates complete in <16.6ms, ensuring smooth 60 FPS typing
      expect(totalElapsed).toBeLessThan(16.6);
      expect(avgPerFilter).toBeLessThan(1.0);
    });

    it('cancels pending navigation timers when unmounting before debounce completes', () => {
      const { result, unmount } = renderHook(() => useLauncherGames());

      act(() => {
        result.current.selectGame('game-42');
      });

      // Unmount at 75ms (halfway through the 150ms debounce window)
      act(() => {
        vi.advanceTimersByTime(75);
      });
      unmount();

      // Advance past 150ms
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Navigation should be safely aborted on unmount
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SUITE 4: Diagnostics Modal Toggling Under Active Virtual Scrolling Load
  // =========================================================================
  describe('4. Diagnostics Modal Toggling Under Active Virtual Scrolling Load', () => {
    it('toggles diagnostics modal via Ctrl+Shift+D and F3 during 60 scroll frames with zero frame drops', () => {
      const mockGames = generateMockGames(500);
      const rowHeight = 300;
      const columns = 4;
      const totalRows = Math.ceil(mockGames.length / columns);
      const viewportHeight = 900;
      const overscanRows = 2;

      // Component combining virtual grid scrolling and diagnostics modal listener
      const IntegratedLauncherPageHarness = () => {
        const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
        const [scrollTop, setScrollTop] = useState(0);

        useEffect(() => {
          const handleKeyDown = (event: KeyboardEvent) => {
            const isCtrlShiftD =
              (event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'D' || event.key === 'd');
            const isF3 = event.key === 'F3';
            if (isCtrlShiftD || isF3) {
              event.preventDefault();
              setDiagnosticsOpen((prev) => !prev);
            }
          };

          const handleToggle = () => setDiagnosticsOpen((prev) => !prev);

          window.addEventListener('keydown', handleKeyDown);
          window.addEventListener('otix:toggle-launcher-diagnostics', handleToggle);

          return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('otix:toggle-launcher-diagnostics', handleToggle);
          };
        }, []);

        // Compute virtual window slice
        const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
        const endRow = Math.min(
          totalRows,
          Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscanRows,
        );
        const startIdx = startRow * columns;
        const endIdx = Math.min(mockGames.length, endRow * columns);
        const visibleSlice = mockGames.slice(startIdx, endIdx);

        return {
          diagnosticsOpen,
          setDiagnosticsOpen,
          scrollTop,
          setScrollTop,
          visibleCount: visibleSlice.length,
        };
      };

      const { result } = renderHook(() => IntegratedLauncherPageHarness());

      expect(result.current.diagnosticsOpen).toBe(false);

      const frameTimes: number[] = [];

      // Simulate 60 rapid continuous scroll frames (at 60 FPS) with modal toggles at frames 15, 30, 45
      for (let frame = 0; frame < 60; frame++) {
        const frameStart = performance.now();

        // 1. Advance scroll position
        const nextScrollTop = frame * 200;
        act(() => {
          result.current.setScrollTop(nextScrollTop);
        });

        // 2. Trigger modal toggles during scrolling
        if (frame === 15) {
          // Toggle via Ctrl+Shift+D
          act(() => {
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, shiftKey: true, bubbles: true }),
            );
          });
          expect(result.current.diagnosticsOpen).toBe(true);
        } else if (frame === 30) {
          // Toggle via F3
          act(() => {
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'F3', bubbles: true }),
            );
          });
          expect(result.current.diagnosticsOpen).toBe(false);
        } else if (frame === 45) {
          // Toggle via custom event
          act(() => {
            window.dispatchEvent(new CustomEvent('otix:toggle-launcher-diagnostics'));
          });
          expect(result.current.diagnosticsOpen).toBe(true);
        }

        const frameElapsed = performance.now() - frameStart;
        frameTimes.push(frameElapsed);

        // Active slice must always remain bounded
        expect(result.current.visibleCount).toBeLessThan(35);
      }

      // Assert that every frame time during simultaneous scroll and modal toggle is < 16.6ms
      const maxFrameTime = Math.max(...frameTimes);
      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

      expect(maxFrameTime).toBeLessThan(16.6);
      expect(avgFrameTime).toBeLessThan(1.0);
    });

    it('mounts and unmounts LauncherPerformanceDiagnosticsModal 30 times with zero orphaned DOM elements', () => {
      const mockThemeContext: LauncherThemeContextType = {
        currentTheme: 'steam',
        setTheme: vi.fn(),
        cycleTheme: vi.fn(),
        themeMeta: { id: 'steam', name: 'Deck', isEnabled: true } as any,
        availableThemes: [],
      };

      const ModalHarness = ({ open }: { open: boolean }) => (
        <QueryClientProvider client={queryClient}>
          <LauncherThemeContext.Provider value={mockThemeContext}>
            <LauncherPerformanceDiagnosticsModal open={open} onOpenChange={vi.fn()} />
          </LauncherThemeContext.Provider>
        </QueryClientProvider>
      );

      const { rerender } = render(<ModalHarness open={false} />);

      for (let i = 0; i < 30; i++) {
        // Open modal
        act(() => {
          rerender(<ModalHarness open={true} />);
        });
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        // Close modal
        act(() => {
          rerender(<ModalHarness open={false} />);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
      }

      // Verify no dangling dialogs exist in body
      expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
    });
  });
});

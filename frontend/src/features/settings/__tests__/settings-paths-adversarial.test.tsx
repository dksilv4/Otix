import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PathFolderCard } from '../components/molecules/path-folder-card'
import { SettingsPathsSection } from '../components/organisms/settings-paths-section'
import { clearDesktopAPICache } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string') {
        if (url.includes('/libraries')) {
          return Promise.resolve({
            data: [{ path: 'C:\\Games\\Steam', type: 'game' }],
          })
        }
        if (url.includes('/scan')) {
          return Promise.resolve({
            data: { phase: 'completed', total_files: 5, files_scanned: 5, is_scanning: false },
          })
        }
      }
      return Promise.resolve({ data: {} })
    }),
    post: vi.fn().mockResolvedValue({ data: { count: 5, written: 5, matched: 5 } }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}))

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: [], isLoading: false }),
}))

vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({
    config: {
      id: 'default',
      userId: '1',
      downloadPath: '/server/isos',
      autoOrganizeEnabled: true,
    },
    saveConfig: vi.fn().mockResolvedValue({}),
    isLoading: false,
  }),
}))

const createDefaultFolderItem = (overrides?: Partial<any>) => ({
  path: '/Users/test/Games',
  name: 'Games',
  isInstallation: true,
  isGamesDownload: false,
  isIso: false,
  ...overrides,
})

describe('Adversarial & Stress Tests: PathFolderCard & Watcher Integration', () => {
  const defaultHandlers = {
    onToggleInstallation: vi.fn(),
    onAssignDownload: vi.fn(),
    onToggleIso: vi.fn(),
    onRemove: vi.fn(),
    onCopyPath: vi.fn(),
    onRescan: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─────────────────────────────────────────────────────────────
  // 1. Folder Card Edge Cases
  // ─────────────────────────────────────────────────────────────
  describe('Edge Cases: empty path, long path, Samba URIs, missing status props', () => {
    it('handles empty path string ("") gracefully without crashing', () => {
      const emptyItem = createDefaultFolderItem({ path: '', name: 'Empty Path' })
      expect(() => {
        render(<PathFolderCard item={emptyItem} {...defaultHandlers} />)
      }).not.toThrow()

      const storageBadge = screen.getByTestId('storage-kind-badge')
      expect(storageBadge).toHaveTextContent('Local')

      const watcherBadge = screen.getByTestId('watcher-status-badge')
      expect(watcherBadge).toHaveTextContent('Watching')
    })

    it('handles extremely long paths (500+ characters) with proper truncation and tooltip title', () => {
      const longDir = 'a'.repeat(550)
      const longPath = `/volumes/very_deep_mount_storage/${longDir}/game_directory`
      const longItem = createDefaultFolderItem({ path: longPath, name: 'Deep Storage Game' })

      render(<PathFolderCard item={longItem} {...defaultHandlers} />)

      const pathElement = screen.getByTitle(longPath)
      expect(pathElement).toBeInTheDocument()
      expect(pathElement.className).toContain('truncate')
      expect(pathElement.textContent).toBe(longPath)
      expect(pathElement.textContent?.length).toBeGreaterThan(500)
    })

    it('handles copy and rescan callbacks accurately with 500+ character path', async () => {
      const user = userEvent.setup()
      const longDir = 'x'.repeat(520)
      const longPath = `smb://nas.storage.internal/shares/${longDir}/roms`
      const onCopyPath = vi.fn()
      const onRescan = vi.fn()
      const longItem = createDefaultFolderItem({ path: longPath, name: 'Long Samba' })

      render(
        <PathFolderCard
          item={longItem}
          {...defaultHandlers}
          onCopyPath={onCopyPath}
          onRescan={onRescan}
        />,
      )

      const copyBtn = screen.getByRole('button', { name: /copy path/i })
      await user.click(copyBtn)
      expect(onCopyPath).toHaveBeenCalledWith(longPath)

      const rescanBtn = screen.getByRole('button', { name: /rescan & match metadata/i })
      await user.click(rescanBtn)
      expect(onRescan).toHaveBeenCalledWith(longPath)
    })

    describe('Unusual Samba / Network URIs', () => {
      const testCases = [
        {
          uri: 'smb://user:pass@host/share',
          desc: 'standard Samba URI with embedded user:pass credentials',
        },
        {
          uri: 'smb://DOMAIN;user:P@ssw0rd!#%@192.168.1.100:445/games_share/subfolder',
          desc: 'Samba URI with Windows domain, special characters in password, and custom port',
        },
        {
          uri: 'SMB://CAPITALIZED_HOST.LOCAL/SHARE_PATH',
          desc: 'uppercase SMB protocol prefix',
        },
        {
          uri: '//linux-samba-box/games/repacks',
          desc: 'forward-slash double-slash network share path',
        },
        {
          uri: '\\\\windows-nas\\storage\\games',
          desc: 'standard Windows UNC path with backslashes',
        },
        {
          uri: 'smb://guest:@nas/public',
          desc: 'guest credentials with empty password',
        },
      ]

      testCases.forEach(({ uri, desc }) => {
        it(`correctly recognizes ${desc} as Network / Samba`, () => {
          const item = createDefaultFolderItem({ path: uri, name: 'Network Share' })
          render(<PathFolderCard item={item} {...defaultHandlers} />)

          const badge = screen.getByTestId('storage-kind-badge')
          expect(badge).toHaveTextContent('Network / Samba')
          expect(badge).not.toHaveTextContent('Local')
        })
      })
    })

    describe('Missing status props and nullish safety', () => {
      it('safely defaults watcherStatus to "Watching" when props are undefined or missing', () => {
        const minimalItem = {
          path: '/var/games',
          name: 'games',
          isInstallation: false,
          isGamesDownload: false,
          isIso: false,
          // watcherStatus and isNetwork deliberately omitted
        }

        render(
          <PathFolderCard
            item={minimalItem}
            {...defaultHandlers}
            watcherStatus={undefined}
            isScanning={undefined}
            isNetwork={undefined}
          />,
        )

        const watcherBadge = screen.getByTestId('watcher-status-badge')
        expect(watcherBadge).toHaveTextContent('Watching')

        const storageBadge = screen.getByTestId('storage-kind-badge')
        expect(storageBadge).toHaveTextContent('Local')
      })

      it('safely handles empty string or unusual watcherStatus values without throwing', () => {
        const item = createDefaultFolderItem({ watcherStatus: 'CustomStatus' })
        render(<PathFolderCard item={item} {...defaultHandlers} />)

        const watcherBadge = screen.getByTestId('watcher-status-badge')
        expect(watcherBadge).toHaveTextContent('CustomStatus')
      })
    })
  })

  // ─────────────────────────────────────────────────────────────
  // 2. Rapid Click Stress & Concurrency Protection
  // ─────────────────────────────────────────────────────────────
  describe('Rapid Click Stress: duplicate request prevention & unhandled promise rejection checks', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    beforeEach(() => {
      clearDesktopAPICache()
      vi.clearAllMocks()
      localStorage.clear()
    })

    it('rapid userEvent clicks on PathFolderCard trigger onRescan only once while scan is pending', async () => {
      const user = userEvent.setup()
      let isScanningState = false
      const onRescan = vi.fn().mockImplementation(() => {
        isScanningState = true
      })

      const item = createDefaultFolderItem({ path: '/mnt/games/rpg', name: 'RPG' })
      const { rerender } = render(
        <PathFolderCard
          item={item}
          {...defaultHandlers}
          onRescan={onRescan}
          isScanning={isScanningState}
        />,
      )

      const rescanBtn = screen.getByRole('button', { name: /rescan & match metadata/i })

      // First click
      await user.click(rescanBtn)
      expect(onRescan).toHaveBeenCalledTimes(1)

      // Re-render reflecting isScanning: true
      rerender(
        <PathFolderCard
          item={item}
          {...defaultHandlers}
          onRescan={onRescan}
          isScanning={true}
        />,
      )

      // The button is now disabled; subsequent clicks must not trigger onRescan
      expect(rescanBtn).toBeDisabled()
      await user.click(rescanBtn).catch(() => {})
      await user.click(rescanBtn).catch(() => {})
      await user.click(rescanBtn).catch(() => {})

      expect(onRescan).toHaveBeenCalledTimes(1)
    })

    it('SettingsPathsSection with remote node: rapid clicks do not trigger duplicate network requests or unhandled rejections', async () => {
      const user = userEvent.setup()
      let postCallCount = 0

      // Add 100ms artificial delay to simulate network latency
      vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('/scan')) {
          postCallCount++
          await new Promise((resolve) => setTimeout(resolve, 100))
          return { data: { count: 3, status: 'started' } }
        }
        if (typeof url === 'string' && url.includes('/otix/sync')) {
          return { data: { written: 3, matched: 3 } }
        }
        return { data: {} }
      })

      ;(window as any).desktopAPI = {
        getScanPaths: vi.fn().mockResolvedValue([
          { path: 'C:\\Games\\Steam', type: 'game' },
        ]),
        saveScanPaths: vi.fn().mockResolvedValue(undefined),
        scanPaths: vi.fn().mockResolvedValue([]),
        getDesktopSettings: vi.fn().mockResolvedValue({
          gamesDownloadPath: '',
          gamesInstallPath: '',
        }),
        setDesktopSettings: vi.fn().mockResolvedValue({}),
        selectDirectory: vi.fn().mockResolvedValue(null),
      }

      render(
        <QueryClientProvider client={queryClient}>
          <SettingsPathsSection nodeId={42} />
        </QueryClientProvider>,
      )

      await waitFor(() => {
        expect(screen.getByText('Steam')).toBeInTheDocument()
      })

      const rescanButtons = screen.getAllByRole('button', { name: /rescan & match metadata/i })
      expect(rescanButtons.length).toBeGreaterThan(0)
      const rescanBtn = rescanButtons[0]

      // Rapidly fire 5 clicks using userEvent (simulating frantic user double/triple-clicking)
      await Promise.allSettled([
        user.click(rescanBtn),
        user.click(rescanBtn),
        user.click(rescanBtn),
        user.click(rescanBtn),
        user.click(rescanBtn),
      ])

      // Wait for scan operation to finish
      await waitFor(
        () => {
          expect(postCallCount).toBe(1)
        },
        { timeout: 3000 },
      )

      // Verify apiClient.post for /scan was called exactly once, preventing duplicate scans
      const scanPosts = vi.mocked(apiClient.post).mock.calls.filter(([url]) =>
        typeof url === 'string' && url.includes('/scan') && !url.includes('/clear'),
      )
      expect(scanPosts.length).toBe(1)
    })

    it('SettingsPathsSection desktop mode: rapid clicks do not trigger duplicate desktopAPI.scanPaths calls', async () => {
      const user = userEvent.setup()
      let desktopScanCount = 0

      ;(window as any).desktopAPI = {
        getScanPaths: vi.fn().mockResolvedValue([
          { path: 'C:\\Games\\Steam', type: 'game' },
        ]),
        saveScanPaths: vi.fn().mockResolvedValue(undefined),
        scanPaths: vi.fn().mockImplementation(async () => {
          desktopScanCount++
          await new Promise((resolve) => setTimeout(resolve, 100))
          return []
        }),
        getDesktopSettings: vi.fn().mockResolvedValue({
          gamesDownloadPath: '',
          gamesInstallPath: '',
        }),
        setDesktopSettings: vi.fn().mockResolvedValue({}),
        selectDirectory: vi.fn().mockResolvedValue(null),
      }

      render(
        <QueryClientProvider client={queryClient}>
          <SettingsPathsSection />
        </QueryClientProvider>,
      )

      await waitFor(() => {
        expect(screen.getByText('Steam')).toBeInTheDocument()
      })

      const rescanButtons = screen.getAllByRole('button', { name: /rescan & match metadata/i })
      const rescanBtn = rescanButtons[0]

      // Rapid clicks
      await Promise.allSettled([
        user.click(rescanBtn),
        user.click(rescanBtn),
        user.click(rescanBtn),
      ])

      await waitFor(() => {
        expect(desktopScanCount).toBe(1)
      })

      expect((window as any).desktopAPI.scanPaths).toHaveBeenCalledTimes(1)
    })

    it('gracefully handles API network error during rescan without unhandled promise rejections', async () => {
      const user = userEvent.setup()
      const unhandledRejections: any[] = []
      const rejectionHandler = (event: PromiseRejectionEvent) => {
        unhandledRejections.push(event.reason)
      }
      window.addEventListener('unhandledrejection', rejectionHandler)

      try {
        vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
          if (typeof url === 'string' && url.includes('/scan')) {
            throw new Error('Connection refused: remote daemon unreachable')
          }
          return { data: {} }
        })

        ;(window as any).desktopAPI = {
          getScanPaths: vi.fn().mockResolvedValue([
            { path: 'C:\\Games\\Steam', type: 'game' },
          ]),
          saveScanPaths: vi.fn().mockResolvedValue(undefined),
          scanPaths: vi.fn().mockResolvedValue([]),
          getDesktopSettings: vi.fn().mockResolvedValue({
            gamesDownloadPath: '',
            gamesInstallPath: '',
          }),
          setDesktopSettings: vi.fn().mockResolvedValue({}),
          selectDirectory: vi.fn().mockResolvedValue(null),
        }

        render(
          <QueryClientProvider client={queryClient}>
            <SettingsPathsSection nodeId={99} />
          </QueryClientProvider>,
        )

        await waitFor(() => {
          expect(screen.getByText('Steam')).toBeInTheDocument()
        })

        const rescanButtons = screen.getAllByRole('button', { name: /rescan & match metadata/i })
        await user.click(rescanButtons[0])

        await waitFor(() => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: 'Scan Failed',
              description: expect.stringContaining('Connection refused'),
              variant: 'error',
            }),
          )
        })

        // Verify zero unhandled promise rejections occurred
        expect(unhandledRejections).toHaveLength(0)

        // Verify UI recovered and is not stuck in scanning state
        const rescanBtn = screen.getAllByRole('button', { name: /rescan & match metadata/i })[0]
        expect(rescanBtn).not.toBeDisabled()
      } finally {
        window.removeEventListener('unhandledrejection', rejectionHandler)
      }
    })

    it('gracefully handles desktopAPI.scanPaths failure without unhandled rejections and recovers UI', async () => {
      const user = userEvent.setup()
      const unhandledRejections: any[] = []
      const rejectionHandler = (event: PromiseRejectionEvent) => {
        unhandledRejections.push(event.reason)
      }
      window.addEventListener('unhandledrejection', rejectionHandler)

      try {
        ;(window as any).desktopAPI = {
          getScanPaths: vi.fn().mockResolvedValue([
            { path: 'C:\\Games\\Steam', type: 'game' },
          ]),
          saveScanPaths: vi.fn().mockResolvedValue(undefined),
          scanPaths: vi.fn().mockRejectedValue(new Error('Permission denied accessing path')),
          getDesktopSettings: vi.fn().mockResolvedValue({
            gamesDownloadPath: '',
            gamesInstallPath: '',
          }),
          setDesktopSettings: vi.fn().mockResolvedValue({}),
          selectDirectory: vi.fn().mockResolvedValue(null),
        }

        render(
          <QueryClientProvider client={queryClient}>
            <SettingsPathsSection />
          </QueryClientProvider>,
        )

        await waitFor(() => {
          expect(screen.getByText('Steam')).toBeInTheDocument()
        })

        const rescanButtons = screen.getAllByRole('button', { name: /rescan & match metadata/i })
        await user.click(rescanButtons[0])

        await waitFor(() => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: 'Scan Failed',
              description: expect.stringContaining('Permission denied'),
              variant: 'error',
            }),
          )
        })

        expect(unhandledRejections).toHaveLength(0)

        // Verify UI recovered
        const rescanBtn = screen.getAllByRole('button', { name: /rescan & match metadata/i })[0]
        expect(rescanBtn).not.toBeDisabled()
      } finally {
        window.removeEventListener('unhandledrejection', rejectionHandler)
      }
    })
  })

  // ─────────────────────────────────────────────────────────────
  // 3. UI/UX Conformance & Design Token Checks
  // ─────────────────────────────────────────────────────────────
  describe('UI/UX Conformance & Design Token Checks', () => {
    it('adheres to soft glassmorphic visual language with no harsh borders or raw color literals', () => {
      const item = createDefaultFolderItem()
      const { container } = render(<PathFolderCard item={item} {...defaultHandlers} />)

      const card = container.firstChild as HTMLElement
      expect(card).toBeInTheDocument()

      // Must have glassmorphic backdrop and soft token
      expect(card.className).toContain('bg-[var(--dk-surface-glass)]')
      expect(card.className).toContain('backdrop-blur-xl')

      // Must NOT have harsh borders like border-border or solid opaque borders
      expect(card.className).not.toContain('border-border')
      expect(card.className).not.toContain('border-[var(--dk-separator)]')

      // Micro-border allowed
      expect(card.className).toContain('border-white/[0.04]')

      // Zero arbitrary decorative dots or pinging bubbles before text labels
      expect(container.querySelector('.animate-ping')).toBeNull()

      // Semantic tokens check
      const badges = screen.getAllByTestId(/badge/)
      badges.forEach((badge) => {
        expect(badge.className).not.toContain('bg-emerald')
        expect(badge.className).not.toContain('bg-green')
        expect(badge.className).not.toContain('text-white')
        expect(badge.className).toContain('text-primary')
      })
    })
  })
})

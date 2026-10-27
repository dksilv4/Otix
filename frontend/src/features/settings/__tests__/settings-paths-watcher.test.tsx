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

const createFolderItem = (overrides?: Partial<any>) => ({
  path: '/Users/test/Games',
  name: 'Games',
  isInstallation: true,
  isGamesDownload: false,
  isIso: false,
  ...overrides,
})

describe('PathFolderCard - Storage Kind, Watcher & Rescan', () => {
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

  describe('Storage kind badge', () => {
    it('renders "Local" badge for standard local path', () => {
      const item = createFolderItem({ path: '/Users/otix/Games', name: 'Games' })
      render(<PathFolderCard item={item} {...defaultHandlers} />)

      const badge = screen.getByTestId('storage-kind-badge')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent('Local')
      expect(badge).not.toHaveTextContent('Network / Samba')
    })

    it('renders "Network / Samba" badge for Windows UNC share path (\\\\)', () => {
      const item = createFolderItem({
        path: '\\\\192.168.1.150\\Games\\Share',
        name: 'Share',
      })
      render(<PathFolderCard item={item} {...defaultHandlers} />)

      const badge = screen.getByTestId('storage-kind-badge')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent('Network / Samba')
    })

    it('renders "Network / Samba" badge for SMB protocol URI (smb://)', () => {
      const item = createFolderItem({
        path: 'smb://nas.local/media/roms',
        name: 'roms',
      })
      render(<PathFolderCard item={item} {...defaultHandlers} />)

      const badge = screen.getByTestId('storage-kind-badge')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent('Network / Samba')
    })

    it('renders "Network / Samba" badge when isNetwork flag is true on item or prop', () => {
      const item = createFolderItem({
        path: '/mnt/storage/games',
        name: 'games',
        isNetwork: true,
      })
      const { rerender } = render(<PathFolderCard item={item} {...defaultHandlers} />)

      expect(screen.getByTestId('storage-kind-badge')).toHaveTextContent('Network / Samba')

      // Also via explicit prop
      const localItem = createFolderItem({ path: '/mnt/storage/games', name: 'games' })
      rerender(<PathFolderCard item={localItem} isNetwork={true} {...defaultHandlers} />)
      expect(screen.getByTestId('storage-kind-badge')).toHaveTextContent('Network / Samba')
    })
  })

  describe('Directory watcher status badge', () => {
    it('renders "Watching" by default using semantic tokens without pinging dots', () => {
      const item = createFolderItem()
      const { container } = render(<PathFolderCard item={item} {...defaultHandlers} />)

      const badge = screen.getByTestId('watcher-status-badge')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent('Watching')

      // Must use semantic tokens
      expect(badge.className).toContain('bg-primary/10')
      expect(badge.className).toContain('text-primary')

      // Must NOT contain arbitrary pinging dots or raw palette classes
      expect(container.querySelector('.animate-ping')).toBeNull()
      expect(badge.className).not.toContain('bg-emerald')
      expect(badge.className).not.toContain('bg-green')
    })

    it('renders "Active" when watcherStatus is explicitly provided', () => {
      const item = createFolderItem({ watcherStatus: 'Active' })
      render(<PathFolderCard item={item} {...defaultHandlers} />)

      const badge = screen.getByTestId('watcher-status-badge')
      expect(badge).toHaveTextContent('Active')
      expect(badge.className).toContain('bg-primary/10')
      expect(badge.className).toContain('text-primary')
    })

    it('renders "Indexing" when isScanning is true', () => {
      const item = createFolderItem()
      render(<PathFolderCard item={item} isScanning={true} {...defaultHandlers} />)

      const badge = screen.getByTestId('watcher-status-badge')
      expect(badge).toHaveTextContent('Indexing')
      expect(badge.className).toContain('bg-primary/10')
      expect(badge.className).toContain('text-primary')
    })
  })

  describe('"Rescan & Match Metadata" action button', () => {
    it('renders "Rescan & Match Metadata" button and triggers onRescan on click', async () => {
      const user = userEvent.setup()
      const onRescan = vi.fn()
      const item = createFolderItem({ path: 'D:\\Games\\Library', name: 'Library' })

      render(<PathFolderCard item={item} {...defaultHandlers} onRescan={onRescan} />)

      const rescanBtn = screen.getByRole('button', { name: /rescan & match metadata/i })
      expect(rescanBtn).toBeInTheDocument()

      await user.click(rescanBtn)
      expect(onRescan).toHaveBeenCalledTimes(1)
      expect(onRescan).toHaveBeenCalledWith('D:\\Games\\Library')
    })

    it('disables "Rescan & Match Metadata" button when isScanning is true', () => {
      const item = createFolderItem()
      render(<PathFolderCard item={item} isScanning={true} {...defaultHandlers} />)

      const rescanBtn = screen.getByRole('button', { name: /rescan & match metadata/i })
      expect(rescanBtn).toBeDisabled()
    })
  })
})

describe('SettingsPathsSection - Watcher & Rescan Integration', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  beforeEach(() => {
    clearDesktopAPICache()
    vi.clearAllMocks()
    localStorage.clear()
    ;(window as any).desktopAPI = {
      getScanPaths: vi.fn().mockResolvedValue([
        { path: 'C:\\Games\\Steam', type: 'game' },
        { path: '\\\\nas\\samba_games', type: 'game' },
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
  })

  it('renders both Local and Samba folder cards with watcher badges and rescan actions', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsPathsSection />
      </QueryClientProvider>,
    )

    // Wait for paths to load
    await waitFor(() => {
      expect(screen.getByText('Steam')).toBeInTheDocument()
      expect(screen.getByText('samba_games')).toBeInTheDocument()
    })

    const storageBadges = screen.getAllByTestId('storage-kind-badge')
    expect(storageBadges.length).toBeGreaterThanOrEqual(2)
    expect(storageBadges.some((b) => b.textContent?.includes('Local'))).toBe(true)
    expect(storageBadges.some((b) => b.textContent?.includes('Network / Samba'))).toBe(true)

    const watcherBadges = screen.getAllByTestId('watcher-status-badge')
    expect(watcherBadges.length).toBeGreaterThanOrEqual(2)
    expect(watcherBadges[0]).toHaveTextContent('Watching')
    expect(watcherBadges[0].className).toContain('text-primary')

    const rescanButtons = screen.getAllByRole('button', { name: /rescan & match metadata/i })
    expect(rescanButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('triggers specific path scan and metadata matching when folder rescan button is clicked', async () => {
    const user = userEvent.setup()
    const onScanComplete = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <SettingsPathsSection onScanComplete={onScanComplete} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Steam')).toBeInTheDocument()
    })

    const rescanButtons = screen.getAllByRole('button', { name: /rescan & match metadata/i })
    await user.click(rescanButtons[0])

    await waitFor(() => {
      expect((window as any).desktopAPI.scanPaths).toHaveBeenCalledWith(
        ['C:\\Games\\Steam'],
        [],
      )
      expect(onScanComplete).toHaveBeenCalled()
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Library Scanned',
          description: expect.stringContaining('Steam'),
          variant: 'success',
        }),
      )
    })
  })

  it('triggers remote node scan and metadata sidecar sync when connected to remote node', async () => {
    const user = userEvent.setup()
    const onScanComplete = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <SettingsPathsSection nodeId={42} onScanComplete={onScanComplete} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Steam')).toBeInTheDocument()
    })

    const rescanButtons = screen.getAllByRole('button', { name: /rescan & match metadata/i })
    await user.click(rescanButtons[0])

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/library/servers/42/scan',
        expect.objectContaining({ path: 'C:\\Games\\Steam' }),
      )
      expect(apiClient.post).toHaveBeenCalledWith(
        '/library/servers/42/otix/sync',
        expect.objectContaining({
          writeOtix: true,
          path: 'C:\\Games\\Steam',
        }),
      )
      expect(onScanComplete).toHaveBeenCalled()
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsDownloadsPage } from '../pages/settings-downloads-page'

// Mock dependencies
vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, hash, ...props }: any) => {
    let href = String(to ?? '')
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, String(value))
      }
    }
    if (hash) href = `${href}#${hash}`
    return <a href={href} {...props}>{children}</a>
  },
  useLocation: () => ({ href: '/settings/downloads' }),
  useNavigate: () => mockNavigate,
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({
    config: {
      id: 'default',
      downloadPath: '/downloads',
      postProcessEnabled: true,
      autoSearchWishlist: false,
      wishlistIntervalHours: 12,
      allowHypervisor: false,
    },
    isLoading: false,
    updateConfig: { mutateAsync: vi.fn() },
  }),
  useDownloads: () => ({ downloads: [], isLoading: false, cancelDownload: vi.fn() }),
}))

let mockGameServers: any[] = [
  { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.100:8090', isOnline: true },
]

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
  useCreateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePingGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClaimGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProbeGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePendingGameServers: () => ({ data: [], isLoading: false }),
  useUnclaimLocalNode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnclaimGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/features/downloads/use-server-usenet', () => ({
  useServerUsenetConfig: () => ({
    data: {
      sabnzbd: {
        host: '192.168.1.100',
        port: 8080,
        category: 'games',
        configured: true,
      },
    },
    isLoading: false,
  }),
  useTestSabnzbd: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveServerSabnzbdConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import { SettingsSaveProvider } from '../context/settings-save-context'
import { clearDesktopAPICache } from '@/lib/desktop/api'

describe('SettingsDownloadsPage Manage Downloaders', () => {
  beforeEach(() => {
    clearDesktopAPICache()
    vi.clearAllMocks()
    localStorage.clear()
    ;(window as any).desktopAPI = {
      getScanPaths: vi.fn().mockResolvedValue([]),
      saveScanPaths: vi.fn().mockResolvedValue(undefined),
      scanPaths: vi.fn().mockResolvedValue([]),
      getDesktopSettings: vi.fn().mockResolvedValue({ gamesDownloadPath: '' }),
      saveDesktopSettings: vi.fn().mockResolvedValue(undefined),
      downloadsGetPathMappings: vi.fn().mockResolvedValue([]),
      downloadsAddPathMapping: vi.fn().mockResolvedValue(undefined),
      downloadsRemovePathMapping: vi.fn().mockResolvedValue(undefined),
    }
    mockGameServers = [
      { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.100:8090', isOnline: true },
    ]
  })

  it('renders correctly', () => {
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsDownloadsPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )
    expect(screen.getByText('Downloads')).toBeInTheDocument()
    expect(screen.getByText('Home Server')).toBeInTheDocument()
    expect(screen.getAllByText('Online').length).toBeGreaterThan(0)
  })

  it('opens Manage Downloaders modal with SABnzbd as the only downloader', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsDownloadsPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )
    const manageButtons = screen.getAllByRole('button', { name: /manage downloaders/i })
    expect(manageButtons.length).toBeGreaterThan(0)
    await user.click(manageButtons[0])

    expect(screen.getByRole('heading', { name: 'Manage Downloaders' })).toBeInTheDocument()
    expect(screen.getByText('Downloader client management')).toBeInTheDocument()

    expect(screen.getByText('SABnzbd Downloader')).toBeInTheDocument()
    expect(screen.queryByText('Prowlarr')).not.toBeInTheDocument()
    expect(screen.queryByText('Radarr')).not.toBeInTheDocument()
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: /configure client/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument()

    const goToConnectionsBtn = screen.getByRole('button', { name: /go to connections/i })
    await user.click(goToConnectionsBtn)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/connections' })
  })
})

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

const mockClaimMutateAsync = vi.fn().mockResolvedValue({ id: 5, name: 'Home Server', isOnline: true })
const mockProbeMutateAsync = vi.fn().mockResolvedValue({ remote_accessible: true, latency_ms: 25, tested_url: 'http://1.2.3.4:8090' })
let mockPendingNodes: any[] = []

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: [], isLoading: false }),
  useCreateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePingGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClaimGameServer: () => ({ mutateAsync: mockClaimMutateAsync, isPending: false }),
  useProbeGameServer: () => ({ mutateAsync: mockProbeMutateAsync, isPending: false }),
  usePendingGameServers: () => ({ data: mockPendingNodes, isLoading: false }),
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
    expect(screen.getByText('Otix backend')).toBeInTheDocument()
    expect(screen.getByText('Backend')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /explore/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ping/i })).not.toBeInTheDocument()
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

    // Verify standardized modal header and description
    expect(screen.getByRole('heading', { name: 'Manage Downloaders' })).toBeInTheDocument()
    expect(screen.getByText('Downloader client management')).toBeInTheDocument()

    // SABnzbd is the only downloader
    expect(screen.getByText('SABnzbd Downloader')).toBeInTheDocument()
    expect(screen.queryByText('Prowlarr')).not.toBeInTheDocument()
    expect(screen.queryByText('Radarr')).not.toBeInTheDocument()
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument()

    // Standard icon-based action buttons in downloader row card
    expect(screen.getByRole('button', { name: /configure client/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument()

    // Navigates to connections
    const goToConnectionsBtn = screen.getByRole('button', { name: /go to connections/i })
    await user.click(goToConnectionsBtn)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/connections' })
  })

  it('opens node settings as a page under /settings/nodes/:id', async () => {
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsDownloadsPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    expect(screen.getByRole('link', { name: /open otix backend/i })).toHaveAttribute(
      'href',
      '/settings/nodes/-2',
    )
  })

  it('renders claim with PIN tab when opening Connect node form', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsDownloadsPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    const connectButton = screen.getByRole('button', { name: /connect node/i })
    await user.click(connectButton)

    expect(screen.getByRole('button', { name: /claim with pin/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manual url & token/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('OTX-XXXX')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /claim & link node/i })).toBeInTheDocument()
  })

  it('renders detected unclaimed node banner and claims on click', async () => {
    mockPendingNodes = [
      {
        serverName: 'Unraid Tower',
        localUrl: 'http://192.168.1.150:8090',
        claimCode: 'OTX-9999',
        claimed: false,
      },
    ]

    const user = userEvent.setup()
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsDownloadsPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    expect(screen.getByText(/unclaimed otix node detected/i)).toBeInTheDocument()
    expect(screen.getByText(/PIN: OTX-9999/i)).toBeInTheDocument()

    const claimBtn = screen.getByRole('button', { name: /claim node/i })
    await user.click(claimBtn)

    expect(mockClaimMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        claim_code: 'OTX-9999',
        node_url: 'http://192.168.1.150:8090',
        server_name: 'Unraid Tower',
      }),
    )

    mockPendingNodes = []
  })

  it('opens Download Node modal when clicking Download node button', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsDownloadsPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    const downloadButtons = screen.getAllByRole('button', { name: /download node/i })
    expect(downloadButtons.length).toBeGreaterThan(0)
    await user.click(downloadButtons[0])

    expect(screen.getByRole('heading', { name: 'Download Otix Node' })).toBeInTheDocument()
    expect(screen.getByText('macOS')).toBeInTheDocument()
    expect(screen.getByText('Windows')).toBeInTheDocument()
    expect(screen.getByText('Otix-Node.dmg')).toBeInTheDocument()
    expect(screen.getByText('Otix-Node-Windows-x64.zip')).toBeInTheDocument()
  })
})


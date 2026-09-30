import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsNodesPage } from '../pages/settings-desktop-page'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { clearDesktopAPICache } from '@/lib/desktop/api'

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
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
  useLocation: () => ({ href: '/settings/nodes' }),
  useNavigate: () => mockNavigate,
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const mockClaimMutateAsync = vi.fn().mockResolvedValue({ id: 5, name: 'Home Server', isOnline: true })
const mockProbeMutateAsync = vi
  .fn()
  .mockResolvedValue({ remote_accessible: true, latency_ms: 25, tested_url: 'http://1.2.3.4:8090' })
let mockGameServers: any[] = [
  { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.100:8090', isOnline: true },
]
let mockPendingNodes: any[] = []

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
  useCreateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePingGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClaimGameServer: () => ({ mutateAsync: mockClaimMutateAsync, isPending: false }),
  useProbeGameServer: () => ({ mutateAsync: mockProbeMutateAsync, isPending: false }),
  usePendingGameServers: () => ({ data: mockPendingNodes, isLoading: false }),
}))

describe('SettingsNodesPage', () => {
  beforeEach(() => {
    clearDesktopAPICache()
    vi.clearAllMocks()
    localStorage.clear()
    mockPendingNodes = []
    mockGameServers = [
      { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.100:8090', isOnline: true },
    ]
  })

  it('renders page header with beta and under development tags', () => {
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsNodesPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Nodes' })).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Under development')).toBeInTheDocument()
    expect(screen.getByText('Home Server')).toBeInTheDocument()
  })

  it('opens node settings modal via Open button', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsNodesPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    await user.click(screen.getByRole('button', { name: /^open$/i }))
    expect(screen.getByRole('tab', { name: 'Paths' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Machine' })).toBeInTheDocument()
  })

  it('renders claim with PIN tab when opening Connect node modal', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsNodesPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    await user.click(screen.getByRole('button', { name: /^connect node$/i }))

    expect(screen.getByRole('heading', { name: 'Connect Otix Node' })).toBeInTheDocument()
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
          <SettingsNodesPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    expect(screen.getByText(/unclaimed otix node detected/i)).toBeInTheDocument()
    expect(screen.getByText(/PIN: OTX-9999/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /claim node/i }))

    expect(mockClaimMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        claim_code: 'OTX-9999',
        node_url: 'http://192.168.1.150:8090',
        server_name: 'Unraid Tower',
      }),
    )
  })

  it('opens Download Node modal when clicking Download button', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsNodesPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    await user.click(screen.getByRole('button', { name: /^download$/i }))

    expect(screen.getByRole('heading', { name: 'Download Otix Node' })).toBeInTheDocument()
    expect(screen.getByText('macOS')).toBeInTheDocument()
    expect(screen.getByText('Windows')).toBeInTheDocument()
    expect(screen.getByText('Otix-Node.dmg')).toBeInTheDocument()
    expect(screen.getByText('Otix-Node-Windows-x64.zip')).toBeInTheDocument()
  })
})
